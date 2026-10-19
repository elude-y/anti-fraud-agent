import { NextResponse } from "next/server";
import { rag_search } from "@/lib/rag/retrieve";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { text?: unknown };
    const inputText = typeof body.text === "string" ? body.text.trim() : "";
    if (!inputText) {
      return NextResponse.json({ error: "缺少输入文本" }, { status: 400 });
    }

    const result = await rag_search(inputText);
    return NextResponse.json({ input: inputText, result: result.matches });
  } catch (error) {
    const message = error instanceof Error ? error.message : "检索失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
