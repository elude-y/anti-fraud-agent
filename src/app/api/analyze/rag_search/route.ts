import { createSupabaseClient } from "@/lib/db/supabase";
import type { RagSearchResult, RagMatch } from "@/lib/contracts";
import { createEmbedding } from "@/lib/rag/embedding";
import { calcSignals } from "@/lib/rag/signals";

const supabase = createSupabaseClient();

type MatchRow = {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
  similarity: number;
};

export async function POST(req: Request) {
  const { query, topK = 3 } = await req.json();
  // 1. 文本转向量
  const embedding = await createEmbedding(query);

  // 2. 向量检索，获取真实相似度
  //    PostgREST 的 select 不支持 `1 - (embedding <=> $1)`，必须走数据库函数 match_cases
  //    （见 supabase/migrations/02_match_cases.sql）
  const { data, error } = await supabase.rpc("match_cases", {
    query_embedding: embedding,
    match_count: topK,
  });

  if (error) throw error;

  // 组装RagMatch数组（契约①字段：caseId / riskLabel，不是数据库的 id / risk_label）
  const matches: RagMatch[] = ((data ?? []) as MatchRow[]).map((item) => ({
    caseId: item.id,
    title: item.title,
    category: item.category,
    riskLabel: item.risk_label as "安全" | "可疑" | "高危" | "诈骗",
    content: item.content,
    similarity: Number(Number(item.similarity).toFixed(2)),
    source: item.source ?? "",
  }));

  // 3. 计算契约要求的三个置信指标
  const { topSimilarity, labelAgreement, coverageScore } = calcSignals(matches, query);

  // 返回完整RagSearchResult对象
  return Response.json({
    matches,
    topSimilarity,
    labelAgreement,
    coverageScore
  } as RagSearchResult);
}
