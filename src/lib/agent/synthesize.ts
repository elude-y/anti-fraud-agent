// src/lib/agent/synthesize.ts —— 综合研判：确定性分级 + 处置建议
import type { RiskLevel, SandboxResult } from '@/lib/contracts';
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
  if (confidence.score >= 0.8 && matches.length > 0) {
    return matches[0].riskLabel;
  }
  // 兜底
  return confidence.level === 'low' ? '高危' : '可疑';
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
