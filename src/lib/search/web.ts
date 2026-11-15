// src/lib/search/web.ts —— 联网搜索：仅 DeepSeek 官方搜索接口
export interface WebSearchResult {
  title: string;
  url: string;
  content: string;
  score?: number;
}

/** DeepSeek 官方搜索接口（用现有 DEEPSEEK_API_KEY，无需额外注册） */
async function searchDeepSeek(query: string, apiKey: string, limit: number): Promise<WebSearchResult[]> {
  try {
    const response = await fetch("https://api.deepseek.com/v1/tools/search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, count: limit, need_content: false }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return [];

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; snippet?: string; summary?: string; rerank_score?: number }>;
    };
    return (data.results ?? [])
      .filter((r) => r.title && r.url)
      .map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        content: (r.summary ?? r.snippet ?? "").slice(0, 800),
        score: r.rerank_score,
      }));
  } catch {
    return [];
  }
}

/** 联网搜索：仅 DeepSeek；未配置或返回空则返回空数组 */
export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (!deepseekKey) return [];
  return searchDeepSeek(query, deepseekKey, limit);
}
