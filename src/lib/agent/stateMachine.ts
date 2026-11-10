// src/lib/agent/stateMachine.ts —— 路径调度状态机（含规则兜底）
import type { NormalizedInput } from './normalize';
import type { ConfidenceResult } from './confidence';
import { computeRuleScore } from './rules';

export interface PathDecision {
  path: 'fast' | 'sandbox';
  forceSandbox: boolean; // 是否被规则兜底强制进沙箱
  reason: string;
}

export function decidePath(confidence: ConfidenceResult, input: NormalizedInput): PathDecision {
  const ruleScore = computeRuleScore(input);

  // 硬规则兜底：短链必须进沙箱（隐藏真实目的地，RAG 无法判断）
  if (input.resolvedUrls.length > 0) {
    return {
      path: 'sandbox',
      forceSandbox: true,
      reason: '命中短链，需沙箱解析真实目的地',
    };
  }

  // 高置信度优先：走快速路径不进沙箱（即使含风险词，也信任 RAG 结论）
  if (confidence.path === 'fast') {
    return { path: 'fast', forceSandbox: false, reason: confidence.reason };
  }

  // 其余（低/中置信度，或规则兜底）走沙箱
  return {
    path: 'sandbox',
    forceSandbox: ruleScore >= 0.5,
    reason: confidence.reason,
  };
}
