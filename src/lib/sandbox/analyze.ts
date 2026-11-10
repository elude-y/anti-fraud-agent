import type { IocHit, RiskLevel, SandboxEnvelope, SandboxResult } from "@/lib/contracts";
import { getTrustedDomain } from "@/lib/trusted-domains";
import { analyzeWithTier0 } from "./tier0";
import { captureLocalScreenshot, clearGeneratedScreenshots } from "./local-screenshot";
import { analyzeWithUrlscan, isUrlscanConfigured } from "./urlscan";
import { analyzeWithLightweight, type LightweightAnalysis } from "./lightweight";
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
  await clearGeneratedScreenshots();
  const tier0 = analyzeWithTier0(urlInput, context);
  const targetUrl = extractHttpUrl(urlInput) ?? extractHttpUrl(context);
  const skipReason = options.forceTier0 ? "已强制使用 Tier0 离线模式" : getExternalAnalysisSkipReason(targetUrl);
  const fallbackReasons: string[] = skipReason ? [skipReason] : [];
  const providers: SandboxEnvelope["providers"] = {
    urlscan: isUrlscanConfigured() ? "skipped" : "not-configured",
    virustotal: isVirusTotalConfigured() ? "skipped" : "not-configured",
  };
  if (!isUrlscanConfigured() && !isVirusTotalConfigured()) {
    fallbackReasons.push("未配置在线沙箱，已使用 Tier0 内置行为模板");
  }

  // 白名单可信域名：直接判安全，跳过动态检查（避免把官网登录/转账文案误判为风险）
  if (targetUrl && getTrustedDomain(targetUrl)) {
    fallbackReasons.push("命中可信白名单域名，已直接判安全");
    return {
      source: "tier0",
      latencyMs: Date.now() - startedAt,
      result: tier0,
      providers,
      fallbackReasons,
    };
  }

  if (options.forceTier0 || skipReason || !targetUrl) {
    return {
      source: "tier0",
      latencyMs: Date.now() - startedAt,
      result: tier0,
      providers,
      fallbackReasons,
    };
  }

  // ① 轻量动态检查（Agent 直接 fetch，几秒）
  let lightweight: LightweightAnalysis | null = null;
  try {
    lightweight = await analyzeWithLightweight(targetUrl);
  } catch (e) {
    fallbackReasons.push(`轻量检查: ${e instanceof Error ? e.message : "请求失败"}`);
  }

  // ② VirusTotal 信誉查询（秒级）
  const vtPromise = isVirusTotalConfigured()
    ? Promise.all([
      checkIoc(targetUrl.toString(), "url"),
      checkIoc(targetUrl.hostname, "domain"),
    ])
    : Promise.reject(new Error("VirusTotal API 未配置"));

  // ③ urlscan 完整扫描：仅在轻量检查「抓到页面且判定极大风险」时才调用（拿截图铁证）
  const needUrlscan = lightweight?.conclusive === true && lightweight?.highRisk === true;
  const urlscanPromise = needUrlscan && isUrlscanConfigured()
    ? analyzeWithUrlscan(targetUrl)
    : Promise.reject(new Error(needUrlscan ? "urlscan.io API 未配置" : "轻量检查未判定为极大风险，跳过完整扫描"));
  const localScreenshotPromise = targetUrl
    ? captureLocalScreenshot(targetUrl)
    : Promise.resolve(null);

  const [urlscanState, vtState, screenshotState] = await Promise.allSettled([
    urlscanPromise,
    vtPromise,
    localScreenshotPromise,
  ]);

  if (urlscanState.status === "fulfilled") providers.urlscan = "used";
  else if (needUrlscan && isUrlscanConfigured()) {
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

  // 优先级：urlscan（完整）> lightweight（抓到页面）> tier0（离线兜底/白名单）
  const lightweightResult = lightweight?.conclusive ? lightweight.result : null;
  const base: SandboxResult = urlscanResult ?? lightweightResult ?? tier0;

  let source: SandboxEnvelope["source"] = "tier0";
  if (urlscanResult && vtLookups.length) source = "urlscan+virustotal";
  else if (urlscanResult) source = "urlscan";
  else if (lightweightResult && vtLookups.length) source = "lightweight+virustotal";
  else if (lightweightResult) source = "lightweight";
  else if (vtLookups.length) source = "virustotal+tier0";

  const localScreenshot = screenshotState.status === "fulfilled" ? screenshotState.value : null;
  const result: SandboxResult = {
    ...base,
    screenshotUrl: localScreenshot ?? base.screenshotUrl,
    iocHits: mergeIocHits(base.iocHits, vtHits),
    verdict: vtLookups.length ? maxRisk(base.verdict, vtRisk(vtLookups)) : base.verdict,
    raw: {
      source,
      behavior: urlscanResult?.raw ?? lightweightResult?.raw ?? tier0.raw,
      virustotal: vtLookups.map((item) => item.raw),
      offlineFallback: !urlscanResult && !lightweightResult,
      screenshotType: localScreenshot ? "captured" : undefined,
      screenshotProvider: localScreenshot ? "local-browser" : undefined,
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




