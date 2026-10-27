import type { RagMatch, RagPatternMatch, RagSearchResult, ListMatch } from "@/lib/contracts";
import { vectorSearchCases } from "@/lib/db/cases";
import { vectorSearchPatterns } from "@/lib/db/patterns";
import { isSupabaseConfigured } from "@/lib/db/supabase";
import { createEmbedding } from "@/lib/rag/embedding";
import { calcSignals } from "@/lib/rag/signals";
import { rerank } from "@/lib/rag/rerank";
import { searchMemory, searchMemoryPatterns, memoryStoreSize } from "@/lib/rag/memoryStore";
import { searchAntiFraudCases } from "@/lib/rag/search";
import { checkList, type ListHit } from "./iocList";

const MIN_RELEVANCE = 0.08;

/** 转成契约结构：去掉内部的 entityOnly，补充 decisive */
function toListMatch(hit: ListHit | null, decisive: boolean): ListMatch | null {
  if (!hit) return null;
  return {
    list: hit.list,
    type: hit.type,
    value: hit.value,
    verdict: hit.verdict,
    matchedBy: hit.matchedBy,
    decisive,
  };
}

const EMPTY_SIGNALS = { topSimilarity: 0, labelAgreement: 0, coverageScore: 0 };

/**
 * RAG 检索（合并 B 第二/三周 + C 第二周）：
 *   1) 联网：Supabase 向量检索（案例 match_cases + 话术 match_patterns）
 *   2) 离线：内存向量库兜底（B 的 memoryStore，案例 + 话术）
 *   3) 兜底：demo 关键词检索（C 的 search.ts）
 *   4) 重排：混合打分 + 可选 LLM（B 的 rerank）
 *   5) 信号：要素覆盖度 + 加权一致性（B 的 calcSignals）
 */
export async function rag_search(query: string): Promise<RagSearchResult> {
  // 0. 黑白名单优先判定：白名单仅在「输入是裸实体」时短路
  const listHit = await checkList(query);
  if (listHit?.list === "white" && listHit.entityOnly) {
    return {
      matches: [],
      patterns: [],
      ...EMPTY_SIGNALS,
      listMatch: toListMatch(listHit, true),
    };
  }

  const forcedOffline = process.env.RAG_OFFLINE === "1";
  let matches: RagMatch[] = [];
  let patterns: RagPatternMatch[] = [];

  // 1. 联网路径：Supabase 向量检索（案例 + 话术）
  if (isSupabaseConfigured() && !forcedOffline) {
    try {
      const queryVec = await createEmbedding(query);

      const raw = await vectorSearchCases(queryVec, 5);
      matches = raw.map((item) => ({
        caseId: item.id,
        title: item.title,
        category: item.category,
        riskLabel: item.risk_label as RagMatch["riskLabel"],
        content: item.content,
        similarity: Number(item.similarity),
        source: item.source ?? "Supabase 案例库",
      })).filter((item) => item.similarity >= MIN_RELEVANCE);

      // 话术模式单独兜底：它失败不应影响已拿到的案例结果
      try {
        const pRows = await vectorSearchPatterns(queryVec, 3);
        patterns = pRows.map((r) => ({
          patternId: r.id,
          pattern: r.pattern,
          category: r.category,
          keywords: r.keywords ?? [],
          similarity: Number(Number(r.similarity).toFixed(4)),
        })).filter((item) => item.similarity >= MIN_RELEVANCE);
      } catch (pe) {
        console.warn(`话术模式检索失败，改用内存库：${(pe as Error).message}`);
        patterns = searchMemoryPatterns(query, queryVec, 3);
      }
    } catch (err) {
      console.warn(`向量检索失败，降级内存库（${(err as Error).message}）`);
      matches = [];
    }
  }

  // 2. 离线兜底：内存向量库（案例 + 话术）
  if (matches.length === 0 && memoryStoreSize() > 0) {
    let queryVec: number[] | null = null;
    try {
      queryVec = await createEmbedding(query);
    } catch {
      queryVec = null;
    }
    matches = searchMemory(query, queryVec, 5).map((m) => ({
      caseId: m.caseId,
      title: m.title,
      category: m.category,
      riskLabel: m.riskLabel as RagMatch["riskLabel"],
      content: m.content,
      similarity: m.similarity,
      source: m.source ?? "本地案例库",
    })).filter((item) => item.similarity >= MIN_RELEVANCE);
    patterns = searchMemoryPatterns(query, queryVec, 3)
      .filter((item) => item.similarity >= MIN_RELEVANCE);
  }

  // 3. 最终兜底：demo 关键词检索（C 的 search.ts）
  if (matches.length === 0) {
    const fallback = searchAntiFraudCases(query);
    return { ...fallback, patterns, listMatch: toListMatch(listHit, listHit?.list === "black") };
  }

  // 4. 重排（B 的 rerank：混合打分 + 可选 LLM）
  const reranked = await rerank(query, {
    matches,
    topSimilarity: 0,
    labelAgreement: 0,
    coverageScore: 0,
  });

  // 5. 信号（B 的 calcSignals，含 query 要素覆盖）
  const sig = calcSignals(reranked.matches, query);
  // 黑名单命中是决定性判定；白名单未短路时只是信号（decisive = false）
  const decisive = listHit?.list === "black";
  return { matches: reranked.matches, patterns, ...sig, listMatch: toListMatch(listHit, decisive) };
}
