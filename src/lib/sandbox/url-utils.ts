import { isIP } from "node:net";

const reservedSuffixes = [
  ".example",
  ".example.com",
  ".example.net",
  ".example.org",
  ".example.cn",
  ".invalid",
  ".local",
  ".localhost",
  ".test",
];

function isPrivateIpv4(hostname: string) {
  const octets = hostname.split(".").map(Number);
  if (octets.length !== 4 || octets.some((item) => !Number.isInteger(item))) return false;
  const [a, b] = octets;
  return a === 10
    || a === 127
    || a === 0
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && b === 168)
    || (a === 100 && b >= 64 && b <= 127);
}

function isPrivateIpv6(hostname: string) {
  const normalized = hostname.replace(/^\[|\]$/g, "").toLowerCase();
  return normalized === "::1"
    || normalized === "::"
    || normalized.startsWith("fc")
    || normalized.startsWith("fd")
    || normalized.startsWith("fe80:");
}

export function extractHttpUrl(input: string) {
  const candidate = input.match(/https?:\/\/[^\s，。；;！!）)\]}]+/i)?.[0]
    ?? (/^[\w.-]+\.[a-z]{2,}(?:\/\S*)?$/i.test(input.trim()) ? `https://${input.trim()}` : "");

  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function getExternalAnalysisSkipReason(url: URL | null) {
  if (!url) return "输入中没有可提交的 HTTP(S) 链接";

  const hostname = url.hostname.toLowerCase();
  if (hostname === "localhost" || hostname.endsWith(".localhost")) return "本地域名不会提交给外部服务";
  if (reservedSuffixes.some((suffix) => hostname === suffix.slice(1) || hostname.endsWith(suffix))) {
    return "演示或保留域名不会提交给外部服务";
  }

  const ipVersion = isIP(hostname.replace(/^\[|\]$/g, ""));
  if (ipVersion === 4 && isPrivateIpv4(hostname)) return "私有 IPv4 地址不会提交给外部服务";
  if (ipVersion === 6 && isPrivateIpv6(hostname)) return "私有 IPv6 地址不会提交给外部服务";
  if (!hostname.includes(".") && ipVersion === 0) return "单标签内网域名不会提交给外部服务";

  return null;
}

export function redactUrlForDisplay(url: string) {
  try {
    const parsed = new URL(url);
    for (const key of [...parsed.searchParams.keys()]) {
      if (/token|code|key|password|passwd|otp|phone|mobile|idcard|card/i.test(key)) {
        parsed.searchParams.set(key, "[已脱敏]");
      }
    }
    parsed.username = "";
    parsed.password = "";
    return parsed.toString();
  } catch {
    return url;
  }
}
