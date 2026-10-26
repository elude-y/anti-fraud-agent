import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { computeConfidence } from "@/lib/agent/confidence";
import { normalize } from "@/lib/agent/normalize";
import { computeRuleScore } from "@/lib/agent/rules";
import { decidePath } from "@/lib/agent/stateMachine";
import type {
  AnalysisStage,
  AnalysisStreamResult,
  AnalysisTool,
  EvidenceNode,
  RiskLevel,
  SafeAgentUIMessage,
  SandboxEnvelope,
  SandboxEvidencePayload,
  VerdictResult,
} from "@/lib/contracts";
import { rag_search } from "@/lib/rag/retrieve";
import { sandboxAnalyze } from "@/lib/sandbox/analyze";
import { redactUrlForDisplay } from "@/lib/sandbox/url-utils";

const requestSchema = z.object({
  input: z.string().max(500).optional(),
  mode: z.enum(["link", "message"]).optional(),
  forceTier0: z.boolean().optional().default(false),
  messages: z.array(z.object({
    role: z.string(),
    parts: z.array(z.unknown()),
  }).passthrough()).optional(),
}).refine((body) => Boolean(body.input?.trim() || body.messages?.length), {
  message: "缺少待研判内容",
});

const riskRank: Record<RiskLevel, number> = { "安全": 0, "可疑": 1, "高危": 2, "诈骗": 3 };
const MIN_RAG_SIMILARITY = 0.6;

function asRiskLevel(value: string): RiskLevel {
  return value === "安全" || value === "可疑" || value === "高危" || value === "诈骗"
    ? value
    : "可疑";
}

function messageText(messages: Array<{ role: string; parts: unknown[] }> | undefined) {
  const userMessage = [...(messages ?? [])].reverse().find((message) => message.role === "user");
  if (!userMessage) return "";

  return userMessage.parts
    .map((part) => {
      if (!part || typeof part !== "object" || !("type" in part) || part.type !== "text") return "";
      return "text" in part && typeof part.text === "string" ? part.text : "";
    })
    .join("")
    .trim();
}

function evidenceNode(
  type: EvidenceNode["type"],
  label: string,
  payload: unknown,
  sequence: number,
): EvidenceNode {
  return {
    id: `${type}-${Date.now()}-${sequence}`,
    type,
    label,
    payload,
    ts: Date.now() + sequence,
  };
}

function redactInput(input: string, urls: string[]) {
  return urls
    .reduce((current, url) => current.replace(url, redactUrlForDisplay(url)), input)
    .replace(/\b1[3-9]\d{9}\b/g, "[手机号已脱敏]")
    .replace(/\b\d{17}[\dXx]\b/g, "[证件号已脱敏]")
    .replace(/\b\d{16,19}\b/g, "[卡号已脱敏]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[邮箱已脱敏]");
}

function sandboxSourceLabel(source: SandboxEnvelope["source"]) {
  if (source === "urlscan+virustotal") return "urlscan.io + VirusTotal";
  if (source === "urlscan") return "urlscan.io";
  if (source === "virustotal+tier0") return "VirusTotal + Tier0";
  return "Tier0 离线模板";
}

function inputCategory(raw: string): "银行" | "ETC" | "快递" | null {
  if (/工商银行|建设银行|农业银行|中国银行|招商银行|银行(?!卡)|工行|建行|农行|中行|招行|\bbank\b/i.test(raw)) return "银行";
  if (/ETC|高速通行/i.test(raw)) return "ETC";
  if (/快递|包裹|物流|顺丰|中通|圆通|韵达|申通/i.test(raw)) return "快递";
  return null;
}

function relevantRagMatch(rag: Awaited<ReturnType<typeof rag_search>>, raw: string) {
  const top = rag.matches[0];
  if (!top || rag.topSimilarity < MIN_RAG_SIMILARITY || top.similarity < MIN_RAG_SIMILARITY) return null;
  const category = inputCategory(raw);
  if (category === "银行" && !/银行|KYC/i.test(top.category)) return null;
  if (category === "ETC" && !/ETC/i.test(top.category)) return null;
  if (category === "快递" && !/快递|物流/i.test(top.category)) return null;
  return top;
}

function buildResult(input: {
  normalized: Awaited<ReturnType<typeof normalize>>;
  mode: "link" | "message";
  sandbox: SandboxEnvelope | null;
  trustedMatch: Awaited<ReturnType<typeof rag_search>>["matches"][number] | null;
  confidence: ReturnType<typeof computeConfidence>;
}) {
  const { normalized, mode, sandbox, trustedMatch, confidence } = input;
  const sandboxLevel = sandbox ? asRiskLevel(sandbox.result.verdict) : null;
  const verdict: RiskLevel = sandboxLevel === "安全"
    ? "安全"
    : sandboxLevel && trustedMatch && riskRank[trustedMatch.riskLabel] > riskRank[sandboxLevel]
      ? trustedMatch.riskLabel
      : sandboxLevel ?? trustedMatch?.riskLabel ?? "可疑";

  const suggestion = verdict === "安全"
    ? "当前未发现明确恶意行为。建议仍通过官方 App、官网或客服电话独立核验后再操作。"
    : verdict === "可疑"
      ? "证据尚不足以确认恶意。请勿填写敏感信息，通过官方渠道核实链接来源后再决定是否访问。"
      : "请立即停止访问或继续沟通，不要填写银行卡、密码或验证码；保留截图和原始消息，并通过官方渠道报警或核实。";

  const riskyIocCount = sandbox?.result.iocHits.filter(
    (item) => !/白名单|低风险|暂无|暂未|安全/.test(item.verdict),
  ).length ?? 0;
  const category = inputCategory(normalized.raw);
  const categoryContext = category ? `输入涉及${category}，` : "";
  const matchContext = `${categoryContext}${trustedMatch ? `命中“${trustedMatch.category}”相似案例，` : ""}`;
  const summary = verdict === "安全"
    ? sandbox
      ? sandbox.source === "tier0"
        ? "离线白名单与规则判定为安全；建议仍通过官方入口核验。"
        : "沙箱与白名单证据指向安全；建议仍通过官方入口核验。"
      : `${matchContext}案例检索与规则未发现明显风险，建议通过官方入口再次核验。`
    : riskyIocCount
      ? `${matchContext}沙箱发现 ${riskyIocCount} 条风险 IOC 与 ${sandbox?.result.formFields.length ?? 0} 个敏感字段。`
      : sandbox
        ? normalized.urls.length
          ? `${matchContext}完成案例检索与 ${sandboxSourceLabel(sandbox.source)} 验证，现有证据指向“${verdict}”。`
          : `${matchContext}未提取到可验证的链接，现有短信与案例证据指向“${verdict}”，请核实消息来源。`
        : `${matchContext}高置信度案例检索与规则信号指向“${verdict}”，未调用沙箱。`;

  return {
    verdict,
    confidence: confidence.score,
    suggestion,
    summary,
    inputType: mode,
    normalized,
    sandbox,
    sandboxLevel,
    conflict: Boolean(trustedMatch && sandboxLevel && trustedMatch.riskLabel !== sandboxLevel),
  };
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体必须是有效 JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "请输入 1 至 500 字的链接或短信内容" }, { status: 400 });
  }

  const input = (parsed.data.input ?? messageText(parsed.data.messages)).trim();
  if (!input) {
    return NextResponse.json({ message: "未从消息中提取到待研判文本" }, { status: 400 });
  }
  if (input.length > 500) {
    return NextResponse.json({ message: "研判内容不能超过 500 字" }, { status: 400 });
  }

  const inferredMode = input.match(/https?:\/\//i) ? "link" : "message";
  const mode = parsed.data.mode ?? inferredMode;

  const stream = createUIMessageStream<SafeAgentUIMessage>({
    onError: (error) => error instanceof Error ? error.message : "研判流发生未知错误",
    execute: async ({ writer }) => {
      const emitStage = async (stage: AnalysisStage, status: "active" | "done" | "skipped") => {
        writer.write({
          type: "data-stage",
          id: `stage-${stage}-${status}`,
          data: { stage, status, at: Date.now() },
        });
        await delay(status === "active" ? 180 : 90);
      };

      const emitTool = async (
        tool: AnalysisTool,
        status: "start" | "done",
        data?: unknown,
      ) => {
        writer.write({
          type: "data-tool",
          id: `tool-${tool}-${status}-${Date.now()}`,
          data: { tool, status, at: Date.now(), data },
        });
        await delay(70);
      };

      const emitEvidence = async (node: EvidenceNode) => {
        writer.write({
          type: "data-evidence",
          id: `evidence-${node.id}`,
          data: node,
        });
        await delay(90);
      };

      writer.write({ type: "start", messageId: crypto.randomUUID() });

      try {
        await emitStage("normalize", "active");
        const normalized = await normalize(input);
        const redactedInput = redactInput(input, normalized.urls);
        const inputNode = evidenceNode("input", "输入规范化完成", {
          description: normalized.urls.length
            ? `识别到 ${normalized.urls.length} 个链接，提取 ${normalized.riskKeywords.length} 个风险词与 ${normalized.entities.length} 个实体。`
            : `识别为短信文本，提取 ${normalized.riskKeywords.length} 个风险词与 ${normalized.entities.length} 个实体。`,
          tags: [
            mode === "link" ? "链接输入" : "短信输入",
            ...normalized.riskKeywords.slice(0, 3),
            ...normalized.entities.slice(0, 2),
          ],
          input: redactedInput,
        }, 0);
        await emitEvidence(inputNode);
        await emitStage("normalize", "done");

        await emitStage("rag", "active");
        await emitTool("rag_search", "start", { query: redactedInput });
        const rag = await rag_search(input);
        await delay(240);
        await emitTool("rag_search", "done", rag);
        const ragNode = evidenceNode("rag", "案例库检索完成", {
          description: rag.matches.length
            ? `返回 ${rag.matches.length} 条相似案例，Top-1 相似度 ${(rag.topSimilarity * 100).toFixed(0)}%。`
            : "未检索到高相关案例，后续结论将更多依赖行为与规则证据。",
          tags: rag.matches.map((item) => `${item.category} ${(item.similarity * 100).toFixed(0)}%`),
          matches: rag.matches,
        }, 1);
        await emitEvidence(ragNode);
        await emitStage("rag", "done");

        await emitStage("confidence", "active");
        const ruleScore = computeRuleScore(normalized);
        const confidence = computeConfidence(rag.topSimilarity, rag.labelAgreement, rag.coverageScore, ruleScore);
        const trustedMatch = relevantRagMatch(rag, normalized.raw);
        const pathDecision = decidePath(confidence, normalized);
        const path = pathDecision.path === "fast" && !trustedMatch ? "sandbox" : pathDecision.path;
        const pathReason = pathDecision.path === "fast" && !trustedMatch
          ? "检索结果相关性不足或案例类别与输入不符，转入沙箱验证。"
          : pathDecision.reason;
        const confidenceNode = evidenceNode("confidence", "置信度信号融合", {
          description: `综合置信度 ${(confidence.score * 100).toFixed(0)}%，标签一致性 ${(rag.labelAgreement * 100).toFixed(0)}%，关键要素覆盖度 ${(rag.coverageScore * 100).toFixed(0)}%。${pathReason}`,
          tags: [
            `Top-1 ${(rag.topSimilarity * 100).toFixed(0)}%`,
            `覆盖度 ${(rag.coverageScore * 100).toFixed(0)}%`,
            `规则分 ${(ruleScore * 100).toFixed(0)}%`,
            normalized.riskKeywords.length ? `风险词 ${normalized.riskKeywords.slice(0, 3).join(" / ")}` : "未命中高危词",
          ],
          score: confidence.score,
          path,
        }, 2);
        await emitEvidence(confidenceNode);
        await emitStage("confidence", "done");

        let sandbox: SandboxEnvelope | null = null;
        let sandboxNode: EvidenceNode | null = null;
        if (path === "sandbox") {
          await emitStage("sandbox", "active");
          await emitTool("sandbox_analyze", "start", {
            url: normalized.urls[0] ? redactUrlForDisplay(normalized.urls[0]) : null,
          });
          if (normalized.urls[0]) await emitTool("check_ioc", "start", { target: redactUrlForDisplay(normalized.urls[0]) });
          sandbox = await sandboxAnalyze(normalized.urls[0] ?? input, input, {
            forceTier0: parsed.data.forceTier0,
          });
          await emitTool("sandbox_analyze", "done", {
            source: sandbox.source,
            providers: sandbox.providers,
            fallbackReasons: sandbox.fallbackReasons,
          });
          if (normalized.urls[0]) {
            await emitTool("check_ioc", "done", {
              virusTotal: sandbox.providers.virustotal,
              iocHits: sandbox.result.iocHits,
            });
          }
          const sandboxPayload: SandboxEvidencePayload = {
            description: normalized.urls.length
              ? `捕获 ${sandbox.result.redirectChain.length} 段跳转、${sandbox.result.formFields.length} 个表单字段与 ${sandbox.result.jsBehaviors.length} 项脚本行为。`
              : "未提取到链接，沙箱仅对短信文本及可用威胁线索进行离线评估。",
            tags: [
              sandboxSourceLabel(sandbox.source),
              ...sandbox.result.formFields.slice(0, 3),
              ...sandbox.result.jsBehaviors.slice(0, 2),
            ],
            sandbox: sandbox.result,
            sandboxMeta: {
              source: sandbox.source,
              latencyMs: sandbox.latencyMs,
              providers: sandbox.providers,
              fallbackReasons: sandbox.fallbackReasons,
            },
          };
          sandboxNode = evidenceNode("sandbox", "沙箱行为证据已回传", sandboxPayload, 3);
          await emitEvidence(sandboxNode);
          await emitStage("sandbox", "done");
        } else {
          await emitStage("sandbox", "skipped");
        }

        await emitStage("synthesis", "active");
        const analyzed = buildResult({ normalized, mode, sandbox, trustedMatch, confidence });
        const synthesisDescription = analyzed.conflict
          ? `可信案例给出“${trustedMatch?.riskLabel}”，${normalized.urls.length ? "沙箱行为" : "短信文本规则"}证据指向“${analyzed.sandboxLevel}”，综合判定为“${analyzed.verdict}”。`
          : sandbox
            ? `案例检索与${normalized.urls.length ? "沙箱行为" : "短信文本规则"}已完成综合研判，当前证据指向“${analyzed.verdict}”。`
            : `高置信度案例检索与规则信号指向“${analyzed.verdict}”，快速路径无需沙箱。`;
        const synthesisNode = evidenceNode("synthesis", "多源证据交叉验证", {
          description: synthesisDescription,
          tags: [
            trustedMatch?.category ?? "无可信案例匹配",
            ...(sandbox ? [
              sandbox.result.brandImpersonation ? `疑似仿冒 ${sandbox.result.brandImpersonation}` : "未确认品牌仿冒",
              `${sandbox.result.iocHits.length} 条 IOC`,
            ] : ["快速路径"]),
          ],
        }, 4);
        await emitEvidence(synthesisNode);
        await emitStage("synthesis", "done");

        await emitStage("done", "active");
        const conclusionNode = evidenceNode("conclusion", `研判结论：${analyzed.verdict}`, {
          description: analyzed.suggestion,
          tags: [
            `置信度 ${(analyzed.confidence * 100).toFixed(0)}%`,
            `证据 ${sandboxNode ? 6 : 5} 个`,
            sandbox ? sandboxSourceLabel(sandbox.source) : "快速路径",
          ],
          verdict: analyzed.verdict,
          confidence: analyzed.confidence,
        }, 5);
        await emitEvidence(conclusionNode);
        const evidenceChain = [
          inputNode,
          ragNode,
          confidenceNode,
          ...(sandboxNode ? [sandboxNode] : []),
          synthesisNode,
          conclusionNode,
        ];
        const verdictResult: VerdictResult = {
          verdict: analyzed.verdict,
          confidence: analyzed.confidence,
          suggestion: analyzed.suggestion,
          evidenceChain,
        };
        const result: AnalysisStreamResult = {
          ...verdictResult,
          input: redactedInput,
          mode,
          path,
          sandbox: sandbox?.result ?? null,
          sandboxMeta: sandbox ? {
            source: sandbox.source,
            latencyMs: sandbox.latencyMs,
            providers: sandbox.providers,
            fallbackReasons: sandbox.fallbackReasons,
          } : null,
          summary: analyzed.summary,
        };
        writer.write({
          type: "data-result",
          id: `result-${crypto.randomUUID()}`,
          data: result,
        });
        await emitStage("done", "done");

        const message = `研判完成：${result.verdict}，综合置信度 ${(result.confidence * 100).toFixed(0)}%。${result.summary}`;
        writer.write({ type: "text-start", id: "analysis-summary" });
        writer.write({ type: "text-delta", id: "analysis-summary", delta: message });
        writer.write({ type: "text-end", id: "analysis-summary" });
        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        const errorText = error instanceof Error ? error.message : "研判流程暂时不可用";
        writer.write({ type: "error", errorText });
        writer.write({ type: "finish", finishReason: "error" });
      }
    },
  });

  return createUIMessageStreamResponse({
    stream,
    headers: {
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
