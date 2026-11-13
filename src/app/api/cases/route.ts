import { NextResponse } from "next/server";
import type { CaseItem } from "@/lib/contracts";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/db/supabase";
import { fraudCases } from "@/lib/fraud-data";

interface Row {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
  source_url: string | null;
  source_title: string | null;
  published_at: string | null;
  source_kind: string | null;
  risk_features: string[] | null;
  prevention: string | null;
  script_text: string | null;
}

function localResponse(category: string | null, q: string | null, page: number, pageSize: number) {
  const keyword = q?.trim().toLowerCase() ?? "";
  const filtered = fraudCases.filter((item) => {
    if (category && category !== "全部" && item.category !== category) return false;
    if (!keyword) return true;
    return [item.id, item.title, item.content, item.category, item.source, ...(item.riskFeatures ?? [])]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
  });
  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const items = filtered.slice(from, from + pageSize);
  return NextResponse.json({ items, total, page: safePage, pageSize, totalPages, source: "local-900" });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");
  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSize = Math.min(200, Math.max(1, Number(searchParams.get("pageSize") ?? 20) || 20));

  if (!isSupabaseConfigured()) return localResponse(category, q, page, pageSize);

  try {
    const supabase = createSupabaseClient();
    let countQuery = supabase.from("cases").select("id", { count: "exact", head: true });
    if (category && category !== "全部") countQuery = countQuery.eq("category", category);
    if (q) countQuery = countQuery.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

    const { count, error: countErr } = await countQuery;
    if (countErr) return localResponse(category, q, page, pageSize);

    const total = count ?? 0;
    if (total === 0) return localResponse(category, q, page, pageSize);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const from = (safePage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("cases")
      .select("id,title,category,risk_label,content,source,source_url,source_title,published_at,source_kind,risk_features,prevention,script_text");
    if (category && category !== "全部") query = query.eq("category", category);
    if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);
    query = query.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);

    const { data, error } = await query;
    if (error) return localResponse(category, q, page, pageSize);

    const items: CaseItem[] = ((data ?? []) as Row[]).map((row) => ({
      id: row.id,
      title: row.title,
      category: row.category,
      riskLabel: row.risk_label as CaseItem["riskLabel"],
      content: row.content,
      source: row.source ?? "",
      sourceUrl: row.source_url,
      sourceTitle: row.source_title,
      publishedAt: row.published_at,
      sourceKind: row.source_kind,
      riskFeatures: row.risk_features ?? [],
      prevention: row.prevention,
      scriptText: row.script_text,
    }));

    return NextResponse.json({ items, total, page: safePage, pageSize, totalPages, source: "supabase" });
  } catch (error) {
    console.warn(`案例接口降级本地数据仓：${error instanceof Error ? error.message : "请求失败"}`);
    return localResponse(category, q, page, pageSize);
  }
}
