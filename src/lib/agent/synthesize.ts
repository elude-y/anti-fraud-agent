// src/lib/agent/synthesize.ts —— 综合研判：确定性分级 + 处置建议
import type { RiskLevel, SandboxResult } from '@/lib/contracts';
import type { ConfidenceResult } from './confidence';

const RISK_RANK: Record<RiskLevel, number> = { "安全": 0, "待核验": 1, "可疑": 2, "高危": 3, "诈骗": 4 };

/** 与生产 relevantRagMatch 一致：RAG 相似度低于此阈值不采信 */
export const MIN_RAG_SIMILARITY = 0.6;

/** 取更高风险的结论（统一封装，评测脚本与生产接口共用同一套判定） */
export function maxRisk(...levels: Array<RiskLevel | null | undefined>): RiskLevel {
  return levels
    .filter((level): level is RiskLevel => Boolean(level))
    .reduce((current, level) => (RISK_RANK[level] > RISK_RANK[current] ? level : current), "安全" as RiskLevel);
}

/**
 * 最终风险判定（唯一封装，网站接口与评测脚本共用）。
 *
 * 关键原则：白名单"安全"只是「网址可信」这一条安全证据，不能覆盖消息内容的
 * 高风险话术 / RAG 风险标签。取「沙箱 + RAG + 规则」三者的最高风险，
 * 因此"可信网址 + 诱导转账话术"会判为风险，而不是被白名单压成"安全"。
 *
 * 无任何证据时返回 fallback（生产接口用"待核验"，评测二分类用"安全"）。
 */
export function finalizeVerdict(
  sandboxVerdict: RiskLevel | null,
  ragVerdict: RiskLevel | null,
  ruleScore: number,
  fallback: RiskLevel,
): RiskLevel {
  const ruleVerdict: RiskLevel | null = ruleScore >= 0.5 ? "高危" : ruleScore >= 0.3 ? "可疑" : null;
  if (!sandboxVerdict && !ragVerdict && !ruleVerdict) return fallback;
  return maxRisk(sandboxVerdict, ragVerdict, ruleVerdict);
}

export function deriveVerdict(
  confidence: ConfidenceResult,
  matches: Array<{ riskLabel: RiskLevel; similarity: number }>,
  sandbox: SandboxResult | null,
): RiskLevel {
  const sandboxVerdict: RiskLevel | null = sandbox ? (sandbox.verdict as RiskLevel) : null;
  // RAG 只在相似度足够高且为"风险标签"时采信；RAG 命中安全案例不产生定论
  const ragVerdict = matches.length > 0
    && matches[0].similarity >= MIN_RAG_SIMILARITY
    && matches[0].riskLabel !== "安全"
    ? matches[0].riskLabel
    : null;

  return finalizeVerdict(sandboxVerdict, ragVerdict, confidence.signals.rule, "安全");
}

export function deriveSuggestion(verdict: RiskLevel): string {
  switch (verdict) {
    case '诈骗':
      return '这是典型诈骗话术，请勿点击链接、勿提供任何个人信息，建议向 96110 举报。';
    case '高危':
      return '存在较高风险，请勿访问或填写信息，通过官方渠道核实后再处理。';
    case '可疑':
      return '存在可疑特征，请谨慎对待，核实来源后再决定是否继续。';
    case '待核验':
      return '暂未完成真实验证，无法确认该链接是否安全，请先通过官方渠道核实后再访问。';
    case '安全':
      return '未发现明显风险，可通过官方入口再次核验后访问。';
  }
}
