// src/lib/agent/stateMachine.ts —— 路径规划（护栏内的模型规划 + 规则兜底）
import type { NormalizedInput } from './normalize';
import type { ConfidenceResult } from './confidence';
import { computeRuleScore } from './rules';
import { SYSTEM_PROMPT } from './prompt';

export interface PathDecision {
  path: 'fast' | 'sandbox';
  forceSandbox: boolean; // 是否被规则护栏强制进沙箱
  planner: 'llm' | 'rule'; // 决策者：模型规划 or 规则兜底
  reason: string;
}

/** 确定性规则兜底（也是硬护栏；LLM 未配置/失败时使用） */
function decidePathByRule(confidence: ConfidenceResult, input: NormalizedInput): PathDecision {
  const ruleScore = computeRuleScore(input);

  // 硬规则兜底：短链必须进沙箱（隐藏真实目的地，RAG 无法判断）
  if (input.resolvedUrls.length > 0) {
    return {
      path: 'sandbox',
      forceSandbox: true,
      planner: 'rule',
      reason: '命中短链，需沙箱解析真实目的地',
    };
  }

  // 高置信度优先：走快速路径不进沙箱（即使含风险词，也信任 RAG 结论）
  if (confidence.path === 'fast') {
    return { path: 'fast', forceSandbox: false, planner: 'rule', reason: confidence.reason };
  }

  // 其余（低/中置信度，或规则兜底）走沙箱
  return {
    path: 'sandbox',
    forceSandbox: ruleScore >= 0.5,
    planner: 'rule',
    reason: confidence.reason,
  };
}

/** 模型规划：让 LLM 在护栏内决定 fast / sandbox */
async function planPathWithLLM(
  confidence: ConfidenceResult,
  input: NormalizedInput,
): Promise<PathDecision | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;

  const evidence = [
    `综合置信度：${(confidence.score * 100).toFixed(0)}%`,
    `相似度：${(confidence.signals.similarity * 100).toFixed(0)}%`,
    `标签一致性：${(confidence.signals.agreement * 100).toFixed(0)}%`,
    `要素覆盖度：${(confidence.signals.coverage * 100).toFixed(0)}%`,
    `规则分：${(confidence.signals.rule * 100).toFixed(0)}%`,
    `风险词：${input.riskKeywords.slice(0, 6).join('、') || '无'}`,
    `实体：${input.entities.slice(0, 6).join('、') || '无'}`,
    `链接数：${input.urls.length}`,
    `短链数：${input.resolvedUrls.length}`,
  ].join('\n');

  const userPrompt = [
    '根据以下信号决策下一步路径（fast=直接研判 / sandbox=动态验证）：',
    '',
    evidence,
  ].join('\n');

  try {
    const baseURL = (process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1').replace(/\/$/, '');
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_CHAT_MODEL ?? 'deepseek-chat',
        temperature: 0,
        max_tokens: 16,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      }),
      signal: AbortSignal.timeout(8000),
    });

    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim() ?? '';
    if (/sandbox/i.test(text)) {
      return { path: 'sandbox', forceSandbox: false, planner: 'llm', reason: '模型规划：证据不足，需沙箱动态验证' };
    }
    if (/fast/i.test(text)) {
      return { path: 'fast', forceSandbox: false, planner: 'llm', reason: '模型规划：证据充分，直接综合研判' };
    }
    return null;
  } catch {
    return null;
  }
}

/** 路径决策：规则护栏（短链/低置信度 → 强制沙箱）→ 模型规划（仅高置信度时可加谨慎） */
export async function decidePath(
  confidence: ConfidenceResult,
  input: NormalizedInput,
): Promise<PathDecision> {
  // 1) 规则护栏（模型不可覆盖）：短链 / 低中置信度 → 必须沙箱
  const rule = decidePathByRule(confidence, input);
  if (rule.path === 'sandbox') return rule;

  // 2) 模型规划：规则判 fast（高置信度）时，模型可决定是否更谨慎进沙箱
  const llm = await planPathWithLLM(confidence, input);
  if (llm?.path === 'sandbox') return llm;

  // 3) 模型不反对 → 保持规则的 fast 决策
  return rule;
}
