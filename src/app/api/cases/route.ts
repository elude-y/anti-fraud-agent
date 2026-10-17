import { NextResponse } from "next/server";
import { createSupabaseClient } from "@/lib/db/supabase";

const supabase = createSupabaseClient();

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const q = searchParams.get("q");

  let query = supabase.from("cases").select("id,title,category,risk_label,content,source,tags,created_at", { count: "exact" });

  if (category) query = query.eq("category", category);
  if (q) query = query.ilike("title", `%${q}%`);

  const { data, count, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    items: data,
    total: count ?? 0,
  });
}
