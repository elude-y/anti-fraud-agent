import { createSupabaseClient } from "./supabase";

export type CaseItem = {
  id: string;
  title: string;
  category: string;
  risk_label: '安全'|'可疑'|'高危'|'诈骗';
  content: string;
  similarity?: number;
  source: string|null;
};
/** 获取cases列表，支持分类、关键词搜索，用于契约接口 */
export async function getCasesList(category?: string, q?: string, page = 1) {
  const supabase = createSupabaseClient();
  const pageSize = 10;
  let query = supabase.from("cases").select("*", { count: "exact" });
  if(category) query = query.eq("category", category);
  if(q) query = query.ilike("title", `%${q}%`);
  const from = (page -1)*pageSize;
  const to = from + pageSize -1;
  query = query.range(from,to);
  const { data, count, error } = await query;
  if(error) throw error;
  return { items: data as CaseItem[], total: count ?? 0 };
}

export type VectorSearchRow = {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
  similarity: number;
};

/**
 * 向量检索top-K案例，K=5，文档要求。
 *
 * 走 Supabase RPC（函数 match_cases，见 supabase/migrations/02_match_cases.sql），
 * 因为 PostgREST 的 select 不支持 `1 - (embedding <=> $1)` 这种 SQL 表达式，
 * 必须把相似度计算放到数据库函数里。
 */
export async function vectorSearchCases(queryVector: number[], topK:number =5): Promise<VectorSearchRow[]> {
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc("match_cases", {
    query_embedding: queryVector,
    match_count: topK,
  });
  if(error) throw error;
  return (data ?? []) as VectorSearchRow[];
}
