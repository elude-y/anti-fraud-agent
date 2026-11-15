"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // 供开发排查：真实错误打在控制台，不暴露给用户
    console.error("[SafeAgent] 页面运行错误:", error);
  }, [error]);

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        <div style={styles.mark} aria-hidden="true">⚠</div>
        <h1 style={styles.title}>页面出错了</h1>
        <p style={styles.desc}>抱歉，页面在加载或运行时遇到了问题，请重试或返回首页。</p>
        {error.message ? <p style={styles.detail}>{error.message}</p> : null}
        <div style={styles.actions}>
          <button type="button" style={styles.primary} onClick={() => reset()}>
            重试
          </button>
          <Link href="/" style={styles.secondary}>
            返回首页
          </Link>
        </div>
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100dvh",
    display: "grid",
    placeItems: "center",
    padding: 24,
    color: "#111a2a",
    background: "linear-gradient(160deg, #f5f9ff 0%, #e8f1ff 60%, #dce9fb 100%)",
  },
  card: {
    maxWidth: 440,
    width: "100%",
    padding: "40px 32px",
    textAlign: "center",
    borderRadius: 20,
    background: "rgba(255, 255, 255, 0.85)",
    boxShadow: "0 18px 48px rgba(120, 150, 190, 0.16)",
    border: "1px solid rgba(46, 109, 246, 0.08)",
  },
  mark: {
    fontSize: 40,
    lineHeight: 1,
    marginBottom: 16,
  },
  title: {
    margin: "0 0 8px",
    fontSize: 24,
    fontWeight: 760,
    letterSpacing: "-0.02em",
  },
  desc: {
    margin: "0 0 8px",
    fontSize: 14,
    lineHeight: 1.7,
    color: "#52637a",
  },
  detail: {
    margin: "8px 0 0",
    fontSize: 12,
    color: "#8a97ac",
    wordBreak: "break-all",
  },
  actions: {
    display: "flex",
    gap: 12,
    justifyContent: "center",
    marginTop: 24,
  },
  primary: {
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 700,
    color: "#fff",
    border: "none",
    borderRadius: 10,
    background: "#2e6df6",
    cursor: "pointer",
  },
  secondary: {
    padding: "10px 22px",
    fontSize: 14,
    fontWeight: 700,
    color: "#2e6df6",
    borderRadius: 10,
    background: "#fff",
    border: "1px solid rgba(46, 109, 246, 0.3)",
    textDecoration: "none",
  },
};
