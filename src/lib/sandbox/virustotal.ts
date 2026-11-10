import { isIP } from "node:net";
import type { IocHit } from "@/lib/contracts";

type IocType = IocHit["type"];

interface VirusTotalAttributes {
  last_analysis_stats?: Record<string, number>;
  reputation?: number;
  categories?: Record<string, string>;
  last_analysis_date?: number;
}

interface VirusTotalResponse {
  data?: {
    id?: string;
    type?: string;
    attributes?: VirusTotalAttributes;
  };
  error?: {
    code?: string;
    message?: string;
  };
}

export interface VirusTotalLookup {
  hit: IocHit;
  malicious: number;
  suspicious: number;
  harmless: number;
  reputation: number;
  categories: string[];
  raw: {
    objectId?: string;
    objectType?: string;
    lastAnalysisDate?: number;
    stats?: Record<string, number>;
  };
}

function classify(value: string, explicitType?: IocType): { type: IocType; normalized: string } {
  if (explicitType) return { type: explicitType, normalized: value };

  try {
    const url = new URL(value);
    return { type: "url", normalized: url.toString() };
  } catch {
    if (isIP(value)) return { type: "ip", normalized: value };
    return { type: "domain", normalized: value.toLowerCase() };
  }
}

function endpointFor(type: IocType, value: string) {
  if (type === "url") {
    return `https://www.virustotal.com/api/v3/urls/${Buffer.from(value).toString("base64url")}`;
  }
  if (type === "ip") return `https://www.virustotal.com/api/v3/ip_addresses/${encodeURIComponent(value)}`;
  return `https://www.virustotal.com/api/v3/domains/${encodeURIComponent(value)}`;
}

function verdictText(malicious: number, suspicious: number, reputation: number) {
  if (malicious >= 3) return `VirusTotal ${malicious} 个引擎判定恶意`;
  if (malicious > 0 || suspicious >= 2 || reputation < -5) {
    return `VirusTotal 检出 ${malicious} 个恶意、${suspicious} 个可疑信号`;
  }
  return "VirusTotal 暂未发现明确恶意记录";
}

export function isVirusTotalConfigured() {
  return Boolean(process.env.VIRUSTOTAL_API_KEY?.trim());
}

export async function checkIoc(value: string, explicitType?: IocType): Promise<VirusTotalLookup> {
  const apiKey = process.env.VIRUSTOTAL_API_KEY?.trim();
  if (!apiKey) throw new Error("VirusTotal API 未配置");

  const { type, normalized } = classify(value, explicitType);
  const response = await fetch(endpointFor(type, normalized), {
    headers: {
      accept: "application/json",
      "x-apikey": apiKey,
      "user-agent": "SafeAgent/1.0 anti-fraud-analysis",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });

  if (response.status === 404) {
    return {
      hit: { type, value: normalized, verdict: "VirusTotal 暂无该 IOC 记录" },
      malicious: 0,
      suspicious: 0,
      harmless: 0,
      reputation: 0,
      categories: [],
      raw: {},
    };
  }

  const payload = await response.json() as VirusTotalResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `VirusTotal 请求失败 (${response.status})`);
  }

  const attributes = payload.data?.attributes ?? {};
  const stats = attributes.last_analysis_stats ?? {};
  const malicious = Number(stats.malicious ?? 0);
  const suspicious = Number(stats.suspicious ?? 0);
  const harmless = Number(stats.harmless ?? 0);
  const reputation = Number(attributes.reputation ?? 0);
  const categories = [...new Set(Object.values(attributes.categories ?? {}))].slice(0, 6);

  return {
    hit: {
      type,
      value: normalized,
      verdict: verdictText(malicious, suspicious, reputation),
    },
    malicious,
    suspicious,
    harmless,
    reputation,
    categories,
    raw: {
      objectId: payload.data?.id,
      objectType: payload.data?.type,
      lastAnalysisDate: attributes.last_analysis_date,
      stats,
    },
  };
}
