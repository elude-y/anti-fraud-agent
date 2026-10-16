import { ShieldCheck } from "@phosphor-icons/react/dist/ssr";
import AppHeader from "@/components/app-header";
import AnalysisWorkbench from "@/components/analysis-workbench";
import styles from "@/app/workspace.module.css";

export default function AnalyzePage() {
  return (
    <main className={styles.page}>
      <AppHeader />
      <div className={styles.main}>
        <header className={styles.pageHeading}>
          <div>
            <span className={styles.kicker}><ShieldCheck size={16} weight="fill" />INTELLIGENT ANALYSIS</span>
            <h1>智能研判工作台</h1>
            <p>从输入规范化、案例检索到动态沙箱验证，全过程生成结构化证据节点；可在没有外部服务时使用 Tier0 离线兜底完成演示。</p>
          </div>
          <div className={styles.headingMeta}><span className={styles.liveBadge}>研判引擎在线</span><span className={styles.softBadge}>Tier0 已就绪</span></div>
        </header>
        <AnalysisWorkbench />
      </div>
    </main>
  );
}
