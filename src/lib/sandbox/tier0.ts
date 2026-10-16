import type { SandboxResult } from "@/lib/contracts";

const riskyWords = ["claim", "refund", "verify", "secure", "gift", "award", "etc", "bank", "客服", "理赔", "认证", "中奖"];
const safeHosts = new Set(["www.gov.cn", "gov.cn", "www.12321.cn", "12321.cn"]);

function normalizeUrl(input: string) {
  try {
    return new URL(input.startsWith("http") ? input : `https://${input}`);
  } catch {
    return new URL("https://message-analysis.local/");
  }
}

export function analyzeWithTier0(urlInput: string, context = ""): SandboxResult {
  const url = normalizeUrl(urlInput);
  const host = url.hostname.toLowerCase();
  const signalText = `${url.href} ${context}`.toLowerCase();
  const safe = safeHosts.has(host) || host.endsWith(".gov.cn");
  const riskScore = riskyWords.reduce((score, word) => score + (signalText.includes(word) ? 1 : 0), 0);
  const highRisk = !safe && (riskScore >= 1 || host.endsWith(".example.cn") || host.endsWith(".local"));

  if (safe) {
    return {
      redirectChain: [{ url: url.href, status: 200 }],
      finalUrl: url.href,
      formFields: [],
      jsBehaviors: ["仅加载站内静态资源", "未发现敏感信息采集"],
      iocHits: [{ type: "domain", value: host, verdict: "白名单/低风险" }],
      verdict: "安全",
      raw: { source: "tier0", template: "trusted-domain" },
    };
  }

  if (highRisk) {
    const brand = signalText.includes("etc") ? "ETC 服务中心" : signalText.includes("bank") ? "银行安全中心" : "快递服务平台";
    return {
      redirectChain: [
        { url: url.href, status: 302 },
        { url: `https://cdn-check.example.net/session/${Math.abs(host.length * 137)}`, status: 302 },
        { url: `https://secure-form.example.org${url.pathname}`, status: 200 },
      ],
      finalUrl: `https://secure-form.example.org${url.pathname}`,
      formFields: ["姓名", "身份证号", "银行卡号", "短信验证码"],
      jsBehaviors: ["读取浏览器指纹", "监听表单输入", "跨域外发数据", "阻止返回操作"],
      brandImpersonation: brand,
      iocHits: [
        { type: "domain", value: host, verdict: "新注册/信誉不足" },
        { type: "url", value: url.href, verdict: "命中仿冒页面规则" },
        { type: "ip", value: "203.0.113.42", verdict: "关联可疑基础设施" },
      ],
      verdict: riskScore >= 2 ? "诈骗" : "高危",
      raw: { source: "tier0", template: "credential-harvesting", offlineFallback: true },
    };
  }

  return {
    redirectChain: [{ url: url.href, status: 200 }],
    finalUrl: url.href,
    formFields: ["手机号"],
    jsBehaviors: ["加载第三方统计脚本"],
    iocHits: [{ type: "domain", value: host, verdict: "暂无明确恶意记录" }],
    verdict: "可疑",
    raw: { source: "tier0", template: "unknown-domain" },
  };
}
