import { vectorSearchCases } from "../db/cases";
import { vectorSearchPatterns } from "../db/patterns";
import { createEmbedding } from "./embedding";
import { calcSignals } from "./signals";
import { rerank } from "./rerank";
import { searchMemory, searchMemoryPatterns, memoryStoreSize } from "./memoryStore";
import type { RagPatternMatch } from "../contracts";

// 契约输出类型
export interface RagSearchResult {
  matches: Array<{
    caseId: string;
    title: string;
    category: string;
    riskLabel: '安全'|'可疑'|'高危'|'诈骗';
    content: string;
    similarity: number;
    source: string|null;
  }>;
  topSimilarity: number;
  labelAgreement: number;
  coverageScore: number;
  /** 命中的话术模式（与案例互补，可选字段） */
  patterns?: RagPatternMatch[];
}

/** 把数据库返回的话术模式行映射成契约结构 */
function mapPatterns(
  rows: { id: string; pattern: string; category: string; keywords: string[] | null; similarity: number }[]
): RagPatternMatch[] {
  return rows.map((r) => ({
    patternId: r.id,
    pattern: r.pattern,
    category: r.category,
    keywords: r.keywords ?? [],
    similarity: Number(Number(r.similarity).toFixed(4)),
  }));
}

export async function rag_search(query:string):Promise<RagSearchResult>{
  let queryVec: number[] | null = null;
  let matches: RagSearchResult["matches"] = [];
  let patterns: RagPatternMatch[] = [];

  // RAG_OFFLINE=1 时强制走内存库，用于离线演示与兜底验证
  const forcedOffline = process.env.RAG_OFFLINE === "1";

  try {
    if (forcedOffline) throw new Error("RAG_OFFLINE=1，强制离线");

    // 1. 联网路径：embedding + 向量检索（RPC match_cases / match_patterns）
    queryVec = await createEmbedding(query);

    const raw = await vectorSearchCases(queryVec, 5);
    matches = raw.map(r=>({
      caseId: r.id,
      title: r.title,
      category: r.category,
      riskLabel: r.risk_label as "安全"|"可疑"|"高危"|"诈骗",
      content: r.content,
      similarity: Number(r.similarity),
      source: r.source,
    }));

    // 话术模式单独兜底：它失败不应影响已拿到的案例结果
    try {
      patterns = mapPatterns(await vectorSearchPatterns(queryVec, 3));
    } catch (pe) {
      console.warn(`话术模式检索失败，改用内存库：${(pe as Error).message}`);
      patterns = searchMemoryPatterns(query, queryVec, 3);
    }
  } catch (err) {
    // 2. 兜底路径：内存向量库（案例 + 话术一起降级）
    console.warn(
      `检索降级到内存向量库（${(err as Error).message}；内存库 ${memoryStoreSize()} 条）`
    );
    if (!queryVec && !forcedOffline) {
      try {
        queryVec = await createEmbedding(query);
      } catch {
        // 连 embedding 都不可用 → 走关键词检索
        queryVec = null;
      }
    }
    matches = searchMemory(query, queryVec, 5);
    patterns = searchMemoryPatterns(query, queryVec, 3);
  }

  // 3. 重排（混合打分 + 可选 LLM）
  const reranked = await rerank(query, {
    matches,
    topSimilarity: 0,
    labelAgreement: 0,
    coverageScore: 0,
  });

  // 4. 计算三个置信信号（基于重排后的顺序与 query 的要素覆盖）
  const sig = calcSignals(reranked.matches, query);
  return { matches: reranked.matches, patterns, ...sig };
}
