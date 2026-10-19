import type { SandboxResult } from "@/lib/contracts";
import { redactUrlForDisplay } from "./url-utils";

interface UrlscanSubmission {
  uuid?: string;
  api?: string;
  result?: string;
  message?: string;
}

interface UrlscanRequestRecord {
  request?: {
    request?: {
      url?: string;
      documentURL?: string;
      resourceType?: string;
    };
  };
  response?: {
    response?: {
      url?: string;
      status?: number;
      mimeType?: string;
      remoteIPAddress?: string;
    };
  };
}

interface UrlscanResultPayload {
  task?: { uuid?: string; url?: string };
  page?: { url?: string; domain?: string; ip?: string };
  lists?: { urls?: string[]; ips?: string[]; domains?: string[] };
  data?: { requests?: UrlscanRequestRecord[] };
  verdicts?: {
    overall?: { malicious?: boolean; score?: number; categories?: string[]; brands?: string[] };
    urlscan?: { malicious?: boolean; score?: number; categories?: string[]; brands?: string[] };
  };
}

export interface UrlscanAnalysis {
  result: SandboxResult;
  scanId: string;
  resultUrl: string;
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function unique<T>(items: T[]) {
  return [...new Set(items)];
}

function extractRedirectChain(payload: UrlscanResultPayload, submittedUrl: string) {
  const documents = (payload.data?.requests ?? [])
    .filter((item) => item.request?.request?.resourceType === "Document")
    .map((item) => ({
      url: item.response?.response?.url ?? item.request?.request?.url ?? "",
      status: item.response?.response?.status,
    }))
    .filter((item) => item.url);

  const urls = documents.length
    ? documents
    : (payload.lists?.urls ?? []).slice(0, 12).map((url) => ({ url }));

  const seen = new Set<string>();
  return [{ url: submittedUrl }, ...urls]
    .filter((item) => {
      if (seen.has(item.url)) return false;
      seen.add(item.url);
      return true;
    })
    .map((item) => ({ ...item, url: redactUrlForDisplay(item.url) }))
    .slice(0, 12);
}

function inspectDom(dom: string) {
  const formFields = unique(
    [...dom.matchAll(/<input\b[^>]*(?:type|name)=["']?([^"'\s>]+)/gi)]
      .map((match) => match[1].toLowerCase())
      .filter((field) => field !== "hidden"),
  ).slice(0, 12);

  const behaviorRules: Array<[RegExp, string]> = [
    [/document\.cookie|cookie\s*=/i, "读取或写入 Cookie"],
    [/(?:addEventListener\s*\(\s*["'](?:key|input)|onkey(?:down|up|press))/i, "监听键盘或输入事件"],
    [/(?:fetch\s*\(|XMLHttpRequest|sendBeacon)/i, "存在网络外发脚本"],
    [/<iframe\b/i, "页面包含 iframe"],
    [/(?:history\.pushState|beforeunload|popstate)/i, "干预页面返回或离开行为"],
    [/(?:localStorage|sessionStorage)/i, "读取浏览器本地存储"],
  ];

  return {
    formFields,
    jsBehaviors: behaviorRules.filter(([pattern]) => pattern.test(dom)).map(([, label]) => label),
  };
}

function providerVerdict(payload: UrlscanResultPayload) {
  const verdict = payload.verdicts?.overall ?? payload.verdicts?.urlscan;
  if (verdict?.malicious || Number(verdict?.score ?? 0) >= 50) return "高危";
  if (Number(verdict?.score ?? 0) > 0 || (verdict?.categories?.length ?? 0) > 0) return "可疑";
  return "安全";
}

export function isUrlscanConfigured() {
  return Boolean(process.env.URLSCAN_API_KEY?.trim());
}

export async function analyzeWithUrlscan(url: URL): Promise<UrlscanAnalysis> {
  const apiKey = process.env.URLSCAN_API_KEY?.trim();
  if (!apiKey) throw new Error("urlscan.io API 未配置");

  const visibility = ["public", "unlisted", "private"].includes(process.env.URLSCAN_VISIBILITY ?? "")
    ? process.env.URLSCAN_VISIBILITY
    : "unlisted";

  const submissionResponse = await fetch("https://urlscan.io/api/v1/scan/", {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      "api-key": apiKey,
      "user-agent": "SafeAgent/1.0 anti-fraud-analysis",
    },
    body: JSON.stringify({
      url: url.toString(),
      visibility,
      tags: ["safeagent", "anti-fraud"],
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });

  const submission = await submissionResponse.json() as UrlscanSubmission;
  if (!submissionResponse.ok || !submission.uuid) {
    throw new Error(submission.message || `urlscan.io 提交失败 (${submissionResponse.status})`);
  }

  const maxWaitMs = Math.max(8_000, Math.min(Number(process.env.URLSCAN_MAX_WAIT_MS ?? 24_000), 45_000));
  const startedAt = Date.now();
  let payload: UrlscanResultPayload | null = null;

  await delay(Math.min(10_000, maxWaitMs));
  while (Date.now() - startedAt < maxWaitMs) {
    const resultResponse = await fetch(`https://urlscan.io/api/v1/result/${submission.uuid}/`, {
      headers: { accept: "application/json", "api-key": apiKey, "user-agent": "SafeAgent/1.0 anti-fraud-analysis" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });

    if (resultResponse.ok) {
      payload = await resultResponse.json() as UrlscanResultPayload;
      break;
    }
    if (resultResponse.status !== 404) throw new Error(`urlscan.io 获取结果失败 (${resultResponse.status})`);
    await delay(2_000);
  }

  if (!payload) throw new Error("urlscan.io 在等待时间内未返回结果");

  let domSignals = { formFields: [] as string[], jsBehaviors: [] as string[] };
  try {
    const domResponse = await fetch(`https://urlscan.io/dom/${submission.uuid}/`, {
      headers: { "api-key": apiKey, "user-agent": "SafeAgent/1.0 anti-fraud-analysis" },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (domResponse.ok) domSignals = inspectDom((await domResponse.text()).slice(0, 2_000_000));
  } catch {
    // DOM 快照是增强证据，缺失时仍保留扫描结果。
  }

  const verdictSource = payload.verdicts?.overall ?? payload.verdicts?.urlscan;
  const brands = verdictSource?.brands ?? [];
  const finalUrl = redactUrlForDisplay(payload.page?.url ?? url.toString());
  const ipHits = unique([payload.page?.ip, ...(payload.lists?.ips ?? [])].filter(Boolean) as string[])
    .slice(0, 4)
    .map((ip) => ({ type: "ip" as const, value: ip, verdict: "urlscan.io 访问链路关联 IP" }));

  return {
    scanId: submission.uuid,
    resultUrl: submission.result ?? `https://urlscan.io/result/${submission.uuid}/`,
    result: {
      redirectChain: extractRedirectChain(payload, url.toString()),
      finalUrl,
      screenshotUrl: `https://urlscan.io/screenshots/${submission.uuid}.png`,
      formFields: domSignals.formFields,
      jsBehaviors: domSignals.jsBehaviors.length ? domSignals.jsBehaviors : ["已完成页面资源与请求链检查"],
      brandImpersonation: brands[0],
      iocHits: [
        { type: "domain", value: payload.page?.domain ?? url.hostname, verdict: "urlscan.io 已完成页面扫描" },
        ...ipHits,
      ],
      verdict: providerVerdict(payload),
      raw: {
        source: "urlscan",
        scanId: submission.uuid,
        resultUrl: submission.result ?? `https://urlscan.io/result/${submission.uuid}/`,
        score: verdictSource?.score ?? 0,
        categories: verdictSource?.categories ?? [],
      },
    },
  };
}
