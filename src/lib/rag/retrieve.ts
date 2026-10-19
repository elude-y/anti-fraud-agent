import { vectorSearchCases } from "../db/cases";
import { createEmbedding } from "./embedding";
import { calcSignals } from "./signals";
import { rerank } from "./rerank";
import { searchMemory, memoryStoreSize } from "./memoryStore";

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
}

export async function rag_search(query:string):Promise<RagSearchResult>{
  let queryVec: number[] | null = null;
  let matches: RagSearchResult["matches"] = [];

  // RAG_OFFLINE=1 时强制走内存库，用于离线演示与兜底验证
  const forcedOffline = process.env.RAG_OFFLINE === "1";

  try {
    if (forcedOffline) throw new Error("RAG_OFFLINE=1，强制离线");

    // 1. 联网路径：embedding + 向量检索（RPC match_cases）
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
  } catch (err) {
    // 2. 兜底路径：内存向量库
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
  return { matches: reranked.matches, ...sig };
}
