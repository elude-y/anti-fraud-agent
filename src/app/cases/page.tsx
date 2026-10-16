"use client";

import Link from "next/link";
import {
  ArrowRight,
  BookOpenText,
  CheckCircle,
  Database,
  MagnifyingGlass,
  ShieldWarning,
} from "@phosphor-icons/react";
import { useMemo, useState } from "react";
import AppHeader from "@/components/app-header";
import { demoCases } from "@/lib/demo-data";
import type { RiskLevel } from "@/lib/contracts";
import styles from "@/app/workspace.module.css";

const categories = ["全部", "快递理赔", "ETC 通知", "冒充客服", "银行认证", "中奖活动"];

function badgeClass(level: RiskLevel) {
  if (level === "诈骗") return styles.badgeFraud;
  if (level === "高危") return styles.badgeHigh;
  if (level === "可疑") return styles.badgeSuspicious;
  return styles.badgeSafe;
}

export default function CasesPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部");
  const [selectedId, setSelectedId] = useState(demoCases[0].id);

  const visibleCases = useMemo(() => demoCases.filter((item) => {
    const categoryMatch = category === "全部" || item.category === category;
    const keyword = query.trim().toLowerCase();
    const queryMatch = !keyword || `${item.title} ${item.content} ${item.category}`.toLowerCase().includes(keyword);
    return categoryMatch && queryMatch;
  }), [category, query]);

  const selected = demoCases.find((item) => item.id === selectedId) ?? visibleCases[0] ?? demoCases[0];

  return (
    <main className={styles.page}>
      <AppHeader />
      <div className={styles.main}>
        <header className={styles.pageHeading}>
          <div>
            <span className={styles.kicker}><BookOpenText size={16} weight="fill" />ANTI-FRAUD KNOWLEDGE</span>
            <h1>反诈案例知识库</h1>
            <p>按诈骗类型检索真实案例特征，查看典型话术、关键风险信号与处置建议。案例数据将作为 RAG 检索和标签一致性判断的依据。</p>
          </div>
          <div className={styles.headingMeta}><span className={styles.liveBadge}>{demoCases.length} 条演示案例已索引</span></div>
        </header>

        <div className={styles.caseLayout}>
          <section className={styles.panel}>
            <div className={styles.toolbar}>
              <label className={styles.searchBox}><MagnifyingGlass size={17} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索案例标题、话术或类型" /></label>
              <div className={styles.filters}>{categories.map((item) => <button className={`${styles.filterButton} ${category === item ? styles.filterActive : ""}`} type="button" key={item} onClick={() => setCategory(item)}>{item}</button>)}</div>
            </div>
            <div className={styles.caseList}>
              {visibleCases.map((item) => (
                <button className={`${styles.caseCard} ${selected.id === item.id ? styles.caseSelected : ""}`} type="button" key={item.id} onClick={() => setSelectedId(item.id)}>
                  <span className={styles.caseTop}><span className={styles.caseId}>{item.id}</span><span className={`${styles.riskBadge} ${badgeClass(item.riskLabel)}`}>{item.riskLabel}</span></span>
                  <h3>{item.title}</h3>
                  <p>{item.content}</p>
                  <span className={styles.caseCategory}>{item.category}</span>
                </button>
              ))}
            </div>
          </section>

          <aside className={`${styles.panel} ${styles.detailPanel}`}>
            <div className={styles.panelHeader}><div className={styles.panelIconTitle}><span><Database size={21} /></span><div><h2>案例详情</h2><p>{selected.id}</p></div></div><span className={`${styles.riskBadge} ${badgeClass(selected.riskLabel)}`}>{selected.riskLabel}</span></div>
            <div className={styles.detailBody}>
              <span className={styles.softBadge}>{selected.category}</span>
              <h2>{selected.title}</h2>
              <p>{selected.content}</p>

              <div className={styles.detailSection}>
                <h3>关键风险信号</h3>
                <div className={styles.signalList}>
                  <span>使用紧迫或利益诱导话术推动用户立即操作</span>
                  <span>跳转域名与所宣称的官方品牌主体不一致</span>
                  <span>要求填写验证码、银行卡号或身份证信息</span>
                  <span>页面脚本包含输入监听、外发或阻止返回行为</span>
                </div>
              </div>

              <div className={styles.detailSection}>
                <h3>建议处置</h3>
                <div className={styles.signalList}>
                  <span><CheckCircle size={14} />不要点击短信内链接或继续填写个人信息</span>
                  <span><ShieldWarning size={14} />通过官方 App、官网或客服电话独立核实</span>
                </div>
              </div>

              <p className={styles.sourceLine}>案例来源：{selected.source}</p>
              <Link className={styles.primaryButton} href={`/analyze?input=${encodeURIComponent(selected.content)}`}>使用此案例测试<ArrowRight size={16} /></Link>
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
