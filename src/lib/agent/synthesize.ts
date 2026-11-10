// src/lib/agent/synthesize.ts —— 综合研判：确定性分级 + 处置建议
import type { RiskLevel, SandboxResult } from '@/lib/contracts';
import { THRESHOLD_HIGH } from './confidence';
import type { ConfidenceResult } from './confidence';

export function deriveVerdict(
  confidence: ConfidenceResult,
  matches: Array<{ riskLabel: RiskLevel }>,
  sandbox: SandboxResult | null,
): RiskLevel {
  // 沙箱有明确结论 → 以沙箱为准（沙箱行为可推翻 RAG 结论）
  if (sandbox) {
    const v = sandbox.verdict;
    if (v === '诈骗' || v === '高危' || v === '可疑' || v === '安全') return v;
  }
  // 快速路径高置信度 → 采用 RAG top-1 标签
  if (confidence.score >= THRESHOLD_HIGH && matches.length > 0) {
    return matches[0].riskLabel;
  }
  // 兜底：无任何风险信号 → 安全；有信号但不确定 → 可疑（不再盲目判高危）
  // 相似度用 >= 0.3 而不是 > 0：离线时 bigram 兜底会给正常文本一个很低的虚假相似度
  const hasSignal = confidence.signals.rule >= 0.3 || confidence.signals.similarity >= 0.3;
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
    case '安全':
      return '未发现明显风险，可通过官方入口再次核验后访问。';
  }
}
