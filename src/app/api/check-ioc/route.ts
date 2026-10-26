import { NextResponse } from "next/server";
import { z } from "zod";
import { checkIoc, isVirusTotalConfigured } from "@/lib/sandbox/virustotal";

const requestSchema = z.object({
  value: z.string().trim().min(1).max(2048),
  type: z.enum(["url", "domain", "ip"]).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "请求体必须是有效 JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ message: "缺少有效的 IOC 值" }, { status: 400 });
  }

  if (!isVirusTotalConfigured()) {
    return NextResponse.json({ message: "VirusTotal API 未配置" }, { status: 503 });
  }

  try {
    const lookup = await checkIoc(parsed.data.value, parsed.data.type);
    return NextResponse.json(lookup);
  } catch (error) {
    return NextResponse.json(
      { message: error instanceof Error ? error.message : "IOC 查询暂时不可用" },
      { status: 502 },
    );
  }
}
