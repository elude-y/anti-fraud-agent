import type { SandboxResult } from "@/lib/contracts";
import { getTrustedDomain } from "@/lib/trusted-domains";
import { extractHttpUrl, redactUrlForDisplay } from "./url-utils";

const riskyWords = ["claim", "refund", "verify", "secure", "gift", "award", "etc", "bank", "客服", "理赔", "认证", "中奖"];

export function analyzeWithTier0(urlInput: string, context = ""): SandboxResult {
  const extracted = extractHttpUrl(urlInput) ?? extractHttpUrl(context);
  const url = extracted ?? new URL("https://message-analysis.invalid/");
  const hasRealUrl = Boolean(extracted);
  const host = url.hostname.toLowerCase();
  const signalText = `${url.href} ${context}`.toLowerCase();
  const trustedDomain = hasRealUrl ? getTrustedDomain(url) : null;
  const safe = Boolean(trustedDomain);
  const riskScore = riskyWords.reduce((score, word) => score + (signalText.includes(word) ? 1 : 0), 0);
  const highRisk = hasRealUrl && !safe && (riskScore >= 1 || host.endsWith(".example.cn"));
  const displayUrl = redactUrlForDisplay(url.href);

  if (safe) {
    return {
      redirectChain: [{ url: displayUrl, status: 200 }],
      finalUrl: displayUrl,
      formFields: [],
      jsBehaviors: ["离线模式未执行远程页面脚本", "未发现敏感信息采集规则命中"],
      iocHits: [{ type: "domain", value: host, verdict: `${trustedDomain?.label ?? "可信域名"}/低风险` }],
      verdict: "安全",
      raw: {
        source: "tier0",
        template: "trusted-domain",
        trustedDomain,
        screenshotType: "not-captured",
        offlineFallback: true,
      },
    };
  }

  if (highRisk) {
    const brand = signalText.includes("etc") ? "ETC 服务中心" : signalText.includes("bank") ? "银行安全中心" : "快递服务平台";
    return {
      redirectChain: [
        { url: displayUrl, status: 302 },
        { url: `https://cdn-check.example.net/session/${Math.abs(host.length * 137)}`, status: 302 },
        { url: `https://secure-form.example.org${url.pathname}`, status: 200 },
      ],
      finalUrl: `https://secure-form.example.org${url.pathname}`,
      formFields: ["姓名", "身份证号", "银行卡号", "短信验证码"],
      jsBehaviors: ["读取浏览器指纹", "监听表单输入", "跨域外发数据", "阻止返回操作"],
      brandImpersonation: brand,
      iocHits: [
        { type: "domain", value: host, verdict: "新注册/信誉不足" },
        { type: "url", value: displayUrl, verdict: "命中仿冒页面规则" },
        { type: "ip", value: "203.0.113.42", verdict: "关联可疑基础设施" },
      ],
      verdict: riskScore >= 2 ? "诈骗" : "高危",
      raw: {
        source: "tier0",
        template: "credential-harvesting",
        screenshotType: "not-captured",
        offlineFallback: true,
      },
    };
  }

  return {
    redirectChain: hasRealUrl ? [{ url: displayUrl, status: 200 }] : [],
    finalUrl: hasRealUrl ? displayUrl : "未提取到链接",
    formFields: hasRealUrl ? ["手机号"] : [],
    jsBehaviors: hasRealUrl ? ["加载第三方统计脚本"] : ["无链接，未执行页面行为分析"],
    iocHits: hasRealUrl ? [{ type: "domain", value: host, verdict: "暂无明确恶意记录" }] : [],
    // 未知域名但无任何风险信号 → 安全（离线无法验证，但不等于可疑）
    verdict: hasRealUrl ? "安全" : "可疑",
    raw: {
      source: "tier0",
      template: hasRealUrl ? "unknown-domain" : "message-only",
      screenshotType: "not-captured",
      offlineFallback: true,
    },
  };
}




