// src/mcp/server.ts —— SafeAgent 工具包 MCP Server（stdio 传输）
// 暴露研判、案例检索、沙箱、威胁情报四个工具，供 Claude/Cursor 等 MCP 客户端调用。
// 运行：npx tsx src/mcp/server.ts
import path from "node:path";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

import { rag_search } from "../lib/rag/retrieve";
import { sandboxAnalyze } from "../lib/sandbox/analyze";
import { checkIoc, isVirusTotalConfigured } from "../lib/sandbox/virustotal";
import { normalize } from "../lib/agent/normalize";
import { computeRuleScore } from "../lib/agent/rules";
import { finalizeVerdict } from "../lib/agent/synthesize";
import type { RiskLevel } from "../lib/contracts";

const server = new McpServer({ name: "safeagent", version: "1.0.0" });

// ── 工具 1：研判 ──────────────────────────────────────────────
server.tool(
  "analyze",
  "研判一条短信或链接，返回风险等级、规则分、相似案例、话术模式与沙箱结论",
  { text: z.string().describe("待研判的短信文本或链接") },
  async ({ text }) => {
    const normalized = await normalize(text);
    const ruleScore = computeRuleScore(normalized);
    const rag = await rag_search(text);

    let sandboxVerdict: RiskLevel | null = null;
    let sandboxMeta: Record<string, unknown> | null = null;
    if (normalized.urls.length > 0) {
      const env = await sandboxAnalyze(normalized.urls[0], text);
      sandboxVerdict = env.result.verdict as RiskLevel;
      sandboxMeta = { source: env.source, fallbackReasons: env.fallbackReasons };
    }

    const top = rag.matches[0];
    const ragVerdict = top && top.similarity >= 0.6 && top.riskLabel !== "安全" ? top.riskLabel : null;
    const fallback: RiskLevel = normalized.urls.length === 0 ? "安全" : "待核验";
    const verdict = finalizeVerdict(sandboxVerdict, ragVerdict, ruleScore, fallback);

    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          verdict,
          ruleScore,
          input: text,
          cases: rag.matches.slice(0, 3).map((m) => ({ title: m.title, category: m.category, riskLabel: m.riskLabel, similarity: m.similarity })),
          patterns: (rag.patterns ?? []).slice(0, 3).map((p) => ({ pattern: p.pattern, category: p.category })),
          sandbox: sandboxMeta,
        }, null, 2),
      }],
    };
  },
);

// ── 工具 2：案例检索 ──────────────────────────────────────────
server.tool(
  "rag_search",
  "检索反诈案例库与话术模式，返回相似案例与匹配话术",
  { query: z.string().describe("检索关键词或短信文本") },
  async ({ query }) => {
    const rag = await rag_search(query);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          matches: rag.matches.map((m) => ({ title: m.title, category: m.category, riskLabel: m.riskLabel, similarity: m.similarity, content: m.content })),
          patterns: (rag.patterns ?? []).map((p) => ({ pattern: p.pattern, category: p.category, keywords: p.keywords })),
        }, null, 2),
      }],
    };
  },
);

// ── 工具 3：沙箱分析 ──────────────────────────────────────────
server.tool(
  "sandbox_analyze",
  "对链接做沙箱分析（白名单/在线沙箱/Tier0 模板），返回跳转链、表单字段、脚本行为与风险结论",
  { url: z.string().describe("待分析的 URL") },
  async ({ url }) => {
    const env = await sandboxAnalyze(url, url);
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          source: env.source,
          verdict: env.result.verdict,
          redirectChain: env.result.redirectChain,
          formFields: env.result.formFields,
          jsBehaviors: env.result.jsBehaviors,
          iocHits: env.result.iocHits,
          screenshotUrl: env.result.screenshotUrl,
          fallbackReasons: env.fallbackReasons,
        }, null, 2),
      }],
    };
  },
);

// ── 工具 4：威胁情报 ──────────────────────────────────────────
server.tool(
  "check_ioc",
  "查询单个域名/IP/URL 的威胁情报（VirusTotal）",
  { value: z.string().describe("要查询的域名/IP/URL") },
  async ({ value }) => {
    if (!isVirusTotalConfigured()) {
      return { content: [{ type: "text" as const, text: "VirusTotal 未配置（缺少 VIRUSTOTAL_API_KEY）" }] };
    }
    const lookup = await checkIoc(value);
    return { content: [{ type: "text" as const, text: JSON.stringify(lookup, null, 2) }] };
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
