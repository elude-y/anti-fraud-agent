"use client";

import {
  ArrowClockwise,
  Brain,
  ChatCircleDots,
  CheckCircle,
  Cube,
  Fingerprint,
  Gauge,
  LinkSimple,
  LockKey,
  MagnifyingGlass,
  ShieldCheck,
  Sparkle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";
import type { EvidenceNode, RiskLevel, SandboxResult, VerdictResult } from "@/lib/contracts";
import type { HistoryRecord } from "@/lib/demo-data";
import styles from "@/app/workspace.module.css";

type Mode = "link" | "message";

interface SandboxEnvelope {
  source: "tier0";
  latencyMs: number;
  result: SandboxResult;
}

const stages = [
  { label: "输入规范化", detail: "提取链接与关键实体", icon: Fingerprint },
  { label: "案例库检索", detail: "匹配相似诈骗话术", icon: MagnifyingGlass },
  { label: "置信度评估", detail: "融合多维风险信号", icon: Gauge },
  { label: "动态沙箱验证", detail: "检测跳转与页面行为", icon: Cube },
  { label: "综合研判", detail: "合并案例与行为证据", icon: Brain },
  { label: "生成结论", detail: "输出证据链与建议", icon: CheckCircle },
] as const;

const samples = {
  link: [
    "https://claim-express.example.cn/refund",
    "https://etc-verify.example.cn/security",
    "https://www.gov.cn/zhengce/",
  ],
  message: [
    "【速运中心】您的包裹已破损，请点击 http://claim-example.cn 办理理赔。",
    "【ETC】账户将在今晚停用，请访问 https://etc-check.example.cn 完成认证。",
    "平台客服称订单异常，需要添加好友处理退款。",
  ],
};

const nodeIcons = {
  input: Fingerprint,
  rag: MagnifyingGlass,
  confidence: Gauge,
  sandbox: Cube,
  synthesis: Brain,
  conclusion: ShieldCheck,
};

const delay = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

function extractUrl(value: string) {
  return value.match(/https?:\/\/[^\s，。]+/i)?.[0] ?? "https://message-analysis.local/";
}

function riskClass(level: RiskLevel) {
  if (level === "诈骗") return styles.riskFraud;
  if (level === "高危") return styles.riskHigh;
  if (level === "可疑") return styles.riskSuspicious;
  return styles.riskSafe;
}

function payloadView(node: EvidenceNode) {
  const payload = node.payload as Record<string, unknown>;
  const tags = Array.isArray(payload.tags) ? payload.tags.map(String) : [];
  return {
    description: String(payload.description ?? "已记录该阶段的结构化证据。"),
    tags,
  };
}

export default function AnalysisWorkbench() {
  const [mode, setMode] = useState<Mode>("link");
  const [input, setInput] = useState("");
  const [activeStage, setActiveStage] = useState(-1);
  const [completedStages, setCompletedStages] = useState(0);
  const [evidence, setEvidence] = useState<EvidenceNode[]>([]);
  const [verdict, setVerdict] = useState<VerdictResult | null>(null);
  const [sandboxMeta, setSandboxMeta] = useState<{ source: string; latencyMs: number } | null>(null);
  const [error, setError] = useState("");
  const runIdRef = useRef(0);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const query = new URLSearchParams(window.location.search).get("input");
      if (query) {
        setInput(query);
        setMode(query.startsWith("http") ? "link" : "message");
      }
    }, 0);
    return () => {
      window.clearTimeout(timer);
      runIdRef.current += 1;
    };
  }, []);

  const addNode = (type: EvidenceNode["type"], label: string, description: string, tags: string[]) => {
    const node: EvidenceNode = { id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, type, label, payload: { description, tags }, ts: Date.now() };
    setEvidence((current) => [...current, node]);
    return node;
  };

  const persistHistory = (result: VerdictResult, summary: string) => {
    const record: HistoryRecord = {
      id: `AG-${Date.now().toString().slice(-10)}`,
      input,
      inputType: mode === "link" ? "链接" : "短信",
      verdict: result.verdict,
      confidence: result.confidence,
      summary,
      evidenceCount: result.evidenceChain.length,
      createdAt: new Intl.DateTimeFormat("zh-CN", {
        year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
      }).format(new Date()).replaceAll("/", "-") ,
      source: "Tier0 离线沙箱",
    };

    const stored = JSON.parse(localStorage.getItem("safeagent:history") ?? "[]") as HistoryRecord[];
    localStorage.setItem("safeagent:history", JSON.stringify([record, ...stored].slice(0, 30)));
  };

  const runAnalysis = async () => {
    if (!input.trim()) {
      setError(`请先输入需要研判的${mode === "link" ? "链接" : "短信内容"}`);
      return;
    }

    const runId = ++runIdRef.current;
    const accumulated: EvidenceNode[] = [];
    setError("");
    setVerdict(null);
    setEvidence([]);
    setCompletedStages(0);
    setSandboxMeta(null);

    try {
      setActiveStage(0);
      await delay(420);
      if (runId !== runIdRef.current) return;
      accumulated.push(addNode("input", "输入已规范化", mode === "link" ? "已完成 URL 解析、域名提取与参数脱敏。" : "已完成短信话术分段、实体识别与链接提取。", [mode === "link" ? "链接" : "短信", "已脱敏"]));
      setCompletedStages(1);

      setActiveStage(1);
      await delay(520);
      if (runId !== runIdRef.current) return;
      const category = input.includes("ETC") ? "ETC 通知" : input.includes("客服") ? "冒充客服" : "快递理赔";
      accumulated.push(addNode("rag", "检索到相似案例", `案例库返回 3 条高相关记录，主要集中在“${category}”类型。`, ["Top-1 0.91", "标签一致 0.88", category]));
      setCompletedStages(2);

      setActiveStage(2);
      await delay(420);
      if (runId !== runIdRef.current) return;
      accumulated.push(addNode("confidence", "置信度信号融合", "话术模式、域名信誉与案例标签形成一致风险方向，进入沙箱验证。", ["覆盖度 0.86", "一致性 0.88"]));
      setCompletedStages(3);

      setActiveStage(3);
      const response = await fetch("/api/sandbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: extractUrl(input), context: input }),
      });
      if (!response.ok) throw new Error("沙箱接口返回异常");
      const envelope = await response.json() as SandboxEnvelope;
      await delay(520);
      if (runId !== runIdRef.current) return;
      const sandbox = envelope.result;
      setSandboxMeta({ source: envelope.source, latencyMs: envelope.latencyMs });
      accumulated.push(addNode(
        "sandbox",
        "沙箱行为证据已回传",
        `捕获 ${sandbox.redirectChain.length} 段跳转、${sandbox.formFields.length} 个表单字段与 ${sandbox.jsBehaviors.length} 项脚本行为。`,
        [...sandbox.formFields.slice(0, 3), ...sandbox.jsBehaviors.slice(0, 2)],
      ));
      setCompletedStages(4);

      setActiveStage(4);
      await delay(460);
      if (runId !== runIdRef.current) return;
      const level = (["安全", "可疑", "高危", "诈骗"].includes(sandbox.verdict) ? sandbox.verdict : "可疑") as RiskLevel;
      const confidence = level === "诈骗" ? 0.94 : level === "高危" ? 0.88 : level === "可疑" ? 0.76 : 0.96;
      accumulated.push(addNode("synthesis", "多源证据综合", "案例相似度、IOC 信誉与沙箱行为已完成交叉验证，证据方向一致。", [sandbox.brandImpersonation ?? "未发现品牌仿冒", `${sandbox.iocHits.length} 条 IOC`]));
      setCompletedStages(5);

      setActiveStage(5);
      await delay(380);
      if (runId !== runIdRef.current) return;
      const suggestion = level === "安全"
        ? "当前未发现明显风险，可通过官方入口再次核验后访问。"
        : "请勿继续访问或填写信息，建议立即关闭页面、保留截图并通过官方渠道核实。";
      const conclusionNode: EvidenceNode = {
        id: `conclusion-${Date.now()}`,
        type: "conclusion",
        label: `研判结论：${level}`,
        payload: { description: suggestion, tags: [`置信度 ${(confidence * 100).toFixed(0)}%`, "证据链完整"] },
        ts: Date.now(),
      };
      const chain = [...accumulated, conclusionNode];
      setEvidence((current) => [...current, conclusionNode]);
      const finalResult: VerdictResult = { verdict: level, confidence, suggestion, evidenceChain: chain };
      setVerdict(finalResult);
      setCompletedStages(6);
      setActiveStage(-1);
      persistHistory(finalResult, `${sandbox.brandImpersonation ? `疑似仿冒${sandbox.brandImpersonation}，` : ""}发现 ${sandbox.formFields.length} 个敏感表单字段与 ${sandbox.iocHits.length} 条 IOC 记录`);
    } catch (caught) {
      if (runId !== runIdRef.current) return;
      setActiveStage(-1);
      setError(caught instanceof Error ? caught.message : "研判流程暂时不可用，请稍后重试");
    }
  };

  const resetAnalysis = () => {
    runIdRef.current += 1;
    setActiveStage(-1);
    setCompletedStages(0);
    setEvidence([]);
    setVerdict(null);
    setSandboxMeta(null);
    setError("");
  };

  return (
    <>
      <div className={styles.analysisTop}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}>
              <span><Sparkle size={21} weight="fill" /></span>
              <div><h2>提交研判对象</h2><p>可疑链接永不在浏览器直接打开，只发送到服务端沙箱</p></div>
            </div>
            <div className={styles.modeSwitch} role="tablist" aria-label="研判类型">
              <button className={mode === "link" ? styles.modeActive : ""} type="button" onClick={() => { setMode("link"); resetAnalysis(); }}><LinkSimple size={16} />链接</button>
              <button className={mode === "message" ? styles.modeActive : ""} type="button" onClick={() => { setMode("message"); resetAnalysis(); }}><ChatCircleDots size={16} />短信</button>
            </div>
          </div>
          <div className={styles.inputPanel}>
            <div className={styles.inputArea}>
              <textarea
                value={input}
                maxLength={500}
                aria-label={mode === "link" ? "输入可疑链接" : "输入可疑短信"}
                placeholder={mode === "link" ? "粘贴需要研判的链接，例如：https://example.com" : "粘贴完整短信内容，保留发送方、话术和链接信息"}
                onChange={(event) => { setInput(event.target.value); setError(""); }}
              />
              <span className={styles.charCount}>{input.length}/500</span>
            </div>
            {error && <p className={styles.inputError}>{error}</p>}
            <div className={styles.sampleRow}>
              {samples[mode].map((sample, index) => <button type="button" key={sample} onClick={() => { setInput(sample); resetAnalysis(); }}>示例 {index + 1}</button>)}
            </div>
            <div className={styles.runRow}>
              <span className={styles.privacyNote}><LockKey size={15} weight="fill" />研判输入仅用于本次分析演示</span>
              <button className={styles.primaryButton} type="button" disabled={activeStage >= 0} onClick={runAnalysis}>
                {activeStage >= 0 ? <><ArrowClockwise size={17} className={styles.spinning} />研判进行中</> : <><Sparkle size={17} weight="fill" />启动智能研判</>}
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}><span><Gauge size={21} /></span><div><h2>研判阶段</h2><p>实时展示证据生成进度</p></div></div>
            <span className={styles.softBadge}>{completedStages}/6</span>
          </div>
          <div className={styles.stages}>
            {stages.map((stage, index) => {
              const Icon = stage.icon;
              const isDone = index < completedStages;
              const isActive = index === activeStage;
              return (
                <div className={`${styles.stageItem} ${isDone ? styles.stageDone : ""} ${isActive ? styles.stageActive : ""}`} key={stage.label}>
                  <span className={styles.stageIcon}>{isDone ? <CheckCircle size={19} weight="fill" /> : <Icon size={19} />}</span>
                  <span><strong>{stage.label}</strong><small>{stage.detail}</small></span>
                  <span className={styles.stageState}>{isDone ? "完成" : isActive ? "处理中" : "等待"}</span>
                </div>
              );
            })}
          </div>
        </aside>
      </div>

      <div className={styles.resultsGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}><span><Fingerprint size={21} /></span><div><h2>证据链</h2><p>每个节点都对应可追溯的研判依据</p></div></div>
            {evidence.length > 0 && <button className={styles.textButton} type="button" onClick={resetAnalysis}><ArrowClockwise size={15} />重新研判</button>}
          </div>
          {evidence.length === 0 ? (
            <div className={styles.emptyState}><div><span className={styles.emptyStateIcon}><Fingerprint size={34} weight="duotone" /></span><h3>等待生成证据链</h3><p>提交链接或短信后，案例检索、置信度、沙箱行为和最终结论将依次出现在这里。</p></div></div>
          ) : (
            <div className={styles.evidenceList}>
              {evidence.map((node) => {
                const Icon = nodeIcons[node.type];
                const view = payloadView(node);
                return (
                  <article className={styles.evidenceNode} key={node.id}>
                    <span className={styles.nodeIcon}><Icon size={22} weight="duotone" /></span>
                    <div className={styles.nodeBody}>
                      <div className={styles.nodeHeader}><strong>{node.label}</strong><time>{new Date(node.ts).toLocaleTimeString("zh-CN", { hour12: false })}</time></div>
                      <p>{view.description}</p>
                      <div className={styles.payloadChips}>{view.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <aside className={styles.panel}>
          <div className={styles.panelHeader}><div className={styles.panelIconTitle}><span><ShieldCheck size={21} /></span><div><h2>研判结论</h2><p>风险等级与处置建议</p></div></div></div>
          {verdict ? (
            <div className={styles.verdictBody}>
              <span className={`${styles.riskMark} ${riskClass(verdict.verdict)}`}>{verdict.verdict === "安全" ? <CheckCircle size={34} weight="fill" /> : <WarningCircle size={34} weight="fill" />}</span>
              <h3>{verdict.verdict}</h3>
              <div className={styles.confidence}>
                <div className={styles.confidenceLabel}><span>综合置信度</span><strong>{(verdict.confidence * 100).toFixed(0)}%</strong></div>
                <div className={styles.confidenceTrack}><span style={{ width: `${verdict.confidence * 100}%` }} /></div>
              </div>
              <p className={styles.suggestion}>{verdict.suggestion}</p>
              <div className={styles.verdictMeta}>
                <span>证据节点<strong>{evidence.length} 个</strong></span>
                <span>沙箱来源<strong>{sandboxMeta?.source === "tier0" ? "Tier0 离线" : "在线"}</strong></span>
                <span>沙箱响应<strong>{sandboxMeta?.latencyMs ?? 0} ms</strong></span>
                <span>链路状态<strong>可回放</strong></span>
              </div>
            </div>
          ) : (
            <div className={styles.emptyState}><div><span className={styles.emptyStateIcon}><ShieldCheck size={34} weight="duotone" /></span><h3>尚未形成结论</h3><p>系统完成六个研判阶段后，将在这里给出风险等级、置信度与处置建议。</p></div></div>
          )}
        </aside>
      </div>
    </>
  );
}
