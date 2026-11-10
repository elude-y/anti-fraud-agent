// src/lib/sandbox/lightweight.ts —— 轻量动态检查：Agent 直接 fetch 链接，秒级抓证据
import type { SandboxResult } from "@/lib/contracts";
import { redactUrlForDisplay } from "./url-utils";

const RISK_WORDS = [
  "理赔", "退款", "中奖", "验证码", "银行卡", "身份证", "冻结", "解冻",
  "转账", "补贴", "保证金", "手续费", "贷款", "刷单",
];

const SENSITIVE_FIELDS = [
  "password", "passwd", "pwd", "验证码", "银行卡", "卡号", "身份证", "密码", "cvv", "expiry",
];

/** 从 HTML 里提取敏感表单字段（密码框 / 银行卡号 / 验证码等） */
function extractFormFields(html: string): string[] {
  const fields = new Set<string>();
  for (const m of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = m[0];
    const type = /type\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    const name = /name\s*=\s*["']?([^"'\s>]+)/i.exec(tag)?.[1]?.toLowerCase() ?? "";
    if (type === "password" || SENSITIVE_FIELDS.some((f) => type.includes(f) || name.includes(f))) {
      fields.add(name || type);
    }
  }
  return [...fields].slice(0, 12);
}

/** 从 HTML 里提取指向外部域名的「表单外发 action」与「iframe 注入」——只这两类是仿冒特征 */
function extractExternalDomains(html: string, targetHost: string): string[] {
  const domains = new Set<string>();
  // 表单 action 外发到外部域名（数据外发 = 仿冒关键信号）
  for (const m of html.matchAll(/<form\b[^>]*?\baction\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)) {
    try {
      const u = new URL(m[1]);
      if (u.hostname && u.hostname !== targetHost) domains.add(u.hostname);
    } catch {
      // 忽略非法 URL
    }
  }
  // iframe 指向外部域名（仿冒页常见注入）
  for (const m of html.matchAll(/<iframe\b[^>]*?\bsrc\s*=\s*["']?(https?:\/\/[^"'\s>]+)/gi)) {
    try {
      const u = new URL(m[1]);
      if (u.hostname && u.hostname !== targetHost) domains.add(u.hostname);
    } catch {
      // 忽略非法 URL
    }
  }
  return [...domains].slice(0, 8);
}

export interface LightweightAnalysis {
  result: SandboxResult;
  /** 是否判定为"极大风险"（需要调用 urlscan 拿截图铁证） */
  highRisk: boolean;
  /** 是否真正抓到了页面 HTML（fetch 成功且为 HTML）。false 表示离线/失败，结论不可靠 */
  conclusive: boolean;
}

export async function analyzeWithLightweight(url: URL): Promise<LightweightAnalysis> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);

  const redirectChain: Array<{ url: string; status?: number }> = [];
  let finalUrl = url.toString();
  let html = "";

  try {
    let current = url;
    for (let hop = 0; hop < 5; hop++) {
      const res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "user-agent": "Mozilla/5.0 (SafeAgent anti-fraud)" },
      });
      redirectChain.push({ url: redactUrlForDisplay(current.toString()), status: res.status });

      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get("location");
        if (!location) break;
        current = new URL(location, current);
        continue;
      }

      const contentType = res.headers.get("content-type") ?? "";
      if (contentType.includes("text/html")) {
        html = (await res.text()).slice(0, 500_000);
      }
      finalUrl = current.toString();
      break;
    }
  } catch {
    // 超时 / 网络失败 / 非 HTML：继续用已有信息，不强求
  } finally {
    clearTimeout(timer);
  }

  const host = url.hostname.toLowerCase();
  const formFields = extractFormFields(html);
  const externalDomains = extractExternalDomains(html, host);
  const riskWords = RISK_WORDS.filter((w) => html.includes(w));

  const hasSensitiveForm = formFields.length > 0;
  const hasRiskText = riskWords.length > 0;
  const hasExternalSend = externalDomains.length > 0;

  // 极大风险 = 敏感表单 + 风险话术 + 外发到外部域名（典型仿冒特征）
  const highRisk = hasSensitiveForm && hasRiskText && hasExternalSend;
  const conclusive = html.length > 0;

  let verdict: "安全" | "可疑" | "高危" | "诈骗";
  if (highRisk) verdict = "诈骗";
  else if (hasSensitiveForm && (hasRiskText || hasExternalSend)) verdict = "高危";
  else if (hasRiskText || hasExternalSend) verdict = "可疑";
  else if (!html) verdict = "可疑"; // 抓不到 HTML，无法判断
  else verdict = "安全";

  const result: SandboxResult = {
    redirectChain,
    finalUrl: redactUrlForDisplay(finalUrl),
    formFields,
    jsBehaviors: externalDomains.length
      ? [`页面向 ${externalDomains.length} 个外部域名发起请求`]
      : [],
    iocHits: externalDomains.slice(0, 4).map((domain) => ({
      type: "domain" as const,
      value: domain,
      verdict: "外发目标域名",
    })),
    verdict,
    raw: {
      source: "lightweight",
      highRisk,
      riskWords,
      externalDomains,
      htmlSize: html.length,
      offlineFallback: !conclusive,
    },
  };

  return { result, highRisk, conclusive };
}
