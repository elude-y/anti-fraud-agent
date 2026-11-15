import { AsyncLocalStorage } from "node:async_hooks";

type Provider = "chat" | "embedding" | "virustotal" | "urlscan";
export interface ProviderUsage {
  provider: Provider;
  requests: number;
  metered: number;
  inputTokens: number;
  outputTokens: number;
}

const measurements = new AsyncLocalStorage<Map<Provider, ProviderUsage>>();

export function withProviderUsage<T>(entries: Map<Provider, ProviderUsage>, run: () => T) {
  return measurements.run(entries, run);
}

export function recordProviderRequest(provider: Provider) {
  const entries = measurements.getStore();
  if (!entries) return () => {};
  const entry = entries.get(provider) ?? { provider, requests: 0, metered: 0, inputTokens: 0, outputTokens: 0 };
  entries.set(provider, entry);
  entry.requests++;
  return (usage?: { prompt_tokens?: number; completion_tokens?: number }) => {
    if (!Number.isSafeInteger(usage?.prompt_tokens) || (usage?.prompt_tokens ?? 0) < 0) return;
    entry.metered++;
    entry.inputTokens += usage?.prompt_tokens ?? 0;
    entry.outputTokens += Math.max(0, Number.isSafeInteger(usage?.completion_tokens) ? usage?.completion_tokens ?? 0 : 0);
  };
}
