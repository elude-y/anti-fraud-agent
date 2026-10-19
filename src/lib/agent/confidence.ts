// src/lib/agent/confidence.ts —— 置信度计算（四信号加权）+ 路径建议
export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type Path = 'fast' | 'sandbox';

export interface ConfidenceResult {
  score: number; // 综合置信度 [0,1]
  signals: { similarity: number; agreement: number; rule: number; coverage: number };
  level: ConfidenceLevel;
  path: Path;
  reason: string; // 决策理由（可解释性，答辩展示）
}

// 权重与阈值（暴露为常量 = 可配置）
const WEIGHTS = { similarity: 0.5, agreement: 0.2, rule: 0.2, coverage: 0.1 };
const THRESHOLD_HIGH = 0.8;
const THRESHOLD_MEDIUM = 0.55;

export function computeConfidence(
  topSimilarity: number,
  labelAgreement: number,
  coverageScore: number,
  ruleScore: number,
): ConfidenceResult {
  const signals = {
    similarity: clamp01(topSimilarity),
    agreement: clamp01(labelAgreement),
    rule: clamp01(ruleScore),
    coverage: clamp01(coverageScore),
  };

  const score = clamp01(
    WEIGHTS.similarity * signals.similarity +
      WEIGHTS.agreement * signals.agreement +
      WEIGHTS.rule * signals.rule +
      WEIGHTS.coverage * signals.coverage,
  );

  let level: ConfidenceLevel;
  let path: Path;
  let reason: string;

  if (score >= THRESHOLD_HIGH && signals.agreement >= 0.6) {
    level = 'high';
    path = 'fast';
    reason = `置信度 ${score.toFixed(2)} 高且标签一致 → 快速路径（不进沙箱）`;
  } else if (score >= THRESHOLD_MEDIUM) {
    level = 'medium';
    path = 'sandbox';
    reason = `置信度 ${score.toFixed(2)} 中等 → 沙箱深度验证`;
  } else {
    level = 'low';
    path = 'sandbox';
    reason = `置信度 ${score.toFixed(2)} 低 → 必须沙箱动态验证`;
  }

  return { score, signals, level, path, reason };
}

function clamp01(n: number): number {
  if (n === undefined || n === null || Number.isNaN(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
