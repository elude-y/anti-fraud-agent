// src/app/api/analyze/route.ts —— 第 1 周：接入 normalize + prompt，跑通闭环
import { streamText, tool } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { z } from 'zod';
import { SYSTEM_PROMPT } from '@/lib/agent/prompt';
import { normalize } from '@/lib/agent/normalize';
import type { RagSearchResult, SandboxResult } from '@/lib/contracts';

const deepseek = createOpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY,
  baseURL: process.env.DEEPSEEK_BASE_URL ?? 'https://api.deepseek.com/v1',
});

// mock 工具 —— B 交付后替换为真实 rag_search
const ragSearch = tool({
  description: '检索相似诈骗案例与话术模式，返回相似度等置信度信号',
  inputSchema: z.object({
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
  inputSchema: z.object({
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
  const normalized = await normalize(input);

  const result = streamText({
    model: deepseek('deepseek-chat'),
    system: SYSTEM_PROMPT,
    tools: { rag_search: ragSearch, sandbox_analyze: sandboxAnalyze },
    prompt: [
      `原始输入：${normalized.raw}`,
      `输入类型：${normalized.inputType}`,
      `识别到的 URL：${normalized.urls.join(', ') || '无'}`,
      `短链展开：${normalized.resolvedUrls.map((r) => `${r.from} -> ${r.to}`).join('; ') || '无'}`,
      `关键实体：${normalized.entities.join(', ') || '无'}`,
      `命中高危词：${normalized.riskKeywords.join(', ') || '无'}`,
    ].join('\n'),
  });

  return result.toUIMessageStreamResponse();
}
