// src/app/api/analyze/route.ts —— 第 2 周：确定性编排（置信度调度）+ LLM 综合研判
import { generateText } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { runAnalysis } from '@/lib/agent/orchestrate';
import { deriveVerdict, deriveSuggestion } from '@/lib/agent/synthesize';
import type { EvidenceNode, VerdictResult } from '@/lib/contracts';

const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
});

export async function POST(req: Request) {
  const { input } = await req.json();

  // 1. 确定性编排：代码算置信度、决定路径、调用真实 RAG + 沙箱
  const analysis = await runAnalysis(input);

  // 2. 确定性分级（沙箱行为可推翻 RAG 结论）
  const verdict = deriveVerdict(analysis.confidence, analysis.rag.matches, analysis.sandbox);
  const suggestion = deriveSuggestion(verdict);

  // 3. LLM 生成一句话研判理由（增强可解释性）；失败则静默跳过
  let reason = '';
  try {
    const { text } = await generateText({
      model: deepseek('deepseek-chat'),
      system: '你是反诈研判分析师。基于给定证据，用一句话概括研判依据（不超过 50 字）。',
      prompt: [
        `风险等级：${verdict}`,
        `综合置信度：${(analysis.confidence.score * 100).toFixed(0)}%`,
        `路径：${analysis.decision.path}（${analysis.decision.reason}）`,
        `检索相似案例：${analysis.rag.matches.length} 条`,
        analysis.sandbox
          ? `沙箱结论：${analysis.sandbox.verdict}，跳转 ${analysis.sandbox.redirectChain.length} 次，表单字段 ${analysis.sandbox.formFields.length} 个`
          : '未触发沙箱（快速路径）',
      ].join('\n'),
    });
    reason = text.trim();
  } catch {
    reason = '';
  }

  // 4. 组装结论节点 + 最终结果
  const conclusionNode: EvidenceNode = {
    id: `conclusion-${Date.now()}`,
    type: 'conclusion',
    label: `研判结论：${verdict}`,
    payload: {
      description: suggestion,
      tags: [`置信度 ${(analysis.confidence.score * 100).toFixed(0)}%`, `路径 ${analysis.decision.path}`],
    },
    ts: Date.now(),
  };

  const result: VerdictResult = {
    verdict,
    confidence: Number(analysis.confidence.score.toFixed(2)),
    suggestion: reason ? `${reason.replace(/。+$/, '')}。${suggestion}` : suggestion,
    evidenceChain: [...analysis.evidenceChain, conclusionNode],
  };

  return Response.json(result);
}
