// src/lib/agent/verdict.ts —— 统一权威风险判定（专业研判页与 AI 助手共用同一套判定）
import { normalize } from "@/lib/agent/normalize";
import { computeRuleScore, isPreventionNotice, isRoutineNotice } from "@/lib/agent/rules";
import { deriveSuggestion, finalizeVerdict } from "@/lib/agent/synthesize";
import type { RagMatch, RiskLevel, SandboxEnvelope } from "@/lib/contracts";
import { rag_search } from "@/lib/rag/retrieve";
import { sandboxAnalyze } from "@/lib/sandbox/analyze";
import { extractHttpUrl, isReservedAnalysisHost } from "@/lib/sandbox/url-utils";

export const MIN_RAG_SIMILARITY = 0.6;

export function asRiskLevel(value: string): RiskLevel {
  return value === "安全" || value === "待核验" || value === "可疑" || value === "高危" || value === "诈骗"
    ? value
    : "待核验";
}

export function inputCategory(raw: string): "银行" | "ETC" | "快递" | null {
  if (/ETC|高速通行/i.test(raw)) return "ETC";
  if (/快递|包裹|物流|顺丰|中通|圆通|韵达|申通/i.test(raw)) return "快递";
  if (/工商银行|建设银行|农业银行|中国银行|招商银行|银行|工行|建行|农行|中行|招行|\bbank\b/i.test(raw)) return "银行";
  return null;
}

export function relevantRagMatch(
  rag: Awaited<ReturnType<typeof rag_search>>,
  normalized: Awaited<ReturnType<typeof normalize>>,
): RagMatch | null {
  if (isPreventionNotice(normalized) || isRoutineNotice(normalized)) return null;
  const category = inputCategory(normalized.raw);
  return rag.matches.find((match) => {
    if (match.similarity < MIN_RAG_SIMILARITY || match.riskLabel === "安全") return false;
    if (category === "银行") return /银行|KYC/i.test(match.category);
    if (category === "ETC") return /ETC/i.test(match.category);
    if (category === "快递") return /快递|物流/i.test(match.category);
    return true;
  }) ?? null;
}

export interface AuthoritativeVerdict {
  verdict: RiskLevel;
  ruleScore: number;
  suggestion: string;
  trustedMatch: RagMatch | null;
  rag: Awaited<ReturnType<typeof rag_search>>;
  sandbox: SandboxEnvelope | null;
  normalized: Awaited<ReturnType<typeof normalize>>;
}

/**
 * 权威风险判定：规则 + 相关 RAG 案例 + 沙箱（如有链接），三者取最高风险。
 * 专业研判页与 AI 助手都调用它，保证同一输入、同一检测条件下给出同一风险等级。
 */
export async function computeAuthoritativeVerdict(text: string): Promise<AuthoritativeVerdict> {
  const normalized = await normalize(text);
  const ruleScore = computeRuleScore(normalized);
  const rag = await rag_search(text);
  const trustedMatch = relevantRagMatch(rag, normalized);

  let sandbox: SandboxEnvelope | null = null;
  let sandboxLevel: RiskLevel | null = null;
  const url = normalized.urls[0];
  if (url) {
    try {
      sandbox = await sandboxAnalyze(url, text);
    } catch {
      sandbox = null;
    }
    if (sandbox) {
      const template = sandbox.source === "tier0" || sandbox.source === "virustotal+tier0";
      const trustedDomain = sandbox.source === "tier0" && sandbox.result.verdict === "安全";
      const host = extractHttpUrl(url)?.hostname;
      const demo = sandbox.source === "tier0" && Boolean(host && isReservedAnalysisHost(host));
      sandboxLevel = (!template || trustedDomain || demo)
        ? asRiskLevel(sandbox.result.verdict)
        : sandbox.observedVerdict ?? null;
    }
  }

  const ragLevel = trustedMatch && trustedMatch.riskLabel !== "安全" ? trustedMatch.riskLabel : null;
  const fallback: RiskLevel = normalized.urls.length ? "待核验" : "安全";
  const verdict = finalizeVerdict(sandboxLevel, ragLevel, ruleScore, fallback);

  return {
    verdict,
    ruleScore,
    suggestion: deriveSuggestion(verdict),
    trustedMatch,
    rag,
    sandbox,
    normalized,
  };
}
