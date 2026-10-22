import type {
  AnalysisStreamResult,
  SandboxEvidencePayload,
  SandboxResult,
} from "@/lib/contracts";

export type RiskTone = "critical" | "high" | "medium" | "safe" | "neutral";
export type RiskSignalId = "fields" | "redirect" | "scripts" | "ioc";
export type RiskReasonId =
  | "brand"
  | "fields"
  | "redirect"
  | "scripts"
  | "ioc"
  | "safe-domain"
  | "safe-fields"
  | "safe-scripts";

export interface RiskSignalSummary {
  id: RiskSignalId;
  label: string;
  value: string;
  detail: string;
  tone: RiskTone;
  active: boolean;
}

export interface RiskReasonSummary {
  id: RiskReasonId;
  label: string;
  detail: string;
  tone: RiskTone;
}

export interface AttackStageSummary {
  id: "entry" | "redirect" | "landing" | "collection" | "exfiltration";
  label: string;
  detail: string;
  tone: RiskTone;
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

function riskyBehaviors(sandbox: SandboxResult) {
  return sandbox.jsBehaviors.filter(
    (behavior) => !behavior.includes("未发现")
      && !behavior.includes("仅加载")
      && !behavior.includes("已完成页面资源"),
  );
}

function riskyIocs(sandbox: SandboxResult) {
  return sandbox.iocHits.filter(
    (item) => !/白名单|低风险|暂无|暂未|安全/.test(item.verdict),
  );
}

function sensitiveFields(sandbox: SandboxResult) {
  return sandbox.formFields.filter(Boolean);
}

function nonEmpty(values: string[]) {
  return values.filter((value) => value && !value.includes("未提取到链接"));
}

export function findSandboxEvidence(evidence: AnalysisStreamResult["evidenceChain"]): SandboxEvidencePayload | null {
  const node = evidence.find((item) => item.type === "sandbox");
  if (!node?.payload || typeof node.payload !== "object") return null;
  if (!("sandbox" in node.payload) || !("sandboxMeta" in node.payload)) return null;
  return node.payload as SandboxEvidencePayload;
}

export function isSimulatedScreenshot(sandbox: SandboxResult) {
  if (!sandbox.raw || typeof sandbox.raw !== "object") return false;
  const raw = sandbox.raw as Record<string, unknown>;
  if (raw.screenshotType === "simulated") return true;
  const behavior = raw.behavior;
  return Boolean(
    behavior
      && typeof behavior === "object"
      && "screenshotType" in behavior
      && behavior.screenshotType === "simulated",
  );
}

export function buildRiskSignals(sandbox: SandboxResult): RiskSignalSummary[] {
  const fields = sensitiveFields(sandbox);
  const redirectCount = Math.max(0, sandbox.redirectChain.length - 1);
  const scripts = riskyBehaviors(sandbox);
  const iocs = riskyIocs(sandbox);
  const criticalField = fields.some((field) => /银行卡|密码|验证码|身份证/.test(field));

  return [
    {
      id: "fields",
      label: "敏感字段",
      value: String(fields.length),
      detail: fields.length ? fields.slice(0, 3).join("、") : "未发现敏感表单",
      tone: fields.length ? criticalField ? "critical" : "high" : "safe",
      active: fields.length > 0,
    },
    {
      id: "redirect",
      label: "跨域跳转",
      value: String(redirectCount),
      detail: redirectCount ? `经过 ${redirectCount} 次中转后到达最终页面` : "无额外跳转",
      tone: redirectCount ? "high" : "safe",
      active: redirectCount > 0,
    },
    {
      id: "scripts",
      label: "异常脚本",
      value: String(scripts.length),
      detail: scripts.length ? scripts.slice(0, 2).join("、") : "未发现高风险脚本",
      tone: scripts.length ? "high" : "safe",
      active: scripts.length > 0,
    },
    {
      id: "ioc",
      label: "IOC 命中",
      value: String(iocs.length),
      detail: iocs.length ? iocs.slice(0, 2).map((item) => item.type.toUpperCase()).join(" / ") : "暂无威胁情报命中",
      tone: iocs.length ? "high" : "safe",
      active: iocs.length > 0,
    },
  ];
}

export function buildRiskReasons(result: AnalysisStreamResult): RiskReasonSummary[] {
  const sandbox = result.sandbox;
  const fields = sensitiveFields(sandbox);
  const scripts = riskyBehaviors(sandbox);
  const iocs = riskyIocs(sandbox);
  const redirectCount = Math.max(0, sandbox.redirectChain.length - 1);
  const dangerous = result.verdict !== "安全";

  if (!dangerous) {
    const host = hostOf(sandbox.finalUrl);
    return [
      {
        id: "safe-domain",
        label: "访问域名未触发风险规则",
        detail: `${host} 未命中仿冒域名或恶意基础设施规则。`,
        tone: "safe",
      },
      {
        id: "safe-fields",
        label: "未发现敏感信息采集",
        detail: "页面证据中没有银行卡、密码、验证码或身份证字段。",
        tone: "safe",
      },
      {
        id: "safe-scripts",
        label: "未发现异常页面行为",
        detail: "未捕获输入监听、跨域外发或阻止返回等脚本。",
        tone: "safe",
      },
    ];
  }

  const reasons: RiskReasonSummary[] = [];
  if (sandbox.brandImpersonation) {
    reasons.push({
      id: "brand",
      label: `疑似仿冒 ${sandbox.brandImpersonation}`,
      detail: "沙箱识别到品牌仿冒特征，落地页与宣称身份不一致。",
      tone: "critical",
    });
  }
  if (fields.length) {
    reasons.push({
      id: "fields",
      label: `采集 ${fields.length} 项敏感信息`,
      detail: `页面包含：${fields.slice(0, 4).join("、")}。`,
      tone: fields.some((field) => /银行卡|密码|验证码/.test(field)) ? "critical" : "high",
    });
  }
  if (redirectCount) {
    reasons.push({
      id: "redirect",
      label: `经过 ${redirectCount} 次跨域跳转`,
      detail: "入口链接与最终落地页不一致，常用于隐藏真实页面。",
      tone: "high",
    });
  }
  if (scripts.length) {
    reasons.push({
      id: "scripts",
      label: "检测到高风险脚本行为",
      detail: scripts.slice(0, 3).join("、"),
      tone: "high",
    });
  }
  if (iocs.length) {
    const first = iocs[0];
    reasons.push({
      id: "ioc",
      label: `命中 ${iocs.length} 条可疑 IOC`,
      detail: `${first.value}：${first.verdict}`,
      tone: "high",
    });
  }

  if (!reasons.length) {
    reasons.push({
      id: "scripts",
      label: "综合信号指向风险",
      detail: result.summary,
      tone: "medium",
    });
  }

  return reasons;
}

export function buildAttackChain(sandbox: SandboxResult): AttackStageSummary[] {
  const fields = sensitiveFields(sandbox);
  const scripts = riskyBehaviors(sandbox);
  const urls = sandbox.redirectChain.map((hop) => hop.url).filter(Boolean);
  const firstUrl = urls[0];
  const finalHost = nonEmpty([hostOf(sandbox.finalUrl)])[0];
  const dangerous = sandbox.verdict !== "安全";

  if (!urls.length) {
    return [
      {
        id: "entry",
        label: "短信话术",
        detail: dangerous ? "出现诱导操作或利益承诺" : "文本未发现明显诱导",
        tone: dangerous ? "high" : "safe",
      },
      {
        id: "collection",
        label: "无链接可执行",
        detail: "未进行页面、跳转或表单验证",
        tone: "neutral",
      },
      {
        id: "exfiltration",
        label: "未捕获外发",
        detail: "没有页面证据证明信息被发送",
        tone: "safe",
      },
    ];
  }

  if (!dangerous) {
    return [
      {
        id: "entry",
        label: "访问入口",
        detail: hostOf(firstUrl),
        tone: "safe",
      },
      {
        id: "landing",
        label: "最终页面",
        detail: finalHost,
        tone: "safe",
      },
      {
        id: "collection",
        label: "信息采集",
        detail: "未发现敏感字段",
        tone: "safe",
      },
    ];
  }

  return [
    {
      id: "entry",
      label: "诱导入口",
      detail: hostOf(firstUrl),
      tone: "medium",
    },
    {
      id: "redirect",
      label: "跨域中转",
      detail: urls.length > 1 ? `${urls.length - 1} 次跳转` : "未捕获额外跳转",
      tone: urls.length > 1 ? "high" : "neutral",
    },
    {
      id: "landing",
      label: "仿冒落地",
      detail: sandbox.brandImpersonation ?? finalHost,
      tone: sandbox.brandImpersonation ? "critical" : "high",
    },
    {
      id: "collection",
      label: "信息采集",
      detail: fields.length ? `${fields.length} 项敏感字段` : "未发现表单",
      tone: fields.length ? "critical" : "neutral",
    },
    {
      id: "exfiltration",
      label: "数据外发",
      detail: scripts.length ? scripts[0] : "未捕获外发脚本",
      tone: scripts.length ? "critical" : "neutral",
    },
  ];
}
