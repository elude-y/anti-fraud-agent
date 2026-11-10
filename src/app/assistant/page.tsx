import AiAssistant from "@/components/ai-assistant";
import AppHeader from "@/components/app-header";
import styles from "./page.module.css";

export default function AssistantPage() {
  return (
    <main className={styles.page}>
      <AppHeader />
      <AiAssistant />
    </main>
  );
}
