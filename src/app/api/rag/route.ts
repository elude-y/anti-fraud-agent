// src/app/api/rag/route.ts
import { NextRequest, NextResponse } from "next/server";
import { rag_search } from "@/lib/rag/retrieve";

export async function POST(req: NextRequest) {
  try {
    const { query } = await req.json();
    if (!query) {
      return NextResponse.json({ error: "query不能为空" }, { status: 400 })
    }
    const result = await rag_search(query);
    return NextResponse.json(result);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get("query") || "";
  if (!query) {
    return NextResponse.json({ error: "query不能为空" }, { status: 400 })
  }
  const result = await rag_search(query);
  return NextResponse.json(result);
}
