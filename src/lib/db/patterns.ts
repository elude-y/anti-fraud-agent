import { createSupabaseClient } from "./supabase";

export type PatternRow = {
  id: string;
  pattern: string;
  category: string;
  keywords: string[] | null;
  similarity: number;
};

/**
 * 话术模式向量检索（top-K），走数据库函数 match_patterns
 * （见 supabase/migrations/03_match_patterns.sql）。
 */
export async function vectorSearchPatterns(
  queryVector: number[],
  topK: number = 3
): Promise<PatternRow[]> {
  // 懒加载：只在真正调用时才创建客户端，避免缺少环境变量时导入即抛错
  const supabase = createSupabaseClient();
  const { data, error } = await supabase.rpc("match_patterns", {
    query_embedding: queryVector,
    match_count: topK,
  });
  if (error) throw error;
  return (data ?? []) as PatternRow[];
}
