"use client";

import { GlobeHemisphereEast, ShieldCheck } from "@phosphor-icons/react";
import { useEffect, useState } from "react";
import styles from "./sandbox-provider-status.module.css";

interface ProviderStatus {
  urlscan: boolean;
  virustotal: boolean;
  tier0: boolean;
}

export default function SandboxProviderStatus() {
  const [providers, setProviders] = useState<ProviderStatus | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/sandbox", { signal: controller.signal, cache: "no-store" })
      .then((response) => {
        if (!response.ok) throw new Error("provider status unavailable");
        return response.json() as Promise<{ providers?: ProviderStatus }>;
      })
      .then((payload) => {
        if (payload.providers) setProviders(payload.providers);
        else setFailed(true);
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === "AbortError")) setFailed(true);
      });

    return () => controller.abort();
  }, []);

  const onlineCount = Number(Boolean(providers?.urlscan)) + Number(Boolean(providers?.virustotal));
  const label = !providers
    ? failed ? "Tier0 已就绪" : "检测沙箱能力"
    : onlineCount === 2 ? "在线双源已连接" : onlineCount === 1 ? "部分在线能力" : "Tier0 兜底已就绪";

  return (
    <div className={styles.statusGroup} aria-live="polite">
      <span className={`${styles.badge} ${onlineCount === 2 ? styles.online : styles.fallback}`}>
        <GlobeHemisphereEast size={14} weight="fill" />
        {label}
      </span>
      <span className={styles.provider}>
        <i className={providers?.urlscan ? styles.dotOnline : styles.dotOffline} />
        URLScan
      </span>
      <span className={styles.provider}>
        <i className={providers?.virustotal ? styles.dotOnline : styles.dotOffline} />
        VirusTotal
      </span>
      <span className={styles.provider}>
        <ShieldCheck size={13} weight="fill" />
        Tier0
      </span>
    </div>
  );
}
