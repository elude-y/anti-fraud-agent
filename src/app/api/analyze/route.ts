import { analyzeRequest } from "@/lib/agent/analyze-request";

export async function POST(request: Request) {
  return analyzeRequest(request);
}
