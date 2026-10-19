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

  // 规则兜底：即使 RAG 置信度很高，以下情况也强制进沙箱（防绕过）
  const forceSandbox = input.resolvedUrls.length > 0 || ruleScore >= 0.5;

  if (forceSandbox) {
    return {
      path: 'sandbox',
      forceSandbox: true,
      reason: '命中强制沙箱规则（短链 / 索要银行卡·验证码·身份证等）',
    };
  }

  return { path: confidence.path, forceSandbox: false, reason: confidence.reason };
}
