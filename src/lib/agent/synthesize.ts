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

/** 白名单可信域名 → 权威"安全"，不被 RAG 覆盖 */
export function isTrustedDomainSafe(sandbox: SandboxResult | null): boolean {
  if (!sandbox || sandbox.verdict !== "安全") return false;
  const raw = sandbox.raw as { template?: string } | undefined;
  return raw?.template === "trusted-domain";
}

export function deriveVerdict(
  confidence: ConfidenceResult,
  matches: Array<{ riskLabel: RiskLevel; similarity: number }>,
  sandbox: SandboxResult | null,
): RiskLevel {
  // 1) 白名单可信域名：权威安全，不被 RAG 覆盖
  if (isTrustedDomainSafe(sandbox)) return "安全";

  const sandboxVerdict: RiskLevel | null = sandbox ? (sandbox.verdict as RiskLevel) : null;
  // 2) RAG 只在相似度足够高且为"风险标签"时采信；RAG 命中安全案例不产生定论（交给规则信号）
  const ragVerdict = matches.length > 0
    && matches[0].similarity >= MIN_RAG_SIMILARITY
    && matches[0].riskLabel !== "安全"
    ? matches[0].riskLabel
    : null;

  // 3) 统一判定：取沙箱与 RAG 中风险更高的一方
  if (sandboxVerdict || ragVerdict) {
    return maxRisk(sandboxVerdict, ragVerdict);
  }
  // 4) 无沙箱无高置信 RAG：只认规则信号（向量相似度对正常文本有 0.3~0.6 虚高，不再用于兜底）
  const hasSignal = confidence.signals.rule >= 0.3;
  return hasSignal ? '可疑' : '安全';
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
