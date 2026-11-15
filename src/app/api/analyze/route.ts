import { analyzeRequest } from "@/lib/agent/analyze-request";

export const runtime = "nodejs";

export async function POST(request: Request) {
  return analyzeRequest(request);
}
