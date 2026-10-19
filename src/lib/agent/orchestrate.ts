import { computeConfidence, type ConfidenceResult } from "@/lib/agent/confidence";
import { normalize, type NormalizedInput } from "@/lib/agent/normalize";
import { computeRuleScore } from "@/lib/agent/rules";
import { decidePath, type PathDecision } from "@/lib/agent/stateMachine";
import type {
  EvidenceNode,
  RagSearchResult,
  SandboxEnvelope,
  SandboxEvidencePayload,
  SandboxResult,
} from "@/lib/contracts";
import { rag_search } from "@/lib/rag/retrieve";
import { sandboxAnalyze } from "@/lib/sandbox/analyze";

export interface AnalysisResult {
  normalized: NormalizedInput;
  ruleScore: number;
  rag: RagSearchResult;
  confidence: ConfidenceResult;
  decision: PathDecision;
  sandbox: SandboxResult | null;
  sandboxMeta: Omit<SandboxEnvelope, "result"> | null;
  evidenceChain: EvidenceNode[];
}

export async function runAnalysis(input: string): Promise<AnalysisResult> {
  const normalized = await normalize(input);
  const evidence: EvidenceNode[] = [];

  evidence.push({
    id: `input-${Date.now()}`,
    type: "input",
    label: "输入规范化完成",
    payload: {
      description: normalized.urls.length
        ? `识别到 ${normalized.urls.length} 个链接与 ${normalized.riskKeywords.length} 个风险词。`
        : `识别为短信文本，提取 ${normalized.riskKeywords.length} 个风险词。`,
      tags: [
        normalized.inputType,
        ...normalized.riskKeywords.slice(0, 3),
        ...normalized.entities.slice(0, 2),
      ],
    },
    ts: Date.now(),
  });

  const ruleScore = computeRuleScore(normalized);

  let rag: RagSearchResult;
  try {
    rag = await rag_search(normalized.raw);
  } catch {
    rag = { matches: [], topSimilarity: 0, labelAgreement: 0, coverageScore: 0 };
  }
  evidence.push({
    id: `rag-${Date.now()}`,
    type: "rag",
    label: `案例库检索：命中 ${rag.matches.length} 条相似案例`,
    payload: {
      description: `Top-1 相似度 ${(rag.topSimilarity * 100).toFixed(0)}%，标签一致性 ${(rag.labelAgreement * 100).toFixed(0)}%。`,
      tags: rag.matches.map((item) => `${item.category} ${(item.similarity * 100).toFixed(0)}%`),
      topSimilarity: rag.topSimilarity,
      labelAgreement: rag.labelAgreement,
      coverageScore: rag.coverageScore,
      matches: rag.matches.slice(0, 3),
    },
    ts: Date.now(),
  });

  const confidence = computeConfidence(rag.topSimilarity, rag.labelAgreement, rag.coverageScore, ruleScore);
  evidence.push({
    id: `confidence-${Date.now()}`,
    type: "confidence",
    label: `置信度评估：${(confidence.score * 100).toFixed(0)}%（${confidence.level}）`,
    payload: {
      description: confidence.reason,
      tags: [
        `相似度 ${(confidence.signals.similarity * 100).toFixed(0)}%`,
        `规则分 ${(confidence.signals.rule * 100).toFixed(0)}%`,
      ],
      score: confidence.score,
      signals: confidence.signals,
    },
    ts: Date.now(),
  });

  const decision = decidePath(confidence, normalized);
  let sandbox: SandboxResult | null = null;
  let sandboxMeta: Omit<SandboxEnvelope, "result"> | null = null;

  if (decision.path === "sandbox") {
    try {
      const envelope = await sandboxAnalyze(normalized.urls[0] ?? normalized.raw, normalized.raw);
      sandbox = envelope.result;
      sandboxMeta = {
        source: envelope.source,
        latencyMs: envelope.latencyMs,
        providers: envelope.providers,
        fallbackReasons: envelope.fallbackReasons,
      };
      const payload: SandboxEvidencePayload = {
        description: `捕获 ${sandbox.redirectChain.length} 段跳转、${sandbox.formFields.length} 个表单字段与 ${sandbox.jsBehaviors.length} 项脚本行为。`,
        tags: [
          envelope.source,
          ...sandbox.formFields.slice(0, 3),
          ...sandbox.jsBehaviors.slice(0, 2),
        ],
        sandbox,
        sandboxMeta,
      };
      evidence.push({
        id: `sandbox-${Date.now()}`,
        type: "sandbox",
        label: `沙箱动态验证：${sandbox.verdict}`,
        payload,
        ts: Date.now(),
      });
    } catch {
      sandbox = null;
      sandboxMeta = null;
    }
  }

  return {
    normalized,
    ruleScore,
    rag,
    confidence,
    decision,
    sandbox,
    sandboxMeta,
    evidenceChain: evidence,
  };
}
