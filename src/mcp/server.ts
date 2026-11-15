// src/mcp/server.ts —— SafeAgent 工具包 MCP Server（stdio 传输）
// 暴露研判、案例检索、沙箱、威胁情报四个工具，供 Claude/Cursor 等 MCP 客户端调用。
// 运行：npx tsx src/mcp/server.ts
import path from "node:path";
import dotenv from "dotenv";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

dotenv.config({ path: path.join(process.cwd(), ".env.local"), quiet: true });

import { rag_search } from "../lib/rag/retrieve";
import { sandboxAnalyze } from "../lib/sandbox/analyze";
import { checkIoc, isVirusTotalConfigured } from "../lib/sandbox/virustotal";
import { analyzeRequest } from "../lib/agent/analyze-request";
import type { AnalysisStreamResult, RagMatch, RagPatternMatch } from "../lib/contracts";

const server = new McpServer({ name: "safeagent", version: "1.0.0" });

// ── 工具 1：研判 ──────────────────────────────────────────────
server.tool(
  "analyze",
  "研判一条短信或链接，返回风险等级、规则分、相似案例、话术模式与沙箱结论",
  { text: z.string().trim().min(1).max(500).describe("待研判的短信文本或链接") },
  async ({ text }) => {
    const response = await analyzeRequest(new Request("http://localhost/api/analyze", {
      method: "POST",
      body: JSON.stringify({ input: text }),
    }));
    const events = (await response.text()).split("\n")
      .filter((line) => line.startsWith("data: {")).map((line) => JSON.parse(line.slice(6)));
    const result: AnalysisStreamResult | undefined = events.find((event) => event.type === "data-result")?.data;
    if (!result) {
      return { isError: true, content: [{ type: "text" as const, text: "研判未完成，请稍后重试。" }] };
    }
    const rag = result.evidenceChain.find((node) => node.type === "rag")?.payload as
      { matches?: RagMatch[]; patterns?: RagPatternMatch[] } | undefined;
    const confidence = result.evidenceChain.find((node) => node.type === "confidence")?.payload as
      { ruleScore?: number } | undefined;
    const { verdict, input, summary, suggestion, decision, followUp, sandboxMeta } = result;
    return {
      content: [{
        type: "text" as const,
        text: JSON.stringify({
          verdict, input, summary, suggestion, decision, followUp, ruleScore: confidence?.ruleScore,
          cases: (rag?.matches ?? []).slice(0, 3).map(({ title, category, riskLabel, similarity }) => ({ title, category, riskLabel, similarity })),
          patterns: (rag?.patterns ?? []).slice(0, 3).map(({ pattern, category }) => ({ pattern, category })),
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
void server.connect(transport).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
