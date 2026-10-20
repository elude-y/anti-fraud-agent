import { NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/db/supabase";

const supabase = createSupabaseClient();

interface Row {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
}

/**
 * 契约③：GET /api/cases?category=&q= -> { items: CaseItem[]; total: number }
 *
 * 注意：数据库列是 risk_label，契约里是 riskLabel，必须在这里做映射，
 * 否则 C 的案例库页取到的 riskLabel 会是 undefined。
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  let query = supabase
    .from("cases")
    .select("id,title,category,risk_label,content,source", { count: "exact" });

  if (category) query = query.eq("category", category);
  // 关键词同时匹配标题与正文
  if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    title: r.title,
    category: r.category,
    riskLabel: r.risk_label,
    content: r.content,
    source: r.source ?? "",
  }));

  return NextResponse.json({ items, total: count ?? 0 });
}
