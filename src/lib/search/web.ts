// src/lib/search/web.ts —— 联网搜索：DeepSeek（优先）+ Bing（免费兜底）
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

function stripHtml(text: string) {
  return text
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#\d+;/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** 免费兜底：抓取 Bing（cn.bing.com）搜索结果，无需 key；稳定性一般，仅供演示 */
async function searchBing(query: string, limit: number): Promise<WebSearchResult[]> {
  try {
    const url = `https://cn.bing.com/search?q=${encodeURIComponent(query)}&setlang=zh-CN&count=10`;
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept-Language": "zh-CN,zh;q=0.9",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const html = await response.text();

    const results: WebSearchResult[] = [];
    const blockRegex = /<li class="b_algo"[^>]*>([\s\S]*?)<\/li>/g;
    let match: RegExpExecArray | null;
    while ((match = blockRegex.exec(html)) && results.length < limit) {
      const block = match[1];
      const linkMatch = /<h2[^>]*>\s*<a[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i.exec(block);
      if (!linkMatch) continue;
      const href = linkMatch[1];
      const title = stripHtml(linkMatch[2]);
      const snippetMatch = /<p[^>]*>([\s\S]*?)<\/p>/i.exec(block);
      const snippet = snippetMatch ? stripHtml(snippetMatch[1]) : "";
      if (title && href) results.push({ title, url: href, content: snippet.slice(0, 500) });
    }
    return results;
  } catch {
    return [];
  }
}

/** 联网搜索：DeepSeek 优先；未配置/返回空/失败则降级 Bing 免费兜底 */
export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) {
    const results = await searchDeepSeek(query, deepseekKey, limit);
    if (results.length > 0) return results;
  }

  return searchBing(query, limit);
}
