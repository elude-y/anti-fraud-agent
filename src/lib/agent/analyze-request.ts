import { createUIMessageStream, createUIMessageStreamResponse } from "ai";
import { NextResponse } from "next/server";
import { z } from "zod";
import { computeConfidence } from "@/lib/agent/confidence";
import { normalize } from "@/lib/agent/normalize";
import { computeRuleScore, isPreventionNotice, isRoutineNotice } from "@/lib/agent/rules";
import { decidePath } from "@/lib/agent/stateMachine";
import { finalizeVerdict } from "@/lib/agent/synthesize";
import { asRiskLevel, inputCategory, MIN_RAG_SIMILARITY, relevantRagMatch } from "@/lib/agent/verdict";
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
import { checkIoc, isVirusTotalConfigured } from "@/lib/sandbox/virustotal";
import { sandboxAnalyze } from "@/lib/sandbox/analyze";
import { extractHttpUrl, getExternalAnalysisSkipReason, isReservedAnalysisHost, redactUrlForDisplay } from "@/lib/sandbox/url-utils";

const requestSchema = z.object({
  input: z.string().max(500).optional(),
  mode: z.string().optional(),
  forceTier0: z.boolean().optional().default(false),
  messages: z.array(z.object({
    role: z.string(),
    parts: z.array(z.unknown()),
  }).passthrough()).optional(),
}).refine((body) => Boolean(body.input?.trim() || body.messages?.length), {
  message: "缺少待研判内容",
});

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
  if (source === "lightweight+virustotal") return "轻量动态检查 + VirusTotal";
  if (source === "lightweight") return "轻量动态检查";
  if (source === "virustotal+tier0") return "VirusTotal + Tier0";
  return "Tier0 离线模板";
}

function finalConfidenceScore(
  baseScore: number,
  sandbox: SandboxEnvelope | null,
  _trustedMatch: Awaited<ReturnType<typeof rag_search>>["matches"][number] | null,
) {
  if (!sandbox) return baseScore;

  // 仅当沙箱确证"恶意"时才提升置信度——这是对风险结论的实锤。
  if (sandbox.result.verdict === "诈骗") return Math.max(baseScore, 0.92);
  if (sandbox.result.verdict === "高危") return Math.max(baseScore, 0.84);

  // 网址安全（可信域名等）只是「网址」这一条证据，不能代表短信话术没有风险；
  // 因此不因网址可信而抬高整条消息的置信度，只保留规则/RAG 计算出的证据充分度。
  return baseScore;
}

function buildResult(input: {
  normalized: Awaited<ReturnType<typeof normalize>>;
  sandbox: SandboxEnvelope | null;
  trustedMatch: Awaited<ReturnType<typeof rag_search>>["matches"][number] | null;
  ruleScore: number;
  needsContext: boolean;
  prevention?: string;
  reputation?: { verdict: RiskLevel; detail: string };
}) {
  const { normalized, sandbox, trustedMatch, ruleScore } = input;
  const template = sandbox?.source === "tier0" || sandbox?.source === "virustotal+tier0";
  const trustedDomain = sandbox?.source === "tier0" && sandbox.result.verdict === "安全";
  const host = extractHttpUrl(normalized.urls[0] ?? "")?.hostname;
  const demo = sandbox?.source === "tier0" && Boolean(host && isReservedAnalysisHost(host));
  const sandboxLevel = sandbox && (!template || trustedDomain || demo)
    ? asRiskLevel(sandbox.result.verdict)
    : sandbox?.observedVerdict ?? null;
  // RAG 命中安全案例不产生定论（与 deriveVerdict 一致）
  const ragLevel = trustedMatch && trustedMatch.riskLabel !== "安全" ? trustedMatch.riskLabel : null;
  // 统一判定：白名单"安全"只是「网址可信」证据，不覆盖内容风险；无证据时按有无链接兜底
  const verdict: RiskLevel = finalizeVerdict(input.reputation?.verdict ?? sandboxLevel, ragLevel, ruleScore, normalized.urls.length || input.needsContext ? "待核验" : "安全");

  const suggestion = verdict === "安全"
    ? "当前未发现明确恶意行为。建议仍通过官方 App、官网或客服电话独立核验后再操作。"
    : verdict === "待核验"
      ? "当前缺少可验证的证据，暂无法确认是否安全。请勿填写敏感信息，通过官方渠道核实后再操作。"
      : verdict === "可疑"
        ? normalized.urls.length
          ? "证据尚不足以确认恶意。请勿填写敏感信息，通过官方渠道核实链接来源后再决定是否访问。"
          : "证据尚不足以确认恶意，但消息内容存在可疑特征。请勿转账、提供银行卡或验证码，先向官方渠道核实消息来源。"
        : "请立即停止访问或继续沟通，不要填写银行卡、密码或验证码；保留截图和原始消息，并通过官方渠道报警或核实。";

  const category = inputCategory(normalized.raw);
  const evidence = [
    category ? "消息涉及" + category + "。" : "",
    isPreventionNotice(normalized) ? "文本是防骗提醒，未发现要求执行的风险操作。" : "",
    isRoutineNotice(normalized) ? "文本符合常见物流或到账通知，未发现额外风险操作请求。" : "",
    input.prevention ? "模型识别到防骗语境，已下调关键词风险。" : "",
    input.reputation?.detail ?? "",
    ruleScore >= 0.3 ? "文本包含风险话术或操作诱导。" : "",
    trustedMatch ? "采信相似案例“" + trustedMatch.title + "”（" + trustedMatch.category + "）。" : "",
    trustedDomain ? "可信域名名单命中，结果为安全，未执行页面行为验证。" : "",
    template && !trustedDomain ? "Tier0 提供离线模板推演，模板字段和跳转未实际观测。" : "",
    sandbox?.source === "virustotal+tier0" ? "已查询 VirusTotal 信誉，页面行为仍待核验。" : "",
    trustedDomain && (ruleScore >= 0.3 || ragLevel) ? "网址可信名单命中与消息内容风险需分别判断。" : "",
    sandbox && !template ? "已通过 " + sandboxSourceLabel(sandbox.source) + " 检查链接。" : "",
    verdict === "待核验" ? "现有证据不足，请补充发送方与对方要求的操作。" : "",
  ].filter(Boolean);
  if (!evidence.length) evidence.push("现有文本未发现明确风险信号。");
  const summary = evidence.join("");

  return {
    verdict,
    suggestion,
    summary,
  };
}

export type AnalysisVariant = "rule-only" | "rule-rag" | "full";

export async function analyzeRequest(request: Request, variant: AnalysisVariant = "full") {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体必须是有效 JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    // 诊断用：记录具体校验失败原因，定位间歇性 400
    const firstIssue = parsed.error.issues[0];
    const reason = firstIssue
      ? `${firstIssue.path.join(".") || "(root)"}: ${firstIssue.message}`
      : "未知原因";
    console.warn(`[analyze] 请求校验失败 → ${reason}`);
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
  const mode = parsed.data.mode === "link" || parsed.data.mode === "message" ? parsed.data.mode : inferredMode;

  const stream = createUIMessageStream<SafeAgentUIMessage>({
    onError: (error) => error instanceof Error ? error.message : "研判流发生未知错误",
    execute: async ({ writer }) => {
      const emitStage = (stage: AnalysisStage, status: "active" | "done" | "skipped") => {
        writer.write({
          type: "data-stage",
          id: `stage-${stage}-${status}`,
          data: { stage, status, at: Date.now() },
        });
      };

      const emitTool = (
        tool: AnalysisTool,
        status: "start" | "done",
        data?: unknown,
      ) => {
        writer.write({
          type: "data-tool",
          id: `tool-${tool}-${status}-${Date.now()}`,
          data: { tool, status, at: Date.now(), data },
        });
      };

      const emitEvidence = (node: EvidenceNode) => {
        writer.write({
          type: "data-evidence",
          id: `evidence-${node.id}`,
          data: node,
        });
      };

      writer.write({ type: "start", messageId: crypto.randomUUID() });

      try {
        emitStage("normalize", "active");
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
        emitEvidence(inputNode);
        emitStage("normalize", "done");

        emitStage("rag", "active");
        emitTool("rag_search", "start", { query: redactedInput });
        const rag = variant === "rule-only" || isPreventionNotice(normalized) || isRoutineNotice(normalized)
          ? { matches: [], topSimilarity: 0, labelAgreement: 0, coverageScore: 0 }
          : await rag_search(redactedInput);
        emitTool("rag_search", "done", rag);
        const ragNode = evidenceNode("rag", "案例库检索完成", {
          description: rag.matches.length
            ? `返回 ${rag.matches.length} 条相似案例，Top-1 相似度 ${(rag.topSimilarity * 100).toFixed(0)}%。`
            : "未检索到高相关案例，后续结论将更多依赖行为与规则证据。",
          tags: rag.matches.map((item) => `${item.category} ${(item.similarity * 100).toFixed(0)}%`),
          matches: rag.matches,
          patterns: "patterns" in rag ? rag.patterns : [],
        }, 1);
        emitEvidence(ragNode);
        emitStage("rag", "done");

        emitStage("confidence", "active");
        const ruleScore = computeRuleScore(normalized);
        const confidence = computeConfidence(rag.topSimilarity, rag.labelAgreement, rag.coverageScore, ruleScore);
        let trustedMatch = relevantRagMatch(rag, normalized);
        const reputationTarget = extractHttpUrl(normalized.urls[0] ?? "");
        const canCheckReputation = Boolean(reputationTarget && !parsed.data.forceTier0 && isVirusTotalConfigured());
        const pathDecision = variant === "full"
          ? await decidePath(confidence, normalized, redactedInput, trustedMatch, canCheckReputation)
          : { action: "finish" as const, planner: "rule" as const, reason: "仅使用当前评测组允许的信号。", query: undefined, inducement: undefined, prevention: undefined };
        if (pathDecision.action === "retrieve" && pathDecision.query) {
          emitTool("rag_search", "start");
          const refined = await rag_search(redactedInput + " " + pathDecision.query);
          trustedMatch ??= relevantRagMatch(refined, normalized);
          emitTool("rag_search", "done");
        }
        let needsSandbox = pathDecision.action === "sandbox";
        const pathReason = pathDecision.reason;
        const confidenceNode = evidenceNode("confidence", "前置检索信号评估", {
          description: `沙箱前证据充分度 ${(confidence.score * 100).toFixed(0)}%，标签一致性 ${(rag.labelAgreement * 100).toFixed(0)}%，关键要素覆盖度 ${(rag.coverageScore * 100).toFixed(0)}%。${pathReason}`,
          tags: [
            pathDecision.planner === "llm" ? "模型规划路径" : "规则护栏",
            `Top-1 ${(rag.topSimilarity * 100).toFixed(0)}%`,
            `覆盖度 ${(rag.coverageScore * 100).toFixed(0)}%`,
            `规则分 ${(ruleScore * 100).toFixed(0)}%`,
            normalized.riskKeywords.length ? `风险词 ${normalized.riskKeywords.slice(0, 3).join(" / ")}` : "未命中高危词",
          ],
          score: confidence.score,
          ruleScore,
          action: pathDecision.action,
        }, 2);
        emitEvidence(confidenceNode);
        emitStage("confidence", "done");

        let sandbox: SandboxEnvelope | null = null;
        let sandboxNode: EvidenceNode | null = null;
        // 纯文本（无 URL）不进沙箱：沙箱只能对链接做动态验证，无链接时由 RAG + 规则定论
        let reputation: { verdict: RiskLevel; detail: string } | undefined;
        if (pathDecision.action === "reputation" && reputationTarget) {
          emitStage("sandbox", "active");
          emitTool("check_ioc", "start");
          try {
            if (!(await getExternalAnalysisSkipReason(reputationTarget))) {
              const found = await checkIoc(reputationTarget.hostname, "domain");
              if (found.malicious || found.suspicious) {
                reputation = { verdict: found.malicious >= 3 ? "高危" : "可疑", detail: found.hit.verdict + "。仅核查域名信誉。" };
              }
            }
          } catch {
            // An unavailable or inconclusive reputation check proceeds to the existing verification path.
          }
          emitTool("check_ioc", "done");
          needsSandbox = !reputation;
          if (reputation) emitStage("sandbox", "done");
        }
        const path = needsSandbox ? "sandbox" : "fast";
        if (needsSandbox && normalized.urls.length > 0) {
          emitStage("sandbox", "active");
          emitTool("sandbox_analyze", "start", {
            url: normalized.urls[0] ? redactUrlForDisplay(normalized.urls[0]) : null,
          });
          sandbox = await sandboxAnalyze(normalized.urls[0], input, {
            forceTier0: parsed.data.forceTier0,
          });
          emitTool("sandbox_analyze", "done", {
            source: sandbox.source,
            providers: sandbox.providers,
            fallbackReasons: sandbox.fallbackReasons,
          });
          const simulated = sandbox.source === "tier0" || sandbox.source === "virustotal+tier0";
          const jumpVerb = simulated ? "离线模板推演" : "检查得到";
          const sandboxPayload: SandboxEvidencePayload = {
            description: normalized.urls.length
              ? `${jumpVerb} ${sandbox.result.redirectChain.length} 段跳转、${sandbox.result.formFields.length} 个表单字段与 ${sandbox.result.jsBehaviors.length} 项脚本行为${simulated ? "（模板推演，页面行为未验证）" : "。"}`
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
          sandboxNode = evidenceNode("sandbox", simulated ? "离线模板与域名线索" : "在线链接检查结果", sandboxPayload, 3);
          emitEvidence(sandboxNode);
          emitStage("sandbox", "done");
        } else if (!reputation) {
          emitStage("sandbox", "skipped");
        }

        emitStage("synthesis", "active");
        const baseline = buildResult({ normalized, sandbox, trustedMatch, ruleScore, needsContext: false, reputation });
        const prevention = pathDecision.prevention;
        if (prevention) trustedMatch = null;
        const semanticScore = prevention ? 0 : pathDecision.inducement ? Math.max(0.3, ruleScore) : ruleScore;
        const analyzed = buildResult({
          normalized, sandbox, trustedMatch, ruleScore: semanticScore, prevention, reputation,
          needsContext: false,
        });
        const previousVerdict = baseline.verdict !== analyzed.verdict ? baseline.verdict : undefined;
        const followUp = analyzed.verdict === "待核验"
          ? "请补充消息来自谁，以及对方具体要求你做什么。"
          : undefined;
        const templateOnly = sandbox && (sandbox.source === "tier0" || sandbox.source === "virustotal+tier0")
          && !isReservedAnalysisHost(extractHttpUrl(normalized.urls[0] ?? "")?.hostname ?? "")
          && (sandbox.result.verdict !== "安全" || analyzed.verdict !== "安全");
        const confidenceScore = templateOnly
          ? Math.max(confidence.score, sandbox?.observedVerdict ? 0.65 : 0)
          : finalConfidenceScore(confidence.score, sandbox, trustedMatch);
        const synthesisNode = evidenceNode("synthesis", "综合研判依据", {
          description: analyzed.summary,
          tags: [
            trustedMatch?.category ?? "无采信案例",
            ...(pathDecision.inducement || prevention ? ["模型引用原文：" + (pathDecision.inducement ?? prevention)] : []),
            ...(previousVerdict ? ["模型复核前：" + previousVerdict + " → " + analyzed.verdict] : []),
            ...(reputation ? ["VirusTotal 域名信誉"] : []),
            sandbox ? sandboxSourceLabel(sandbox.source) : "文本研判",
          ],
        }, 4);
        emitEvidence(synthesisNode);
        emitStage("synthesis", "done");

        emitStage("done", "active");
        const conclusionNode = evidenceNode("conclusion", `研判结论：${analyzed.verdict}`, {
          description: analyzed.suggestion,
          tags: [
            `证据充分程度 ${(confidenceScore * 100).toFixed(0)}%`,
            `证据 ${sandboxNode ? 6 : 5} 个`,
            sandbox ? sandboxSourceLabel(sandbox.source) : "文本研判",
          ],
          verdict: analyzed.verdict,
          confidence: confidenceScore,
        }, 5);
        emitEvidence(conclusionNode);
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
          confidence: confidenceScore,
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
          acceptedMatch: trustedMatch,
          decision: { action: pathDecision.action, planner: pathDecision.planner, reason: pathDecision.reason, previousVerdict },
          followUp,
        };
        writer.write({
          type: "data-result",
          id: `result-${crypto.randomUUID()}`,
          data: result,
        });
        emitStage("done", "done");

        const message = `研判完成：${result.verdict}，证据充分程度 ${(result.confidence * 100).toFixed(0)}%。${result.summary}`;
        writer.write({ type: "text-start", id: "analysis-summary" });
        writer.write({ type: "text-delta", id: "analysis-summary", delta: message });
        writer.write({ type: "text-end", id: "analysis-summary" });
        writer.write({ type: "finish", finishReason: "stop" });
      } catch (error) {
        console.warn(`[analyze] 研判流程失败: ${error instanceof Error ? error.message : String(error)}`);
        writer.write({ type: "error", errorText: "研判流程暂时不可用，请稍后重试" });
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
