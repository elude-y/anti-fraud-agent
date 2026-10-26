import type { RagSearchResult } from "./retrieve";
import { keywordScore, hasSpecificElements, highRiskElementCount, type MatchItem } from "./signals";

/**
 * 检索重排（第二周）。
 *
 * 两级策略：
 *   1) 混合打分重排：向量相似度 0.7 + 关键词要素重合 0.3
 *      —— 纯本地计算，不依赖网络，离线也能用
 *   2) LLM 重排：配置了 DEEPSEEK_API_KEY 才启用，让模型按语义相关性重新排序
 *      —— 调用失败/超时/无 key 时自动跳过，不影响主链路
 */

const W_VECTOR = 0.7;
const W_KEYWORD = 0.3;
const LLM_TIMEOUT_MS = 8000;

export function hybridScore(query: string, m: MatchItem): number {
  const kw = keywordScore(query, `${m.title} ${m.content}`);
  return W_VECTOR * m.similarity + W_KEYWORD * kw;
}

/** 按混合分排序（稳定：分数相同保持原顺序） */
export function hybridRerank(query: string, matches: MatchItem[]): MatchItem[] {
  // query 只由通用词构成时（如“短信链接说账号异常”），关键词没有区分度，
  // 强行重排会把错误类别顶上来 —— 此时保留向量原序。
  if (!hasSpecificElements(query)) return matches;

  // 输入含多个高危索取要素（验证码/银行卡/转账…）时，
  // 「安全类案例」不应排在诈骗案例之前 —— 官方域名 + 索要凭证本身就是仿冒特征。
  const penalizeSafe = highRiskElementCount(query) >= 2;

  const scored = matches.map((m, i) => {
    let s = hybridScore(query, m);
    if (penalizeSafe && m.riskLabel === "安全") s *= 0.5;
    return { m, i, s };
  });
  scored.sort((a, b) => (b.s - a.s) || (a.i - b.i));
  return scored.map((x) => x.m);
}

/**
 * LLM 重排：让模型只做排序、不改内容，降低幻觉风险。
 * 返回按新顺序排列的下标数组；任何异常都返回 null 表示放弃。
 */
async function llmRerank(query: string, matches: MatchItem[]): Promise<number[] | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey || matches.length < 2) return null;

  const baseURL = process.env.DEEPSEEK_BASE_URL ?? "https://api.deepseek.com/v1";
  const candidates = matches
    .map((m, i) => `[${i}] 标题: ${m.title} | 类别: ${m.category} | 摘要: ${m.content.slice(0, 80)}`)
    .join("\n");

  try {
    const res = await fetch(`${baseURL}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: "deepseek-chat",
        temperature: 0,
        messages: [
          {
            role: "system",
            content:
              "你是反诈案例检索的重排器。根据用户输入与候选案例的语义相关性排序，" +
              "只输出下标数组的 JSON，例如 [2,0,1,3,4]，不要解释。",
          },
          { role: "user", content: `用户输入：${query}\n\n候选案例：\n${candidates}` },
        ],
      }),
      signal: AbortSignal.timeout(LLM_TIMEOUT_MS),
    });

    if (!res.ok) return null;
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = json.choices?.[0]?.message?.content ?? "";
    const m = text.match(/\[[\d,\s]+\]/);
    if (!m) return null;

    const order = JSON.parse(m[0]) as number[];
    const valid =
      Array.isArray(order) &&
      order.length === matches.length &&
      new Set(order).size === order.length &&
      order.every((i) => Number.isInteger(i) && i >= 0 && i < matches.length);
    return valid ? order : null;
  } catch {
    return null;
  }
}

/** 契约入口：重排后返回同结构结果（similarity 保持原值，仅改变顺序） */
export async function rerank(query: string, res: RagSearchResult): Promise<RagSearchResult> {
  let matches: MatchItem[] = res.matches;

  // 1) 混合打分（始终执行）
  matches = hybridRerank(query, matches);

  // 2) LLM 重排（可选）
  const order = await llmRerank(query, matches);
  if (order) {
    const before = matches.map((m) => m.caseId).join(",");
    matches = order.map((i) => matches[i]);
    const after = matches.map((m) => m.caseId).join(",");
    if (before !== after) {
      console.log("[rerank] LLM 重排生效");
    }
  }

  return { ...res, matches };
}
