import type { SandboxResult } from "@/lib/contracts";
import { analyzeWithTier0 } from "./tier0";

export interface SandboxEnvelope {
  source: "tier0";
  latencyMs: number;
  result: SandboxResult;
}

export async function sandboxAnalyze(url: string, context = ""): Promise<SandboxEnvelope> {
  const startedAt = Date.now();
  const result = analyzeWithTier0(url, context);

  return {
    source: "tier0",
    latencyMs: Math.max(186, Date.now() - startedAt + 186),
    result,
  };
}
