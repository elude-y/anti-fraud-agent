import {
  ChartBar,
  CheckCircle,
  Clock,
  Database,
  GlobeHemisphereEast,
  Lightning,
  ShieldCheck,
  TrendUp,
  WarningCircle,
} from "@phosphor-icons/react/dist/ssr";
import AppHeader from "@/components/app-header";
import CursorGlow from "@/components/cursor-glow";
import { categoryStats, trendData } from "@/lib/demo-data";
import styles from "@/app/workspace.module.css";

const intelligenceRows = [
  { title: "恶意域名命中", detail: "过去 24 小时", count: "436", icon: GlobeHemisphereEast },
  { title: "敏感表单采集", detail: "银行卡/验证码/身份信息", count: "298", icon: WarningCircle },
  { title: "异常跳转链", detail: "两次以上跨域跳转", count: "184", icon: TrendUp },
  { title: "安全样本确认", detail: "白名单与低风险结果", count: "672", icon: CheckCircle },
] as const;

export default function InsightsPage() {
  const maxTrend = Math.max(...trendData);

  return (
    <main className={`${styles.page} ${styles.gridPage}`}>
      <CursorGlow className={styles.cursorGlow} />
      <AppHeader />
      <div className={styles.main}>
        <header className={styles.pageHeading}>
          <div>
            <span className={styles.kicker}><ChartBar size={16} weight="fill" />THREAT INSIGHTS</span>
            <h1>研判数据洞察</h1>
            <p>本页为演示数据（非真实统计），仅用于展示页面布局。真实识别效果请以消融实验为准：运行 npx tsx scripts/ablation.ts 得到 200 条样本的准确率、漏报、误报与平均耗时。</p>
          </div>
          <div className={styles.headingMeta}><span className={styles.liveBadge}>演示数据 · 非真实统计</span></div>
        </header>

        <section className={styles.statsGrid} aria-label="平台核心指标">
          <article className={styles.statCard}><span className={styles.statIcon}><Database size={25} weight="duotone" /></span><div><strong>200</strong><small>评测样本量（真实）</small></div></article>
          <article className={styles.statCard}><span className={styles.statIcon}><ShieldCheck size={25} weight="duotone" /></span><div><strong>见消融</strong><small>识别准确率（实测）</small></div></article>
          <article className={styles.statCard}><span className={styles.statIcon}><Lightning size={25} weight="duotone" /></span><div><strong>见消融</strong><small>平均耗时（实测）</small></div></article>
          <article className={styles.statCard}><span className={styles.statIcon}><Clock size={25} weight="duotone" /></span><div><strong>99.94%</strong><small>演示链路可用率</small></div></article>
        </section>

        <div className={styles.dashboardGrid}>
          <section className={styles.panel}>
            <div className={styles.panelHeader}><div className={styles.panelIconTitle}><span><TrendUp size={21} /></span><div><h2>近 12 小时研判趋势</h2><p>每小时完成的链接与短信研判数量</p></div></div><span className={styles.softBadge}>+18.6%</span></div>
            <div className={styles.chartBody}>
              <div className={styles.trendChart} aria-label="研判数量柱状图">
                <div className={styles.trendGrid} aria-hidden="true" />
                <div className={styles.trendBars}>
                  {trendData.map((value, index) => <div className={styles.trendBar} style={{ height: `${Math.max(14, (value / maxTrend) * 100)}%`, animationDelay: `${index * 45}ms` }} key={`${value}-${index}`}><span>{String(index + 8).padStart(2, "0")}:00</span></div>)}
                </div>
              </div>
            </div>
          </section>

          <section className={styles.panel}>
            <div className={styles.panelHeader}><div className={styles.panelIconTitle}><span><ChartBar size={21} /></span><div><h2>风险类型分布</h2><p>今日高风险样本分类占比</p></div></div></div>
            <div className={styles.donutWrap}>
              <div className={styles.donut}><span className={styles.donutLabel}><strong>1,286</strong><small>今日样本</small></span></div>
              <div className={styles.legend}>
                {categoryStats.map((item) => <div className={styles.legendItem} key={item.label}><span className={styles.legendDot} style={{ background: item.color }} /><span>{item.label}</span><strong>{item.value}%</strong></div>)}
              </div>
            </div>
          </section>
        </div>

        <section className={`${styles.panel} ${styles.sectionGap}`}>
          <div className={styles.panelHeader}><div className={styles.panelIconTitle}><span><GlobeHemisphereEast size={21} /></span><div><h2>威胁情报概览</h2><p>沙箱与 IOC 检测产生的主要风险信号</p></div></div><span className={styles.softBadge}>多源聚合</span></div>
          <div className={styles.intelList}>
            {intelligenceRows.map((item) => {
              const Icon = item.icon;
              return <article className={styles.intelRow} key={item.title}><span className={styles.intelIcon}><Icon size={20} weight="duotone" /></span><div><strong>{item.title}</strong><small>{item.detail}</small></div><span className={styles.intelCount}>{item.count}</span></article>;
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
