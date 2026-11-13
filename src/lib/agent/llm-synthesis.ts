// src/lib/agent/llm-synthesis.ts —— 用 DeepSeek 做最终证据综合研判（LLM 主链路）
// 约束：只允许引用传入的结构化证据，禁止编造新事实/机构/网址/电话。
import type { RiskLevel } from "@/lib/contracts";

export interface SynthesisEvidence {
  verdict: RiskLevel;
  confidence: number;
  category: string;
  summary: string;
  suggestion: string;
  ragTop: { title: string; category: string; riskLabel: string; similarity: number } | null;
  sandbox: { source: string; formFields: string[]; iocHits: Array<{ value: string; verdict: string }> } | null;
}

/** 返回 LLM 生成的综合研判摘要；失败/未配置时返回 null，由调用方回退到规则模板 */
export async function synthesizeWithLLM(input: SynthesisEvidence): Promise<string | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) return null;

  const evidence = [
    `风险等级：${input.verdict}`,
    `综合置信度：${(input.confidence * 100).toFixed(0)}%`,
    `输入类型：${input.category}`,
    input.ragTop
      ? `最相似案例：「${input.ragTop.title}」（${input.ragTop.category}，标签 ${input.ragTop.riskLabel}，相似度 ${(input.ragTop.similarity * 100).toFixed(0)}%）`
      : "最相似案例：无高相关匹配",
    `沙箱来源：${input.sandbox?.source ?? "未调用沙箱"}`,
    input.sandbox?.formFields.length
      ? `敏感字段：${input.sandbox.formFields.slice(0, 5).join("、")}`
      : "敏感字段：无",
    input.sandbox?.iocHits.length
      ? `风险 IOC：${input.sandbox.iocHits.slice(0, 5).map((h) => `${h.value}（${h.verdict}）`).join("、")}`
      : "风险 IOC：无",
    `规则摘要：${input.summary}`,
    `处置建议：${input.suggestion}`,
  ].join("\n");

  const prompt = [
    "你是反诈研判助手。下面是系统已经得出的确定性结论和证据。",
    "请用 2~3 句话向普通用户解释：为什么判为这个等级、主要依据是什么、建议怎么做。",
    "只能引用下面已有的证据，严禁编造任何新事实、机构名称、网址、电话或案例。",
    "不要使用 Markdown 表格。",
    "",
    evidence,
  ].join("\n");

  try {
    const baseURL = (process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1").replace(/\/$/, "");
    const response = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: process.env.DEEPSEEK_CHAT_MODEL ?? "deepseek-chat",
        temperature: 0.3,
        max_tokens: 420,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;
    const data = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content?.trim();
    return text && text.length > 8 ? text : null;
  } catch {
    return null;
  }
}
