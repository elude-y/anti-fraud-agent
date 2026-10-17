import { vectorSearchCases } from "../db/cases";
import { createEmbedding } from "./embedding";
import { calcSignals } from "./signals";
import { createSupabaseClient } from "../db/supabase";
import { rerank } from "./rerank";


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
  coverageScore: number;}
export async function rag_search(query:string):Promise<RagSearchResult>{
  // 1.获取向量（失败时降级为关键词检索，保证断网也能返回结果）
  let queryVec: number[] | null = null;
  try {
    queryVec = await createEmbedding(query);
  } catch (err) {
    console.error("embedding 调用失败，降级关键词检索：", (err as Error).message);
    queryVec = null;
  }

  let matches: RagSearchResult["matches"] = [];

  if(queryVec){
    // 向量正常，执行向量检索
    const raw = await vectorSearchCases(queryVec,5);
    matches = raw.map(r=>({
      caseId: r.id,
      title: r.title,
      category: r.category,
      riskLabel: r.risk_label as "安全"|"可疑"|"高危"|"诈骗",
      content: r.content,
      similarity: Number(r.similarity),
      source: r.source,
    }));
  }else{
    // ⭐embedding调用失败，降级关键词检索
    const supabase = createSupabaseClient()
    const {data} = await supabase
      .from("cases")
      .select("id,title,category,risk_label,content,source")
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(5)
    if(!data) matches = []
    else{
      matches = data.map(r=>({
        caseId: r.id,
        title: r.title,
        category: r.category,
        riskLabel: r.risk_label as "安全"|"可疑"|"高危"|"诈骗",
        content: r.content,
        similarity:0.5, //关键词检索固定虚拟相似度
        source: r.source,
      }))
    }
  }

  // 2.重排（混合打分 + 可选 LLM）
  const reranked = await rerank(query, {
    matches,
    topSimilarity: 0,
    labelAgreement: 0,
    coverageScore: 0,
  });

  // 3.计算三个置信信号（基于重排后的顺序与 query 的要素覆盖）
  const sig = calcSignals(reranked.matches, query);
  return { matches: reranked.matches, ...sig };
}
