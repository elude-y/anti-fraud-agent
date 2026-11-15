"use client";

import Link from "next/link";
import {
  ArrowCounterClockwise,
  ArrowLeft,
  ArrowRight,
  ChartBar,
  ClockCounterClockwise,
  Funnel,
  MagnifyingGlass,
  TrendUp,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/app-header";
import type { HistoryRecord } from "@/lib/demo-data";
import type { RiskLevel } from "@/lib/contracts";
import styles from "@/app/workspace.module.css";

const riskLevels: RiskLevel[] = ["诈骗", "高危", "可疑", "待核验", "安全"];
const filters: Array<"全部" | RiskLevel> = ["全部", ...riskLevels];
const PAGE_SIZE = 3;

function badgeClass(level: RiskLevel) {
  if (level === "诈骗") return styles.badgeFraud;
  if (level === "高危") return styles.badgeHigh;
  if (level === "可疑") return styles.badgeSuspicious;
  if (level === "待核验") return styles.badgePending;
  return styles.badgeSafe;
}

export default function HistoryPage() {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<(typeof filters)[number]>("全部");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const stored: unknown = JSON.parse(localStorage.getItem("safeagent:history") ?? "[]");
        if (Array.isArray(stored)) setRecords(stored.filter((record): record is HistoryRecord =>
          record && typeof record.id === "string" && typeof record.input === "string"
          && typeof record.createdAt === "string" && filters.includes(record.verdict)));
      } catch {
        setRecords([]);
      }
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
  const totalPages = Math.max(1, Math.ceil(visibleRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRecords = visibleRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const distribution = riskLevels.map((level) => ({
    level, count: records.filter((record) => record.verdict === level).length,
  }));
  const trend = useMemo(() => {
    const current = new Date();
    current.setMinutes(0, 0, 0);
    const lastHour = current.getTime();
    const hour = 3_600_000;
    const hours = Array.from({ length: 12 }, (_, index) => ({
      time: lastHour - hour * (11 - index), count: 0,
    }));
    for (const record of records) {
      const timestamp = new Date(record.createdAt.replace(" ", "T")).getTime();
      const index = Math.floor((timestamp - hours[0].time) / hour);
      if (hours[index]) hours[index].count++;
    }
    return hours;
  }, [records]);
  const maxTrend = Math.max(1, ...trend.map((bucket) => bucket.count));

  return (
    <main className={styles.page}>
      <AppHeader />
      <div className={styles.main}>
        <header className={styles.pageHeading}>
          <div>
            <span className={styles.kicker}><ChartBar size={16} weight="fill" />HISTORY &amp; INSIGHTS</span>
            <h1>历史记录与数据洞察</h1>
          </div>
          <div className={styles.headingMeta}><span className={styles.softBadge}>仅统计本机最近保存的记录</span></div>
        </header>

        <div className={styles.dashboardGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}>
              <div className={styles.panelIconTitle}><span><TrendUp size={21} /></span><h2>近 12 小时研判</h2></div>
            </div>
            <div className={styles.chartBody}>
              <div className={styles.trendChart} aria-label="研判数量柱状图">
                <div className={styles.trendGrid} aria-hidden="true" />
                <div className={styles.trendBars}>
                  {trend.map(({ time, count }) => {
                    const hour = new Date(time).getHours().toString().padStart(2, "0") + ":00";
                    return <div className={styles.trendBar} style={{ height: Math.max(2, count / maxTrend * 100) + "%" }} key={time} title={hour + " · " + count + " 条"}><span>{hour}</span></div>;
                  })}
                </div>
              </div>
            </div>
          </section>

          <section className={`${styles.panel} ${styles.localRiskPanel}`}>
            <div className={styles.panelHeader}>
              <div className={styles.panelIconTitle}><span><ChartBar size={21} /></span><h2>本机风险等级分布</h2></div>
              <span className={styles.softBadge}>累计保存 {records.length} 条</span>
            </div>
            <div className={styles.localRiskWrap}>
              <div className={styles.localRiskGrid}>
                {distribution.map(({ level, count }) => (
                  <div className={styles.localRiskItem} key={level}>
                    <span className={`${styles.riskBadge} ${badgeClass(level)}`}>{level}</span>
                    <strong>{count} 条</strong>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>

        <section className={`${styles.panel} ${styles.sectionGap}`} aria-label="历史研判记录">
          <div className={styles.panelHeader}>
            <div className={styles.panelIconTitle}><span><ClockCounterClockwise size={21} /></span><div><h2>研判记录</h2></div></div>
            <span className={styles.softBadge}>{records.length} 条记录 · {highRiskCount} 条高风险</span>
          </div>
          <div className={styles.toolbar}>
            <label className={styles.searchBox}><MagnifyingGlass size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索链接、短信、记录编号" aria-label="搜索研判记录" /></label>
            <div className={styles.filters}><Funnel size={17} />{filters.map((item) => <button className={`${styles.filterButton} ${filter === item ? styles.filterActive : ""}`} type="button" key={item} onClick={() => { setFilter(item); setPage(1); }}>{item}</button>)}</div>
          </div>

          <div className={styles.historyList}>
            {pagedRecords.map((record) => (
              <article className={styles.historyRow} key={`${record.id}-${record.createdAt}`}>
                <div className={styles.historyMain}><strong>{record.input}</strong><small>{record.id} · {record.inputType} · {record.createdAt}</small></div>
                <p className={styles.historySummary}>{record.summary}</p>
                <span className={`${styles.riskBadge} ${badgeClass(record.verdict)}`}>{record.verdict}</span>
                <span className={record.kind === "真实" ? styles.liveBadge : styles.softBadge}>{record.kind ?? "本机"}</span>
                <span className={styles.numeric}>{(record.confidence * 100).toFixed(0)}% · {record.evidenceCount} 节点</span>
                <Link className={styles.textButton} href={`/analyze?replay=${record.id}`}><ArrowCounterClockwise size={15} />回放</Link>
              </article>
            ))}
            {visibleRecords.length === 0 && <div className={styles.emptyState}><div><span className={styles.emptyStateIcon}><MagnifyingGlass size={33} /></span><h3>没有匹配记录</h3><p>调整关键词或风险筛选条件后再试。</p></div></div>}
          </div>
          {visibleRecords.length > 0 && (
            <footer className={styles.casePagination}>
              <button type="button" disabled={safePage <= 1} onClick={() => setPage(Math.max(1, safePage - 1))}>
                <ArrowLeft size={14} />上一页
              </button>
              <span>第 {safePage} / {totalPages} 页 · 共 {visibleRecords.length} 条</span>
              <button type="button" disabled={safePage >= totalPages} onClick={() => setPage(Math.min(totalPages, safePage + 1))}>
                下一页<ArrowRight size={14} />
              </button>
            </footer>
          )}
        </section>
      </div>
    </main>
  );
}