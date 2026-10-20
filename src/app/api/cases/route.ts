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
 * 第四周为案例库页补充的能力（均为向后兼容的可选参数）：
 *   page      页码，默认 1；超出范围时自动收敛到最后一页
 *   pageSize  每页条数，默认 20，上限 100
 *
 * 注意：
 *  - 数据库列是 risk_label，契约里是 riskLabel，必须映射，否则 C 取到 undefined
 *  - 先查总数再按范围取数：PostgREST 在 range 起点超过总数时返回 416，
 *    直接拿它当错误会让"越界页码"变成 500
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  const page = Math.max(1, Number(searchParams.get("page") ?? 1) || 1);
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? 20) || 20;
  const pageSize = Math.min(100, Math.max(1, pageSizeRaw));

  // 1) 先取总数（head 请求，不传输数据行）
  let countQuery = supabase
    .from("cases")
    .select("id", { count: "exact", head: true });
  if (category) countQuery = countQuery.eq("category", category);
  if (q) countQuery = countQuery.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

  const { count, error: countErr } = await countQuery;
  if (countErr) {
    return NextResponse.json({ error: countErr.message }, { status: 500 });
  }

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const from = (safePage - 1) * pageSize;
  const to = from + pageSize - 1;

  // 2) 按夹取后的范围取当前页
  let query = supabase
    .from("cases")
    .select("id,title,category,risk_label,content,source");
  if (category) query = query.eq("category", category);
  if (q) query = query.or(`title.ilike.%${q}%,content.ilike.%${q}%`);

  // 按创建时间倒序，id 兜底保证分页稳定
  query = query
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to);

  const { data, error } = await query;
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

  return NextResponse.json({
    items,
    total,
    page: safePage,
    pageSize,
    totalPages,
  });
}
