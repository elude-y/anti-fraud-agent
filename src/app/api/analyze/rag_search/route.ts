import { NextResponse } from "next/server";
import { rag_search } from "@/lib/rag/retrieve";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown; topK?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const topK = typeof body.topK === "number" ? Math.max(1, Math.min(body.topK, 5)) : 3;
    if (!query) {
      return NextResponse.json({ error: "query 不能为空" }, { status: 400 });
    }

    const result = await rag_search(query);
    return NextResponse.json({
      ...result,
      matches: result.matches.slice(0, topK),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "检索失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
