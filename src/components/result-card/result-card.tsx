"use client";

import {
  CheckCircle,
  Clock,
  Cube,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import type { AnalysisStreamResult, RiskLevel } from "@/lib/contracts";
import styles from "./result-card.module.css";

function riskClass(level: RiskLevel, classes: Record<string, string>) {
  if (level === "诈骗") return classes.fraud;
  if (level === "高危") return classes.high;
  if (level === "可疑") return classes.suspicious;
  return classes.safe;
}

function sourceLabel(source: AnalysisStreamResult["sandboxMeta"]["source"]) {
  if (source === "tier0") return "Tier0 离线";
  if (source === "urlscan") return "urlscan.io";
  if (source === "urlscan+virustotal") return "双源在线";
  return "VirusTotal + Tier0";
}

interface ResultCardProps {
  result: AnalysisStreamResult | null;
}

export default function ResultCard({ result }: ResultCardProps) {
  const reduceMotion = useReducedMotion();

  if (!result) {
    return (
      <div className={styles.empty}>
        <div>
          <span className={styles.emptyIcon}><ShieldCheck size={34} weight="duotone" /></span>
          <h3>尚未形成结论</h3>
          <p>系统完成六个研判阶段后，将在这里给出风险等级、置信度、数据来源与处置建议。</p>
        </div>
      </div>
    );
  }

  const dangerous = result.verdict !== "安全";

  return (
    <motion.div
      className={styles.body}
      role="status"
      aria-live="polite"
      initial={reduceMotion ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduceMotion ? 0 : 0.35 }}
    >
      <div className={styles.heading}>
        <span className={`${styles.riskMark} ${riskClass(result.verdict, styles)}`}>
          {dangerous ? <WarningCircle size={34} weight="fill" /> : <CheckCircle size={34} weight="fill" />}
        </span>
        <div>
          <span className={styles.eyebrow}>FINAL VERDICT</span>
          <h3>{result.verdict}</h3>
          <p>{result.summary}</p>
        </div>
      </div>

      <div className={styles.confidence}>
        <div><span>综合置信度</span><strong>{(result.confidence * 100).toFixed(0)}%</strong></div>
        <div className={styles.track}><span style={{ width: `${result.confidence * 100}%` }} /></div>
      </div>

      <p className={styles.suggestion}>{result.suggestion}</p>

      <div className={styles.meta}>
        <span><ShieldCheck size={15} />证据节点<strong>{result.evidenceChain.length} 个</strong></span>
        <span><Cube size={15} />沙箱来源<strong>{sourceLabel(result.sandboxMeta.source)}</strong></span>
        <span><Clock size={15} />沙箱响应<strong>{result.sandboxMeta.latencyMs} ms</strong></span>
        <span><CheckCircle size={15} />链路状态<strong>可回放</strong></span>
      </div>
    </motion.div>
  );
}
