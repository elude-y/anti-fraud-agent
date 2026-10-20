import { createSupabaseClient } from "@/lib/db/supabase";
import type { RagSearchResult, RagMatch, RagPatternMatch } from "@/lib/contracts";
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

type PatternRow = {
  id: string;
  pattern: string;
  category: string;
  keywords: string[] | null;
  similarity: number;
};

export async function POST(req: Request) {
  const { query, topK = 3, patternK = 3 } = await req.json();
  // 1. 文本转向量
  const embedding = await createEmbedding(query);

  // 2. 案例向量检索（RPC match_cases，相似度在数据库函数里算）
  const { data, error } = await supabase.rpc("match_cases", {
    query_embedding: embedding,
    match_count: topK,
  });
  if (error) throw error;

  // 3. 话术模式检索（RPC match_patterns）
  const { data: patData, error: patErr } = await supabase.rpc("match_patterns", {
    query_embedding: embedding,
    match_count: patternK,
  });
  if (patErr) console.warn("话术模式检索失败：", patErr.message);

  const matches: RagMatch[] = ((data ?? []) as MatchRow[]).map((item) => ({
    caseId: item.id,
    title: item.title,
    category: item.category,
    riskLabel: item.risk_label as "安全" | "可疑" | "高危" | "诈骗",
    content: item.content,
    similarity: Number(Number(item.similarity).toFixed(2)),
    source: item.source ?? "",
  }));

  const patterns: RagPatternMatch[] = ((patData ?? []) as PatternRow[]).map((p) => ({
    patternId: p.id,
    pattern: p.pattern,
    category: p.category,
    keywords: p.keywords ?? [],
    similarity: Number(Number(p.similarity).toFixed(4)),
  }));

  // 4. 计算契约要求的三个置信指标
  const { topSimilarity, labelAgreement, coverageScore } = calcSignals(matches, query);

  return Response.json({
    matches,
    patterns,
    topSimilarity,
    labelAgreement,
    coverageScore
  } as RagSearchResult);
}
