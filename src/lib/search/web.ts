// src/lib/search/web.ts —— 联网搜索：DeepSeek（优先）/ 博查 / Tavily / Bing（免费兜底）
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

async function searchBocha(query: string, apiKey: string, limit: number): Promise<WebSearchResult[]> {
  try {
    const response = await fetch("https://api.bochaai.com/v1/web-search", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query, summary: false, count: limit }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      data?: { webPages?: { value?: Array<{ name?: string; url?: string; snippet?: string; score?: number }> } };
    };
    const pages = data.data?.webPages?.value ?? [];
    return pages
      .filter((p) => p.name && p.url)
      .map((p) => ({ title: p.name ?? "", url: p.url ?? "", content: (p.snippet ?? "").slice(0, 500), score: p.score }));
  } catch {
    return [];
  }
}

async function searchTavily(query: string, apiKey: string, limit: number): Promise<WebSearchResult[]> {
  try {
    const response = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: apiKey, query, search_depth: "basic", include_answer: false, max_results: limit }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
    };
    return (data.results ?? [])
      .filter((r) => r.title && r.url)
      .map((r) => ({ title: r.title ?? "", url: r.url ?? "", content: (r.content ?? "").slice(0, 500), score: r.score }));
  } catch {
    return [];
  }
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

/** 联网搜索：DeepSeek > 博查 > Tavily > Bing（免费兜底）；全部失败则返回空 */
export async function searchWeb(query: string, limit = 5): Promise<WebSearchResult[]> {
  const deepseekKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (deepseekKey) return searchDeepSeek(query, deepseekKey, limit);

  const bochaKey = process.env.BOCHA_API_KEY?.trim();
  if (bochaKey) return searchBocha(query, bochaKey, limit);

  const tavilyKey = process.env.TAVILY_API_KEY?.trim();
  if (tavilyKey) return searchTavily(query, tavilyKey, limit);

  return searchBing(query, limit);
}
