import { NextResponse } from "next/server";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/db/supabase";
import fallbackCases from "@/lib/data/cases-fallback.json";

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

interface FallbackCase {
  id: string;
  title: string;
  category: string;
  riskLabel: string;
  content: string;
  source: string;
  sourceUrl: string | null;
  sourceTitle: string | null;
  publishedAt: string | null;
  sourceKind: string | null;
  riskFeatures: string[];
  prevention: string | null;
  scriptText: string | null;
}

/**
 * 契约③：GET /api/cases?category=&q=&page=&pageSize=
 *
 * 数据源优先级：
 *  1. Supabase（配好环境变量时）
 *  2. 仓库内置快照 src/lib/data/cases-fallback.json（未配置或连接失败时）
 *
 * 内置快照的意义：别人克隆仓库后不配 .env.local 也能打开知识库页，
 * 否则接口直接抛错，页面上一个球都渲染不出来。
 */
const FALLBACK = fallbackCases as FallbackCase[];

function localResponse(category: string | null, q: string | null, page: number, pageSize: number) {
  const keyword = (q ?? "").trim().toLowerCase();
  const filtered = FALLBACK.filter((item) => {
    if (category && item.category !== category) return false;
    if (!keyword) return true;
    return `${item.title} ${item.content} ${item.category} ${item.scriptText ?? ""}`
      .toLowerCase()
      .includes(keyword);
  });

  const total = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const from = (safePage - 1) * pageSize;

  return NextResponse.json({
    items: filtered.slice(from, from + pageSize),
    total,
    page: safePage,
    pageSize,
    totalPages,
    source: "fallback-snapshot",
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? 20) || 20;
  const pageSize = Math.min(1000, Math.max(1, pageSizeRaw));

  if (!isSupabaseConfigured()) {
    return localResponse(category, q, page, pageSize);
  }

  try {
    const supabase = createSupabaseClient();

    let countQuery = supabase.from("cases").select("id", { count: "exact", head: true });
    if (category) countQuery = countQuery.eq("category", category);
    if (q) countQuery = countQuery.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

    const { count, error: countErr } = await countQuery;
    if (countErr) throw new Error(countErr.message);

    const total = count ?? 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(page, totalPages);
    const from = (safePage - 1) * pageSize;
    const to = from + pageSize - 1;

    let query = supabase
      .from("cases")
      .select(
        "id,title,category,risk_label,content,source,source_url,source_title,published_at,source_kind,risk_features,prevention,script_text"
      );
    if (category) query = query.eq("category", category);
    if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

    query = query.order("created_at", { ascending: false }).order("id", { ascending: true }).range(from, to);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const items = ((data ?? []) as Row[]).map((r) => ({
      id: r.id,
      title: r.title,
      category: r.category,
      riskLabel: r.risk_label,
      content: r.content,
      source: r.source ?? "",
      sourceUrl: r.source_url,
      sourceTitle: r.source_title,
      publishedAt: r.published_at,
      sourceKind: r.source_kind,
      riskFeatures: r.risk_features ?? [],
      prevention: r.prevention,
      scriptText: r.script_text,
    }));

    return NextResponse.json({ items, total, page: safePage, pageSize, totalPages, source: "supabase" });
  } catch {
    // 数据库不可用时退回内置快照，保证页面可用
    return localResponse(category, q, page, pageSize);
  }
}
