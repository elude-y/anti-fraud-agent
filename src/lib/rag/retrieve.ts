import type { RagMatch, RagSearchResult as ContractRagSearchResult } from "@/lib/contracts";
import { vectorSearchCases } from "@/lib/db/cases";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/db/supabase";
import { createEmbedding } from "@/lib/rag/embedding";
import { calcSignals } from "@/lib/rag/signals";
import { searchAntiFraudCases } from "@/lib/rag/search";

export type RagSearchResult = ContractRagSearchResult;

async function keywordSearch(query: string): Promise<RagMatch[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase
      .from("cases")
      .select("id,title,category,risk_label,content,source")
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(5);

    if (error || !data) return [];
    return data.map((item) => ({
      caseId: item.id as string,
      title: item.title as string,
      category: item.category as string,
      riskLabel: item.risk_label as RagMatch["riskLabel"],
      content: item.content as string,
      similarity: 0.5,
      source: (item.source as string | null) ?? "Supabase 案例库",
    }));
  } catch {
    return [];
  }
}

export async function rag_search(query: string): Promise<RagSearchResult> {
  const localFallback = searchAntiFraudCases(query);

  if (!isSupabaseConfigured()) return localFallback;

  let queryVector: number[] | null = null;
  try {
    queryVector = await createEmbedding(query);
  } catch {
    const keywordMatches = await keywordSearch(query);
    if (!keywordMatches.length) return localFallback;
    const signals = calcSignals(keywordMatches);
    return { matches: keywordMatches, ...signals };
  }

  try {
    const rows = await vectorSearchCases(queryVector, 5);
    if (!rows.length) return localFallback;

    const matches: RagMatch[] = rows.map((item) => ({
      caseId: item.id,
      title: item.title,
      category: item.category,
      riskLabel: item.risk_label as RagMatch["riskLabel"],
      content: item.content,
      similarity: Number(item.similarity),
      source: item.source ?? "Supabase 案例库",
    }));
    return { matches, ...calcSignals(matches) };
  } catch {
    const keywordMatches = await keywordSearch(query);
    if (!keywordMatches.length) return localFallback;
    return { matches: keywordMatches, ...calcSignals(keywordMatches) };
  }
}
