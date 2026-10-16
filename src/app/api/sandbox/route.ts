import { NextResponse } from "next/server";
import { z } from "zod";
import { sandboxAnalyze } from "@/lib/sandbox/analyze";

const requestSchema = z.object({
  url: z.string().min(1),
  context: z.string().optional().default(""),
});

export async function POST(request: Request) {
  const parsed = requestSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ message: "缺少待分析的链接或文本" }, { status: 400 });
  }

  const envelope = await sandboxAnalyze(parsed.data.url, parsed.data.context);
  return NextResponse.json(envelope);
}
