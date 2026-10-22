"use client";

import { useChat } from "@ai-sdk/react";
import {
  ArrowClockwise,
  ChatCircleDots,
  Cube,
  Gauge,
  LinkSimple,
  LockKey,
  Sparkle,
} from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import EvidenceChain from "@/components/evidence-chain/evidence-chain";
import ResultCard from "@/components/result-card/result-card";
import StageTimeline from "@/components/stages/stage-timeline";
import { loadStoredAnalysis, saveStoredAnalysis } from "@/lib/analysis-store";
import type {
  AnalysisStage,
  AnalysisStreamResult,
  EvidenceNode,
  SafeAgentUIMessage,
} from "@/lib/contracts";
import type { HistoryRecord } from "@/lib/demo-data";
import styles from "@/app/workspace.module.css";

type Mode = "link" | "message";

const transport = new DefaultChatTransport<SafeAgentUIMessage>({
  api: "/api/analyze",
});

const stageIndexes: Partial<Record<AnalysisStage, number>> = {
  normalize: 0,
  rag: 1,
  confidence: 2,
  sandbox: 3,
  synthesis: 4,
  done: 5,
};

const runningLabels: Record<string, string> = {
  rag_search: "检索案例中",
  sandbox_analyze: "沙箱验证中",
  check_ioc: "查询威胁情报",
};

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

function sourceLabel(source: AnalysisStreamResult["sandboxMeta"]["source"]) {
  if (source === "tier0") return "Tier0 离线沙箱";
  if (source === "urlscan") return "urlscan.io";
  if (source === "urlscan+virustotal") return "urlscan.io + VirusTotal";
  return "VirusTotal + Tier0";
}

function readHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem("safeagent:history") ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed as HistoryRecord[] : [];
  } catch {
    return [];
  }
}

export default function AnalysisWorkbench() {
  const [mode, setMode] = useState<Mode>("link");
  const [input, setInput] = useState("");
  const [activeStage, setActiveStage] = useState(-1);
  const [completedStages, setCompletedStages] = useState(0);
  const [evidence, setEvidence] = useState<EvidenceNode[]>([]);
  const [result, setResult] = useState<AnalysisStreamResult | null>(null);
  const [activeTool, setActiveTool] = useState("");
  const [error, setError] = useState("");
  const [replayLabel, setReplayLabel] = useState("");
  const persistedRef = useRef(false);

  function resetRunState() {
    setActiveStage(-1);
    setCompletedStages(0);
    setEvidence([]);
    setResult(null);
    setActiveTool("");
    setError("");
    setReplayLabel("");
    persistedRef.current = false;
  }

  function persistResult(analysis: AnalysisStreamResult) {
    if (persistedRef.current) return;
    persistedRef.current = true;

    const now = new Date();
    const id = `AG-${Date.now().toString().slice(-10)}`;
    const snapshotId = `SNAP-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const createdAt = new Intl.DateTimeFormat("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now).replaceAll("/", "-");

    saveStoredAnalysis({
      id: snapshotId,
      input: analysis.input,
      mode: analysis.mode,
      createdAt: now.toISOString(),
      result: analysis,
    });

    const record: HistoryRecord = {
      id,
      input: analysis.input,
      inputType: analysis.mode === "link" ? "链接" : "短信",
      verdict: analysis.verdict,
      confidence: analysis.confidence,
      summary: analysis.summary,
      evidenceCount: analysis.evidenceChain.length,
      createdAt,
      source: sourceLabel(analysis.sandboxMeta.source),
      snapshotId,
    };
    localStorage.setItem("safeagent:history", JSON.stringify([record, ...readHistory()].slice(0, 30)));
  }

  const {
    sendMessage,
    setMessages,
    stop,
    status,
    error: chatError,
  } = useChat<SafeAgentUIMessage>({
    transport,
    onData: (part) => {
      if (part.type === "data-stage") {
        const index = stageIndexes[part.data.stage];
        if (typeof index !== "number") return;

        if (part.data.status === "active") {
          setActiveStage(index);
        } else {
          setCompletedStages((current) => Math.max(current, index + 1));
          setActiveStage(index < 5 ? index + 1 : -1);
        }
        return;
      }

      if (part.type === "data-tool") {
        setActiveTool(part.data.status === "start" ? runningLabels[part.data.tool] ?? "研判中" : "");
        return;
      }

      if (part.type === "data-evidence") {
        setEvidence((current) => current.some((node) => node.id === part.data.id) ? current : [...current, part.data]);
        return;
      }

      if (part.type === "data-result") {
        setResult(part.data);
        setEvidence(part.data.evidenceChain);
        setCompletedStages(6);
        setActiveStage(-1);
        setActiveTool("");
        persistResult(part.data);
      }
    },
    onError: (caught) => setError(caught.message),
    onFinish: () => setActiveTool(""),
  });

  const running = status === "submitted" || status === "streaming";
  const displayedError = error || chatError?.message || "";
  const sendMessageRef = useRef(sendMessage);

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      const replayId = params.get("replay");
      const query = params.get("input");

      if (replayId) {
        const snapshot = loadStoredAnalysis(replayId);
        if (snapshot) {
          setInput(snapshot.input);
          setMode(snapshot.mode);
          setEvidence(snapshot.result.evidenceChain);
          setResult(snapshot.result);
          setCompletedStages(6);
          setReplayLabel(`已载入 ${snapshot.result.verdict} 研判快照`);
          return;
        }
        setError("未找到该研判快照，可能已被浏览器清理。");
      }

      if (query) {
        const nextMode: Mode = query.match(/https?:\/\//i) ? "link" : "message";
        setInput(query);
        setMode(nextMode);
        if (params.get("autorun") === "1") {
          void sendMessageRef.current({ text: query }, { body: { mode: nextMode } });
        }
      }
    }, 0);

    return () => {
      window.clearTimeout(timer);
    };
  }, []);

  const resetAnalysis = () => {
    void stop();
    setMessages([]);
    resetRunState();
  };

  const runAnalysis = () => {
    const nextInput = input.trim();
    if (!nextInput) {
      setError(`请先输入需要研判的${mode === "link" ? "链接" : "短信内容"}`);
      return;
    }

    resetRunState();
    setMessages([]);
    void sendMessage({ text: nextInput }, { body: { mode } });
  };

  const switchMode = (nextMode: Mode) => {
    setMode(nextMode);
    setInput("");
    resetAnalysis();
  };

  return (
    <>
      <div className={styles.analysisTop}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}>
              <span><Sparkle size={21} weight="fill" /></span>
              <div><h2>提交研判对象</h2><p>可疑链接只发送到服务端沙箱，前端不会直接打开</p></div>
            </div>
            <div className={styles.modeSwitch} role="tablist" aria-label="研判类型">
              <button className={mode === "link" ? styles.modeActive : ""} type="button" role="tab" aria-selected={mode === "link"} onClick={() => switchMode("link")}>
                <LinkSimple size={16} />链接
              </button>
              <button className={mode === "message" ? styles.modeActive : ""} type="button" role="tab" aria-selected={mode === "message"} onClick={() => switchMode("message")}>
                <ChatCircleDots size={16} />短信
              </button>
            </div>
          </div>

          <div className={styles.inputPanel}>
            <div className={styles.inputArea}>
              <textarea
                value={input}
                maxLength={500}
                aria-label={mode === "link" ? "输入可疑链接" : "输入可疑短信"}
                aria-invalid={Boolean(displayedError)}
                aria-describedby={displayedError ? "analysis-input-error" : undefined}
                placeholder={mode === "link" ? "粘贴需要研判的链接，例如：https://example.com" : "粘贴完整短信内容，保留发送方、话术和链接信息"}
                onChange={(event) => { setInput(event.target.value); setError(""); }}
                disabled={running}
                onKeyDown={(event) => {
                  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") runAnalysis();
                }}
              />
              <span className={styles.charCount}>{input.length}/500</span>
            </div>
            {displayedError && <p className={styles.inputError} id="analysis-input-error" role="alert">{displayedError}</p>}
            {replayLabel && <p className={styles.replayNotice} role="status">{replayLabel}</p>}
            <div className={styles.sampleRow}>
              {samples[mode].map((sample, index) => (
                <button type="button" key={sample} disabled={running} onClick={() => { setInput(sample); setError(""); }}>
                  示例 {index + 1}
                </button>
              ))}
            </div>
            <div className={styles.runRow}>
              <span className={styles.privacyNote}><LockKey size={15} weight="fill" />敏感参数在展示前脱敏</span>
              <button className={styles.primaryButton} type="button" disabled={running} aria-busy={running} onClick={runAnalysis}>
                {running
                  ? <><ArrowClockwise size={17} className={styles.spinning} />{activeTool || "研判进行中"}</>
                  : <><Sparkle size={17} weight="fill" />启动智能研判</>}
              </button>
            </div>
          </div>
        </section>

        <aside className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}>
              <span><Gauge size={21} /></span>
              <div><h2>研判阶段</h2><p>服务端流式事件驱动进度</p></div>
            </div>
            <span className={styles.softBadge}>{completedStages}/6</span>
          </div>
          <StageTimeline activeStage={activeStage} completedStages={completedStages} />
        </aside>
      </div>

      <div className={styles.resultsGrid}>
        <section className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}>
              <span><Cube size={21} /></span>
              <div><h2>证据链</h2><p>每个节点都对应可追溯的研判依据</p></div>
            </div>
            {evidence.length > 0 && (
              <button className={styles.textButton} type="button" onClick={resetAnalysis}>
                <ArrowClockwise size={15} />重新研判
              </button>
            )}
          </div>
          <EvidenceChain evidence={evidence} />
        </section>

        <aside className={styles.panel}>
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}>
              <span><Sparkle size={21} /></span>
              <div><h2>研判结论</h2><p>风险等级、置信度与处置建议</p></div>
            </div>
          </div>
          <ResultCard result={result} />
        </aside>
      </div>
    </>
  );
}
