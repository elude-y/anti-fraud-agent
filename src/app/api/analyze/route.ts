// src/app/api/analyze/route.ts 
//
// 说明：
//  - C 用 useChat 消费 AI SDK 原生流（文本增量 + 工具调用 start/done 事件），
//    前端「阶段时间线」由 tool 事件的 start/done 驱动。
//  - 最终结论（契约⑤ VerdictResult）后续周次以结构化 JSON 输出，本周先跑通文本流。
//  - mock 工具：B 交付后把 ragSearch 换成真实实现；C 交付后把 sandboxAnalyze 换成真实实现。

import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import type { RagSearchResult, SandboxResult } from '@/lib/contracts';

const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
});

// mock 工具 —— B 交付后替换为真实 rag_search
const ragSearch = tool({
  description: '检索相似诈骗案例与话术模式，返回相似度等置信度信号',
  parameters: z.object({
    query: z.string().describe('从输入提取的检索查询'),
  }),
  execute: async ({ query }): Promise<RagSearchResult> => {
    void query;
    return {
      matches: [],
      topSimilarity: 0.5,
      labelAgreement: 1,
      coverageScore: 0.5,
    };
  },
});

// mock 工具 —— C 交付后替换为真实 sandbox_analyze
const sandboxAnalyze = tool({
  description: '把可疑 URL 提交沙箱做动态分析，返回行为证据',
  parameters: z.object({
    url: z.string().describe('要分析的可疑 URL'),
  }),
  execute: async ({ url }): Promise<SandboxResult> => {
    return {
      redirectChain: [],
      finalUrl: url,
      formFields: [],
      jsBehaviors: [],
      iocHits: [],
      verdict: 'mock',
    };
  },
});

export async function POST(req: Request) {
  const { input } = await req.json();

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: [
      '你是反诈研判分析师。SOP：',
      '1) 规范化输入，识别 URL 与关键实体；',
      '2) 调 rag_search 检索相似案例；',
      '3) 低置信度或样本可疑时调 sandbox_analyze；',
      '4) 综合证据输出风险分级(安全/可疑/高危/诈骗)+置信度+处置建议。',
    ].join('\n'),
    tools: { rag_search: ragSearch, sandbox_analyze: sandboxAnalyze },
    prompt: input,
  });

  return result.toDataStreamResponse();
}
