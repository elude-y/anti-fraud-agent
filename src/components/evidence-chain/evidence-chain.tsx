"use client";

import {
  ArrowRight,
  Brain,
  CheckCircle,
  Code,
  Cube,
  Fingerprint,
  Gauge,
  GlobeHemisphereEast,
  ImageSquare,
  LinkSimple,
  MagnifyingGlass,
  ShieldCheck,
  ShieldWarning,
  WarningCircle,
} from "@phosphor-icons/react";
import { motion, useReducedMotion } from "framer-motion";
import type { EvidenceNode, SandboxEvidencePayload } from "@/lib/contracts";
import {
  buildAttackChain,
  buildRiskSignals,
  type RiskSignalId,
  type RiskTone,
} from "@/lib/risk-explanation";
import styles from "./evidence-chain.module.css";

const nodeIcons = {
  input: Fingerprint,
  rag: MagnifyingGlass,
  confidence: Gauge,
  sandbox: Cube,
  synthesis: Brain,
  conclusion: ShieldCheck,
};

const providerLabels = {
  used: "已使用",
  "not-configured": "未配置",
  skipped: "已跳过",
  failed: "调用失败",
};

const signalIcons: Record<RiskSignalId, typeof WarningCircle> = {
  fields: Fingerprint,
  redirect: LinkSimple,
  scripts: Code,
  ioc: GlobeHemisphereEast,
};

const toneClasses: Record<RiskTone, string> = {
  critical: styles.toneCritical,
  high: styles.toneHigh,
  medium: styles.toneMedium,
  safe: styles.toneSafe,
  neutral: styles.toneNeutral,
};

function isSandboxPayload(payload: unknown): payload is SandboxEvidencePayload {
  if (!payload || typeof payload !== "object") return false;
  return "sandbox" in payload && "sandboxMeta" in payload;
}

function payloadView(node: EvidenceNode) {
  if (!node.payload || typeof node.payload !== "object") {
    return { description: "已记录该阶段的结构化证据。", tags: [] as string[] };
  }

  const payload = node.payload as Record<string, unknown>;
  return {
    description: String(payload.description ?? "已记录该阶段的结构化证据。"),
    tags: Array.isArray(payload.tags) ? payload.tags.map(String) : [],
  };
}

function riskIcon(node: EvidenceNode) {
  if (node.type === "conclusion") return ShieldCheck;
  return nodeIcons[node.type];
}

interface EvidenceChainProps {
  evidence: EvidenceNode[];
}

export default function EvidenceChain({ evidence }: EvidenceChainProps) {
  const reduceMotion = useReducedMotion();

  if (!evidence.length) {
    return (
      <div className={styles.empty}>
        <div>
          <span className={styles.emptyIcon}><Fingerprint size={34} weight="duotone" /></span>
          <h3>等待生成证据链</h3>
          <p>提交链接或短信后，规范化、案例检索、置信度、沙箱行为与最终结论将依次出现。</p>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.list} aria-label="研判证据链" aria-live="polite">
      {evidence.map((node, index) => {
        const Icon = riskIcon(node);
        const view = payloadView(node);
        const sandboxPayload = isSandboxPayload(node.payload) ? node.payload : null;
        const riskSignals = sandboxPayload ? buildRiskSignals(sandboxPayload.sandbox) : [];
        const attackChain = sandboxPayload ? buildAttackChain(sandboxPayload.sandbox) : [];
        const detectedSignalCount = riskSignals.filter((signal) => signal.active).length;
        const sandboxDangerous = sandboxPayload ? sandboxPayload.sandbox.verdict !== "安全" : false;

        return (
          <motion.article
            className={`${styles.node} ${node.type === "conclusion" ? styles.conclusion : ""}`}
            key={node.id}
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.28, delay: reduceMotion ? 0 : Math.min(index * 0.025, 0.14) }}
          >
            <span className={styles.nodeIcon}><Icon size={22} weight="duotone" /></span>
            <div className={styles.nodeBody}>
              <div className={styles.nodeHeader}>
                <div>
                  <span className={styles.nodeType}>{node.type.toUpperCase()}</span>
                  <strong>{node.label}</strong>
                </div>
                <time>{new Date(node.ts).toLocaleTimeString("zh-CN", { hour12: false })}</time>
              </div>
              <p>{view.description}</p>
              {view.tags.length > 0 && (
                <div className={styles.chips}>
                  {view.tags.map((tag, tagIndex) => <span key={`${tag}-${tagIndex}`}>{tag}</span>)}
                </div>
              )}

              {sandboxPayload && (
                <div className={styles.sandboxDetail}>
                  <section
                    className={`${styles.riskOverview} ${toneClasses[sandboxDangerous ? "critical" : "safe"]}`}
                    aria-label="沙箱风险信号总览"
                  >
                    <div className={styles.riskHeader}>
                      <span className={styles.riskTitleIcon}>
                        {sandboxDangerous
                          ? <ShieldWarning size={23} weight="fill" />
                          : <CheckCircle size={23} weight="fill" />}
                      </span>
                      <div>
                        <span>WHY THIS SCORE</span>
                        <strong>
                          {sandboxDangerous
                            ? `检测到 ${detectedSignalCount} 类高风险信号`
                            : "未检测到高风险页面行为"}
                        </strong>
                      </div>
                      <em>{sandboxPayload.sandbox.verdict}</em>
                    </div>

                    <div className={styles.riskSignalGrid}>
                      {riskSignals.map((signal) => {
                        const SignalIcon = signalIcons[signal.id];
                        return (
                          <div
                            className={`${styles.riskSignalItem} ${toneClasses[signal.tone]}`}
                            key={signal.id}
                          >
                            <span className={styles.signalIcon}><SignalIcon size={17} weight="fill" /></span>
                            <span className={styles.signalCopy}>
                              <small>{signal.label}</small>
                              <strong>{signal.value}</strong>
                              <em>{signal.detail}</em>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  <section className={styles.attackBlock} aria-label="风险攻击链">
                    <div className={styles.attackHeading}>
                      <span><WarningCircle size={16} weight="fill" />攻击链推演</span>
                      <small>从诱导入口到敏感信息外发</small>
                    </div>
                    <div className={styles.attackFlow}>
                      {attackChain.map((stage, stageIndex) => (
                        <div className={styles.attackNodeWrap} key={stage.id}>
                          <div className={`${styles.attackStage} ${toneClasses[stage.tone]}`}>
                            <span className={styles.attackStep}>{stageIndex + 1}</span>
                            <strong>{stage.label}</strong>
                            <small>{stage.detail}</small>
                          </div>
                          {stageIndex < attackChain.length - 1 && (
                            <ArrowRight className={styles.attackArrow} size={17} weight="bold" aria-hidden="true" />
                          )}
                        </div>
                      ))}
                    </div>
                  </section>

                  <div className={styles.sandboxGrid}>
                    <section className={styles.shotPanel}>
                      <div className={styles.detailTitle}><ImageSquare size={16} />页面截图</div>
                      {sandboxPayload.sandbox.screenshotUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={sandboxPayload.sandbox.screenshotUrl}
                          alt="沙箱页面截图"
                          loading="lazy"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className={styles.shotEmpty}>
                          <ImageSquare size={28} />
                          <span>Tier0 模板模式，未生成远程截图</span>
                        </div>
                      )}
                      <dl className={styles.metaList}>
                        <div><dt>数据来源</dt><dd>{sandboxPayload.sandboxMeta.source}</dd></div>
                        <div><dt>响应耗时</dt><dd>{sandboxPayload.sandboxMeta.latencyMs} ms</dd></div>
                        <div><dt>最终地址</dt><dd>{sandboxPayload.sandbox.finalUrl}</dd></div>
                      </dl>
                    </section>

                    <section className={styles.redirectPanel}>
                      <div className={styles.detailTitle}><LinkSimple size={16} />跳转链</div>
                      {sandboxPayload.sandbox.redirectChain.length ? (
                        <ol className={styles.redirects}>
                          {sandboxPayload.sandbox.redirectChain.map((hop, hopIndex) => (
                            <li key={`${hop.url}-${hopIndex}`}>
                              <span>{hopIndex + 1}</span>
                              <div><code>{hop.url}</code><small>{hop.status ? `HTTP ${hop.status}` : "已记录"}</small></div>
                            </li>
                          ))}
                        </ol>
                      ) : <p className={styles.muted}>未捕获跳转，输入中也没有可访问链接。</p>}
                    </section>
                  </div>

                  <div className={styles.signalGrid}>
                    <section>
                      <div className={styles.detailTitle}><Fingerprint size={16} />表单字段</div>
                      <div className={styles.signalChips}>
                        {sandboxPayload.sandbox.formFields.length
                          ? sandboxPayload.sandbox.formFields.map((field) => <span key={field}>{field}</span>)
                          : <span className={styles.safeTag}>未发现敏感字段</span>}
                      </div>
                    </section>
                    <section>
                      <div className={styles.detailTitle}><WarningCircle size={16} />脚本行为</div>
                      <div className={styles.signalChips}>
                        {sandboxPayload.sandbox.jsBehaviors.length
                          ? sandboxPayload.sandbox.jsBehaviors.map((behavior) => <span key={behavior}>{behavior}</span>)
                          : <span className={styles.safeTag}>未发现异常行为</span>}
                      </div>
                    </section>
                    <section>
                      <div className={styles.detailTitle}><ShieldCheck size={16} />IOC 命中</div>
                      <div className={styles.iocList}>
                        {sandboxPayload.sandbox.iocHits.length
                          ? sandboxPayload.sandbox.iocHits.slice(0, 5).map((hit, hitIndex) => (
                            <div key={`${hit.type}-${hit.value}-${hitIndex}`}>
                              <span>{hit.type.toUpperCase()}</span>
                              <code>{hit.value}</code>
                              <small>{hit.verdict}</small>
                            </div>
                          ))
                          : <p className={styles.muted}>暂无 IOC 命中。</p>}
                      </div>
                    </section>
                  </div>

                  <div className={styles.providerRow}>
                    <span>urlscan.io <strong>{providerLabels[sandboxPayload.sandboxMeta.providers.urlscan]}</strong></span>
                    <span>VirusTotal <strong>{providerLabels[sandboxPayload.sandboxMeta.providers.virustotal]}</strong></span>
                    {sandboxPayload.sandboxMeta.fallbackReasons[0] && (
                      <span className={styles.fallback}>兜底说明 <strong>{sandboxPayload.sandboxMeta.fallbackReasons[0]}</strong></span>
                    )}
                  </div>
                </div>
              )}
            </div>
          </motion.article>
        );
      })}
    </div>
  );
}
