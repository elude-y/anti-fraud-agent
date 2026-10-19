import type { IocHit, RiskLevel, SandboxEnvelope, SandboxResult } from "@/lib/contracts";
import { analyzeWithTier0 } from "./tier0";
import { analyzeWithUrlscan, isUrlscanConfigured } from "./urlscan";
import { extractHttpUrl, getExternalAnalysisSkipReason } from "./url-utils";
import { checkIoc, isVirusTotalConfigured, type VirusTotalLookup } from "./virustotal";

interface SandboxAnalyzeOptions {
  forceTier0?: boolean;
}

const riskRank: Record<RiskLevel, number> = { "安全": 0, "可疑": 1, "高危": 2, "诈骗": 3 };

function asRiskLevel(value: string): RiskLevel {
  return value === "安全" || value === "可疑" || value === "高危" || value === "诈骗" ? value : "可疑";
}

function maxRisk(...levels: string[]) {
  return levels.map(asRiskLevel).reduce((current, level) => riskRank[level] > riskRank[current] ? level : current, "安全" as RiskLevel);
}

function vtRisk(lookups: VirusTotalLookup[]) {
  const malicious = lookups.reduce((sum, item) => sum + item.malicious, 0);
  const suspicious = lookups.reduce((sum, item) => sum + item.suspicious, 0);
  if (malicious >= 3) return "诈骗" as const;
  if (malicious > 0 || suspicious >= 2) return "高危" as const;
  if (suspicious > 0) return "可疑" as const;
  return "安全" as const;
}

function mergeIocHits(...groups: IocHit[][]) {
  const seen = new Set<string>();
  return groups.flat().filter((hit) => {
    const key = `${hit.type}:${hit.value}:${hit.verdict}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 12);
}

export function sandboxProviderStatus() {
  return {
    urlscan: isUrlscanConfigured(),
    virustotal: isVirusTotalConfigured(),
    tier0: true,
  };
}

export async function sandboxAnalyze(
  urlInput: string,
  context = "",
  options: SandboxAnalyzeOptions = {},
): Promise<SandboxEnvelope> {
  const startedAt = Date.now();
  const tier0 = analyzeWithTier0(urlInput, context);
  const targetUrl = extractHttpUrl(urlInput) ?? extractHttpUrl(context);
  const skipReason = options.forceTier0 ? "已强制使用 Tier0 离线模式" : getExternalAnalysisSkipReason(targetUrl);
  const fallbackReasons: string[] = skipReason ? [skipReason] : [];
  const providers: SandboxEnvelope["providers"] = {
    urlscan: isUrlscanConfigured() ? "skipped" : "not-configured",
    virustotal: isVirusTotalConfigured() ? "skipped" : "not-configured",
  };

  if (options.forceTier0 || skipReason || !targetUrl) {
    return {
      source: "tier0",
      latencyMs: Date.now() - startedAt,
      result: tier0,
      providers,
      fallbackReasons,
    };
  }

  const urlscanPromise = isUrlscanConfigured()
    ? analyzeWithUrlscan(targetUrl)
    : Promise.reject(new Error("urlscan.io API 未配置"));
  const vtPromise = isVirusTotalConfigured()
    ? Promise.all([
      checkIoc(targetUrl.toString(), "url"),
      checkIoc(targetUrl.hostname, "domain"),
    ])
    : Promise.reject(new Error("VirusTotal API 未配置"));

  const [urlscanState, vtState] = await Promise.allSettled([urlscanPromise, vtPromise]);

  if (urlscanState.status === "fulfilled") providers.urlscan = "used";
  else if (isUrlscanConfigured()) {
    providers.urlscan = "failed";
    fallbackReasons.push(`urlscan.io: ${urlscanState.reason instanceof Error ? urlscanState.reason.message : "请求失败"}`);
  }

  if (vtState.status === "fulfilled") providers.virustotal = "used";
  else if (isVirusTotalConfigured()) {
    providers.virustotal = "failed";
    fallbackReasons.push(`VirusTotal: ${vtState.reason instanceof Error ? vtState.reason.message : "请求失败"}`);
  }

  const urlscanResult = urlscanState.status === "fulfilled" ? urlscanState.value.result : null;
  const vtLookups = vtState.status === "fulfilled" ? vtState.value : [];
  const vtHits = vtLookups.map((item) => item.hit);

  let source: SandboxEnvelope["source"] = "tier0";
  if (urlscanResult && vtLookups.length) source = "urlscan+virustotal";
  else if (urlscanResult) source = "urlscan";
  else if (vtLookups.length) source = "virustotal+tier0";

  const base: SandboxResult = urlscanResult ?? tier0;
  const result: SandboxResult = {
    ...base,
    iocHits: mergeIocHits(base.iocHits, vtHits),
    verdict: vtLookups.length ? maxRisk(base.verdict, vtRisk(vtLookups)) : base.verdict,
    raw: {
      source,
      behavior: urlscanResult?.raw ?? tier0.raw,
      virustotal: vtLookups.map((item) => item.raw),
      offlineFallback: !urlscanResult,
    },
  };

  return {
    source,
    latencyMs: Date.now() - startedAt,
    result,
    providers,
    fallbackReasons,
  };
}
