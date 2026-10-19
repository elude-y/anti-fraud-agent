"use client";

import Link from "next/link";
import {
  ArrowCounterClockwise,
  ClockCounterClockwise,
  FileText,
  Funnel,
  MagnifyingGlass,
  ShieldCheck,
  WarningCircle,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/app-header";
import { seedHistory, type HistoryRecord } from "@/lib/demo-data";
import type { RiskLevel } from "@/lib/contracts";
import styles from "@/app/workspace.module.css";

const filters: Array<"全部" | RiskLevel> = ["全部", "诈骗", "高危", "可疑", "安全"];

function readStoredHistory() {
  try {
    const parsed = JSON.parse(localStorage.getItem("safeagent:history") ?? "[]") as unknown;
    return Array.isArray(parsed) ? parsed as HistoryRecord[] : [];
  } catch {
    return [];
  }
}

function badgeClass(level: RiskLevel) {
  if (level === "诈骗") return styles.badgeFraud;
  if (level === "高危") return styles.badgeHigh;
  if (level === "可疑") return styles.badgeSuspicious;
  return styles.badgeSafe;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>(seedHistory);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("全部");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const stored = readStoredHistory();
      setRecords([...stored, ...seedHistory]);
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleRecords = useMemo(() => records.filter((record) => {
    const matchesFilter = filter === "全部" || record.verdict === filter;
    const keyword = query.trim().toLowerCase();
    const matchesQuery = !keyword || `${record.input} ${record.summary} ${record.id}`.toLowerCase().includes(keyword);
    return matchesFilter && matchesQuery;
  }), [filter, query, records]);

  const highRiskCount = records.filter((record) => record.verdict === "诈骗" || record.verdict === "高危").length;
  const avgConfidence = records.length ? records.reduce((sum, record) => sum + record.confidence, 0) / records.length : 0;
  const evidenceCount = records.reduce((sum, record) => sum + record.evidenceCount, 0);

  return (
    <main className={styles.page}>
      <AppHeader />
      <div className={styles.main}>
        <header className={styles.pageHeading}>
          <div>
            <span className={styles.kicker}><ClockCounterClockwise size={16} weight="fill" />ANALYSIS HISTORY</span>
            <h1>历史记录与回放</h1>
            <p>保留每次研判的输入、风险等级、置信度与证据节点。选择任意记录可以重新载入智能研判页，复现完整分析链路。</p>
          </div>
          <div className={styles.headingMeta}><span className={styles.softBadge}>本机演示记录</span></div>
        </header>

        <section className={styles.statsGrid} aria-label="历史数据概览">
          <article className={styles.statCard}><span className={styles.statIcon}><FileText size={25} weight="duotone" /></span><div><strong>{records.length}</strong><small>累计研判记录</small></div></article>
          <article className={styles.statCard}><span className={styles.statIcon}><WarningCircle size={25} weight="duotone" /></span><div><strong>{highRiskCount}</strong><small>高风险样本</small></div></article>
          <article className={styles.statCard}><span className={styles.statIcon}><ShieldCheck size={25} weight="duotone" /></span><div><strong>{(avgConfidence * 100).toFixed(1)}%</strong><small>平均研判置信度</small></div></article>
          <article className={styles.statCard}><span className={styles.statIcon}><ArrowCounterClockwise size={25} weight="duotone" /></span><div><strong>{evidenceCount}</strong><small>累计证据节点</small></div></article>
        </section>

        <section className={styles.panel}>
          <div className={styles.toolbar}>
            <label className={styles.searchBox}><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索链接、短信、记录编号" /></label>
            <div className={styles.filters}><Funnel size={17} />{filters.map((item) => <button className={`${styles.filterButton} ${filter === item ? styles.filterActive : ""}`} type="button" key={item} onClick={() => setFilter(item)}>{item}</button>)}</div>
          </div>

          <div className={styles.historyList}>
            {visibleRecords.map((record) => (
              <article className={styles.historyRow} key={`${record.id}-${record.createdAt}`}>
                <div className={styles.historyMain}><strong>{record.input}</strong><small>{record.id} · {record.inputType} · {record.createdAt}</small></div>
                <p className={styles.historySummary}>{record.summary}</p>
                <span className={`${styles.riskBadge} ${badgeClass(record.verdict)}`}>{record.verdict}</span>
                <span className={styles.numeric}>{(record.confidence * 100).toFixed(0)}% · {record.evidenceCount} 节点</span>
                <Link
                  className={styles.textButton}
                  href={record.snapshotId
                    ? `/analyze?replay=${encodeURIComponent(record.snapshotId)}`
                    : `/analyze?input=${encodeURIComponent(record.input)}&autorun=1`}
                >
                  <ArrowCounterClockwise size={15} />回放
                </Link>
              </article>
            ))}
            {visibleRecords.length === 0 && <div className={styles.emptyState}><div><span className={styles.emptyStateIcon}><MagnifyingGlass size={33} /></span><h3>没有匹配记录</h3><p>调整关键词或风险筛选条件后再试。</p></div></div>}
          </div>
        </section>
      </div>
    </main>
  );
}
