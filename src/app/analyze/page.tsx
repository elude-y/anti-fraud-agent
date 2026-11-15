import AppHeader from "@/components/app-header";
import AnalysisWorkbench from "@/components/analysis-workbench";
import SandboxProviderStatus from "@/components/sandbox-provider-status";
import styles from "@/app/workspace.module.css";

export default function AnalyzePage() {
  return (
    <main className={styles.page}>
      <AppHeader />
      <div className={styles.main}>
        <header className={styles.pageHeading}>
          <div>
            <h1>智能研判工作台</h1>
          </div>
          <div className={styles.headingMeta}><SandboxProviderStatus /></div>
        </header>
        <AnalysisWorkbench />
      </div>
    </main>
  );
}
