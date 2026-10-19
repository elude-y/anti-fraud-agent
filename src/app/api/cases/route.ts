import { NextResponse } from "next/server";
import type { CaseItem } from "@/lib/contracts";
import { createSupabaseClient, isSupabaseConfigured } from "@/lib/db/supabase";
import { demoCases } from "@/lib/demo-data";

function localCases(category: string | null, query: string | null) {
  const keyword = query?.trim().toLowerCase() ?? "";
  return demoCases.filter((item) => {
    const categoryMatch = !category || item.category === category;
    const queryMatch = !keyword || `${item.title} ${item.content} ${item.category}`.toLowerCase().includes(keyword);
    return categoryMatch && queryMatch;
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const query = searchParams.get("q");

  if (isSupabaseConfigured()) {
    try {
      const supabase = createSupabaseClient();
      let requestQuery = supabase
        .from("cases")
        .select("id,title,category,risk_label,content,source", { count: "exact" });

      if (category) requestQuery = requestQuery.eq("category", category);
      if (query) requestQuery = requestQuery.ilike("title", `%${query}%`);

      const { data, count, error } = await requestQuery;
      if (!error && data) {
        const items: CaseItem[] = data.map((item) => ({
          id: item.id as string,
          title: item.title as string,
          category: item.category as string,
          riskLabel: item.risk_label as CaseItem["riskLabel"],
          content: item.content as string,
          source: (item.source as string | null) ?? "案例库",
        }));
        return NextResponse.json({ items, total: count ?? items.length }, {
          headers: { "X-Case-Source": "supabase" },
        });
      }
    } catch {
      // Fall through to the bundled cases.
    }
  }

  const items = localCases(category, query);
  return NextResponse.json({ items, total: items.length }, {
    headers: { "X-Case-Source": "bundled" },
  });
}
