import { NextResponse } from "next/server";
import { z } from "zod";
import { sandboxAnalyze, sandboxProviderStatus } from "@/lib/sandbox/analyze";

const requestSchema = z.object({
  url: z.string().min(1),
  context: z.string().optional().default(""),
  forceTier0: z.boolean().optional().default(false),
});

export async function GET() {
  return NextResponse.json({ providers: sandboxProviderStatus() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体必须是有效 JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ message: "缺少待分析的链接或文本" }, { status: 400 });
  }

  try {
    const envelope = await sandboxAnalyze(parsed.data.url, parsed.data.context, {
      forceTier0: parsed.data.forceTier0,
    });
    return NextResponse.json(envelope);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "沙箱分析暂时不可用" },
      { status: 502 },
    );
  }
}
