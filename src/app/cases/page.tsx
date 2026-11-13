"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  ArrowSquareOut,
  BookOpenText,
  CheckCircle,
  Database,
  MagnifyingGlass,
  ShieldWarning,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useState } from "react";
import AppHeader from "@/components/app-header";
import { demoCases } from "@/lib/demo-data";
import type { CaseItem, CasesResponse, RiskLevel } from "@/lib/contracts";
import styles from "@/app/workspace.module.css";

const PAGE_SIZE = 12;

function badgeClass(level: RiskLevel) {
  if (level === "诈骗") return styles.badgeFraud;
  if (level === "高危") return styles.badgeHigh;
  if (level === "可疑") return styles.badgeSuspicious;
  if (level === "待核验") return styles.badgePending;
  return styles.badgeSafe;
}

export default function CasesPage() {
  const [cases, setCases] = useState<CaseItem[]>(demoCases);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState(demoCases[0].id);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState("内置案例");

  useEffect(() => {
    let active = true;
    void fetch("/api/cases?pageSize=200")
      .then((response) => response.ok ? response.json() as Promise<CasesResponse & { source?: string }> : null)
      .then((payload) => {
        if (!active || !payload?.items.length) return;
        setCases(payload.items);
        setSelectedId(payload.items[0].id);
        setDataSource(payload.source === "local-900" ? "900 条本地数据仓" : payload.source === "supabase" ? "Supabase 案例库" : "案例接口");
      })
      .catch(() => {
        // Keep the bundled demo cases when the API is unavailable.
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of cases) counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    return ["全部", ...counts.keys()].map((name) => ({
      name,
      count: name === "全部" ? cases.length : counts.get(name) ?? 0,
    }));
  }, [cases]);

  const visibleCases = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return cases.filter((item) => {
      if (category !== "全部" && item.category !== category) return false;
      if (!keyword) return true;
      return [
        item.id,
        item.title,
        item.content,
        item.category,
        item.source,
        item.sourceTitle ?? "",
        ...(item.riskFeatures ?? []),
        item.scriptText ?? "",
      ].join(" ").toLowerCase().includes(keyword);
    });
  }, [cases, category, query]);

  const totalPages = Math.max(1, Math.ceil(visibleCases.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedCases = visibleCases.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const selected = visibleCases.find((item) => item.id === selectedId)
    ?? pagedCases[0]
    ?? visibleCases[0]
    ?? cases[0];
  const riskFeatures = selected?.riskFeatures?.length
    ? selected.riskFeatures
    : ["制造紧迫感", "诱导点击或转账", "要求提供敏感信息"];

  return (
    <main className={styles.page}>
      <AppHeader />
      <div className={styles.main}>
        <header className={styles.pageHeading}>
          <div>
            <span className={styles.kicker}><BookOpenText size={16} weight="fill" />ANTI-FRAUD KNOWLEDGE</span>
            <h1>反诈案例知识库</h1>
          </div>
          <div className={styles.headingMeta}>
            <span className={styles.liveBadge}>{loading ? "正在载入案例" : `${cases.length} 条案例已索引`}</span>
            <span className={styles.softBadge}>{dataSource}</span>
          </div>
        </header>

        <section className={`${styles.panel} ${styles.caseControlPanel}`}>
          <div className={styles.toolbar}>
            <label className={styles.searchBox}>
              <MagnifyingGlass size={17} />
              <input value={query} onChange={(event) => { setQuery(event.target.value); setPage(1); }} placeholder="搜索案例标题、类型、来源或风险信号" />
            </label>
            <div className={styles.filters}>
              {categories.map((item) => (
                <button
                  className={`${styles.filterButton} ${category === item.name ? styles.filterActive : ""}`}
                  type="button"
                  key={item.name}
                  onClick={() => { setCategory(item.name); setPage(1); }}
                >
                  {item.name}<small>{item.count}</small>
                </button>
              ))}
            </div>
          </div>
        </section>

        {visibleCases.length > 0 && selected ? (
          <div className={`${styles.caseLayout} ${styles.caseLayoutSpaced}`}>
            <section className={styles.panel}>
              <div className={styles.caseList}>
                {pagedCases.map((item) => (
                  <button
                    className={`${styles.caseCard} ${selected.id === item.id ? styles.caseSelected : ""}`}
                    type="button"
                    key={item.id}
                    onClick={() => setSelectedId(item.id)}
                  >
                    <span className={styles.caseTop}>
                      <span className={styles.caseId}>{item.id}</span>
                      <span className={`${styles.riskBadge} ${badgeClass(item.riskLabel)}`}>{item.riskLabel}</span>
                    </span>
                    <h3>{item.title}</h3>
                    <p>{item.content}</p>
                    <span className={styles.caseCategory}>{item.category}</span>
                  </button>
                ))}
              </div>
              <footer className={styles.casePagination}>
                <button type="button" disabled={safePage <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>
                  <ArrowLeft size={14} />上一页
                </button>
                <span>{safePage} / {totalPages} · 共 {visibleCases.length} 条</span>
                <button type="button" disabled={safePage >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>
                  下一页<ArrowRight size={14} />
                </button>
              </footer>
            </section>

            <aside className={`${styles.panel} ${styles.detailPanel}`}>
              <div className={styles.panelHeader}>
                <div className={styles.panelIconTitle}>
                  <span><Database size={21} /></span>
                  <div><h2>案例详情</h2><p>{selected.id}</p></div>
                </div>
                <span className={`${styles.riskBadge} ${badgeClass(selected.riskLabel)}`}>{selected.riskLabel}</span>
              </div>
              <div className={styles.detailBody}>
                <span className={styles.softBadge}>{selected.category}</span>
                <h2>{selected.title}</h2>
                <p>{selected.content}</p>

                <div className={styles.detailSection}>
                  <h3>关键风险信号</h3>
                  <div className={styles.signalList}>
                    {riskFeatures.slice(0, 6).map((signal) => <span key={signal}>{signal}</span>)}
                  </div>
                </div>

                {selected.scriptText && (
                  <div className={styles.detailSection}>
                    <h3>典型话术</h3>
                    <blockquote className={styles.caseScript}>“{selected.scriptText}”</blockquote>
                  </div>
                )}

                <div className={styles.detailSection}>
                  <h3>建议处置</h3>
                  <div className={styles.signalList}>
                    <span><CheckCircle size={14} />{selected.prevention ?? "不要点击短信内链接或继续填写个人信息"}</span>
                    <span><ShieldWarning size={14} />通过官方 App、官网或公开客服电话独立核实</span>
                  </div>
                </div>

                <p className={styles.sourceLine}>
                  案例来源：{selected.sourceUrl
                    ? <a href={selected.sourceUrl} target="_blank" rel="noreferrer">{selected.source}<ArrowSquareOut size={13} /></a>
                    : selected.source}
                  {selected.publishedAt ? ` · ${selected.publishedAt}` : ""}
                </p>
                <Link className={styles.primaryButton} href={`/analyze?input=${encodeURIComponent(selected.content)}`}>
                  使用此案例测试<ArrowRight size={16} />
                </Link>
              </div>
            </aside>
          </div>
        ) : (
          <section className={`${styles.panel} ${styles.caseEmpty}`}>
            <BookOpenText size={34} weight="duotone" />
            <h2>没有匹配案例</h2>
            <p>换一个关键词或恢复“全部”分类。</p>
            <button type="button" onClick={() => { setQuery(""); setCategory("全部"); setPage(1); }}>清除筛选</button>
          </section>
        )}
      </div>
    </main>
  );
}
