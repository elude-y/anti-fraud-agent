"use client";

import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  BookOpenText,
  CaretDown,
  CaretUp,
  Copy,
  Check,
  MagnifyingGlass,
  ShieldWarning,
} from "@phosphor-icons/react";
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import AppHeader from "@/components/app-header";
import styles from "./cases.module.css";

interface ApiCase {
  id: string;
  title: string;
  category: string;
  riskLabel: string;
  content: string;
  source: string;
  sourceUrl?: string | null;
  sourceTitle?: string | null;
  publishedAt?: string | null;
  sourceKind?: string | null;
  riskFeatures?: string[];
  prevention?: string | null;
  scriptText?: string | null;
}

interface CasesResponse {
  items: ApiCase[];
  total: number;
}

const BALL_COLORS: Record<string, string> = {
  "贷款/信用服务": "#e5717f",
  刷单返利: "#f2b544",
  虚拟货币与AI伪造: "#8b8ae0",
  其他与求职购物: "#c9a06b",
  冒充公检法: "#6f7fd6",
  "冒充领导/熟人": "#8fc25a",
  虚假投资理财: "#c96a9b",
  冒充客服: "#5c9fe0",
  "两卡/跑分洗钱": "#9aa3b5",
  "网络婚恋/交友": "#b07cc9",
  快递理赔: "#7cc47f",
  机票退改签: "#57b8a4",
  中奖: "#ef9a3c",
  医保社保: "#ef8a5b",
  养老诈骗: "#a58ad6",
  "KYC/账户核验": "#d7a441",
  网络游戏交易: "#7fa9d9",
  ETC: "#41b3c0",
};

const FALLBACK_COLORS = ["#d9a05b", "#8fbf7a", "#c98bb0", "#7fa9d9", "#d9c05b", "#a58ad6"];

// 18 个类型时用满这张站位表
const SLOTS = [
  { x: 11, y: 15 }, { x: 26, y: 8 }, { x: 42, y: 14 }, { x: 58, y: 7 },
  { x: 74, y: 13 }, { x: 89, y: 24 }, { x: 6, y: 38 }, { x: 21, y: 46 },
  { x: 37, y: 34 }, { x: 53, y: 44 }, { x: 69, y: 36 }, { x: 85, y: 48 },
  { x: 13, y: 64 }, { x: 30, y: 72 }, { x: 47, y: 62 }, { x: 64, y: 74 },
  { x: 80, y: 66 }, { x: 92, y: 80 }, { x: 38, y: 88 },
];

const SPARSE_SLOTS = [
  { x: 24, y: 20 }, { x: 62, y: 12 }, { x: 44, y: 46 }, { x: 20, y: 66 }, { x: 74, y: 62 },
];

const MIN_CASES = 4;

function formatDate(value?: string | null) {
  if (!value) return "日期未标注";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "日期未标注";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function CasesPage() {
  const [cases, setCases] = useState<ApiCase[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [errorMsg, setErrorMsg] = useState("");

  const [ballsOut, setBallsOut] = useState(false);
  const [active, setActive] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  /** 球收进箱子的布局：等球飞回动画（约 620ms）结束后再切换，避免坐标跳变 */
  const [idleLayout, setIdleLayout] = useState(true);
  const wasOut = useRef(false);
  const [boxRising, setBoxRising] = useState(false);
  const riseTimer = useRef<number | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/cases?pageSize=1000", { cache: "no-store" });
        if (!res.ok) throw new Error(`接口返回 ${res.status}`);
        const data = (await res.json()) as CasesResponse;
        if (cancelled) return;
        setCases((data.items ?? []).filter((item) => item.riskLabel !== "安全"));
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        setErrorMsg(err instanceof Error ? err.message : "加载失败");
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const balls = useMemo(() => {
    const grouped = new Map<string, ApiCase[]>();
    for (const item of cases) {
      const group = item.category;
      const list = grouped.get(group) ?? [];
      list.push(item);
      grouped.set(group, list);
    }
    const entries = [...grouped.entries()]
      .filter(([, list]) => list.length >= MIN_CASES)
      .sort((a, b) => b[1].length - a[1].length);

    // 球少的时候用更分散的站位和更大的体积，避免挤在顶部
    const sparse = entries.length <= 5;
    const slots = sparse ? SPARSE_SLOTS : SLOTS;
    const size = sparse ? 96 : 62;

    return entries.map(([group, list], index) => ({
      category: group,
      count: list.length,
      color: BALL_COLORS[group] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      slot: slots[index % slots.length],
      size,
    }));
  }, [cases]);

  const searching = query.trim().length > 0;
  /** 有关键词就全库搜；否则按当前选中的类型筛选 */
  const panelOpen = Boolean(active) || searching; // 搜索不受「球是否弹出」限制

  const activeList = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    const inCategory = active ? cases.filter((item) => item.category === active) : [];
    const base = searching ? cases : inCategory;
    if (!keyword) return base;
    return base.filter((item) =>
      `${item.title} ${item.content} ${item.category} ${item.scriptText ?? ""}`.toLowerCase().includes(keyword)
    );
  }, [active, cases, query, searching]);

  // 选中案例后列表回到顶部，保证「展开的那条 + 下一条」同时可见
  useEffect(() => {
    if (selectedId && scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [selectedId]);
  useEffect(() => () => {
    if (riseTimer.current) window.clearTimeout(riseTimer.current);
  }, []);

  useEffect(() => {
    if (ballsOut || panelOpen) {
      setIdleLayout(false);
      wasOut.current = ballsOut;
      return;
    }
    // 初次加载不需要等待
    if (!wasOut.current) {
      setIdleLayout(true);
      return;
    }
    wasOut.current = false;
    const timer = setTimeout(() => setIdleLayout(true), 680);
    return () => clearTimeout(timer);
  }, [ballsOut, panelOpen]);
  /** 选中案例后把它移到列表首位，其余顺序不变（便于“点开的那条 + 下一条”同时可见） */
  const displayList = useMemo(() => {
    if (!selectedId) return activeList;
    const index = activeList.findIndex((item) => item.id === selectedId);
    if (index <= 0) return activeList;
    const picked = activeList[index];
    return [picked, ...activeList.slice(0, index), ...activeList.slice(index + 1)];
  }, [activeList, selectedId]);
  const poolColor = active ? BALL_COLORS[active] ?? "#c8a678" : "#c8a678";

  /** 点击木箱：只负责让球弹出 / 收回，不展示全部案例 */
  function toggleBox() {
    if (ballsOut) {
      setBallsOut(false);
      setActive(null);
      setSelectedId(null);
      return;
    }
    // 展开分两拍：箱子先缩小上移（360ms），落位后球再从箱口弹出
    setSelectedId(null);
    setIdleLayout(false);
    setBoxRising(true);
    if (riseTimer.current) window.clearTimeout(riseTimer.current);
    riseTimer.current = window.setTimeout(() => {
      setBoxRising(false);
      setBallsOut(true);
    }, 360);
  }

  function pickCategory(category: string) {
    if (!ballsOut) return;
    setActive((current) => (current === category ? null : category));
    setSelectedId(null);
    setQuery(""); // 选类型时退出搜索，避免停留在搜索结果上
  }

  /** 返回球池：收起水洼与详情，但球留在场上（收纳回箱子只由木箱控制） */
  function exitAll() {
    setSelectedId(null);
    setActive(null);
    setQuery(""); // 返回球池时必须同时退出搜索，否则面板会因 panelOpen 继续开着
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className={styles.page}>
      <AppHeader />
      <div className={styles.wrap}>
        <header className={styles.heading}>
          <span className={styles.kicker}>
            <BookOpenText size={16} weight="fill" />
            ANTI-FRAUD KNOWLEDGE BASE
          </span>
          <h1>反诈案例知识库</h1>
          
        </header>

        <div
          className={`${styles.stage} ${panelOpen ? styles.stageOpen : ""} ${
            idleLayout ? styles.stageIdle : ""
          }`}
        >
          <div className={styles.leftCol}>
            <div className={styles.searchWrap}>
              <label className={styles.searchBox}>
                <MagnifyingGlass size={16} />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setQuery("");
                  }}
                  placeholder="搜索标题、话术或类型"
                  aria-label="搜索案例标题、话术或类型"
                />
                {query && (
                  <button
                    type="button"
                    className={styles.searchClear}
                    onClick={() => setQuery("")}
                    aria-label="清空搜索"
                    title="清空搜索"
                  >
                    ×
                  </button>
                )}
              </label>
            </div>
            <div className={styles.boxArea}>
              <button
                type="button"
                className={`${styles.box} ${ballsOut ? styles.boxOpen : ""} ${boxRising ? styles.boxRising : ""}`}
                onClick={toggleBox}
                aria-label={ballsOut ? "收起案例类型" : "展开案例类型"}
                aria-expanded={ballsOut}
              >
                <span className={styles.boxLabel}>全部</span>
              </button>
              <span className={styles.boxHint}>
                {ballsOut ? "点击木箱收起案例类型" : "点击木箱，让案例类型弹出来"}
              </span>
            </div>

            <div className={styles.ballField}>
              {balls.map((ball, index) => (
                <button
                  key={ball.category}
                  type="button"
                  className={`${styles.ball} ${ballsOut ? "" : styles.ballIn} ${
                    active === ball.category ? styles.ballOn : ""
                  }`}
                  style={
                    {
                      "--x": `${ball.slot.x}%`,
                      "--y": `${ball.slot.y}%`,
                      "--i": index,
                      "--ball-color": ball.color,
                      "--ball-size": `${ball.size}px`,
                    } as CSSProperties
                  }
                  onClick={() => pickCategory(ball.category)}
                  aria-label={`${ball.category}，${ball.count} 条案例`}
                  tabIndex={ballsOut ? 0 : -1}
                >
                  <span className={styles.ballTip}>
                    {ball.category} <span className={styles.ballCount}>{ball.count}</span>
                  </span>
                </button>
              ))}

              {!ballsOut && status === "ready" && (
                <div className={styles.hint}>点击上面的木箱，让 {balls.length} 种案例类型弹出来</div>
              )}
              {status === "loading" && <div className={styles.notice}>正在从知识库加载案例…</div>}
              {status === "error" && (
                <div className={styles.notice}>案例加载失败：{errorMsg}（请确认 /api/cases 可用）</div>
              )}
            </div>
          </div>

          <aside className={styles.poolPanel}>
            <div
              className={`${styles.pool} ${panelOpen ? styles.poolOn : ""}`}
              style={{ "--pool-color": poolColor } as CSSProperties}
            />
            <div className={styles.panelInner}>
              {panelOpen ? (
                <>
                  <div className={styles.panelHead}>
                    <h2>{searching ? "搜索结果" : active}</h2>
                    <span className={styles.panelMeta}>
                      {activeList.length} 条案例
                      <button
                        type="button"
                        className={styles.panelClose}
                        onClick={() => {
                          setQuery("");
                          exitAll();
                        }}
                        aria-label="关闭面板"
                        title="关闭"
                      >
                        ×
                      </button>
                    </span>
                  </div>

                  <div className={`${styles.panelScroll} ${selectedId ? styles.panelScrollOpen : ""}`} ref={scrollRef}>
                    {activeList.length === 0 && (
                      <div className={styles.notice}>没有匹配「{query}」的案例，换个关键词试试</div>
                    )}

                    {displayList.map((item) => {
                      const open = selectedId === item.id;
                      return (
                        <article key={item.id} className={`${styles.caseCard} ${open ? styles.caseCardOpen : ""}`}>
                          <button
                            type="button"
                            className={styles.caseHead}
                            onClick={() => setSelectedId(open ? null : item.id)}
                            aria-expanded={open}
                          >
                            <span className={styles.caseTitle}>{item.title}</span>
                            <span className={styles.caseMeta}>
                              <span className={styles.chip}>{item.category}</span>
                              <span>{formatDate(item.publishedAt)}</span>
                              {open ? <CaretUp size={13} /> : <CaretDown size={13} />}
                            </span>
                          </button>

                          {open && (
                            <div className={styles.caseBody}>
                              <div className={styles.detailSection}>
                                <h4>发生了什么</h4>
                                <p>{item.content}</p>
                              </div>

                              <div className={styles.detailSection}>
                                <h4>关键风险信号</h4>
                                <ul className={styles.signalList}>
                                  {(item.riskFeatures ?? []).map((feature) => (
                                    <li key={feature}>{feature}</li>
                                  ))}
                                </ul>
                              </div>

                              <div className={styles.detailSection}>
                                <h4>建议处置</h4>
                                <p>{item.prevention ?? "—"}</p>
                              </div>

                              <div className={styles.sourceBlock}>
                                <div className={styles.sourceTitle}>
                                  来源：{item.sourceTitle ?? item.source}
                                </div>
                                <div className={styles.sourceMeta}>
                                  {formatDate(item.publishedAt)}
                                  {item.sourceKind === "official"
                                    ? " · 官方通报"
                                    : item.sourceKind === "media"
                                      ? " · 媒体报道"
                                      : ""}
                                </div>
                                {item.sourceUrl && (
                                  <>
                                    <div className={styles.sourceActions}>
                                      <a
                                        className={styles.sourceLink}
                                        href={item.sourceUrl}
                                        target="_blank"
                                        rel="noopener"
                                      >
                                        查看原文
                                        <ArrowRight size={12} />
                                      </a>
                                      <button
                                        type="button"
                                        className={styles.copyButton}
                                        onClick={() => copyLink(item.sourceUrl as string)}
                                      >
                                        {copied ? <Check size={12} /> : <Copy size={12} />}
                                        {copied ? "已复制" : "复制链接"}
                                      </button>
                                    </div>
                                    <code className={styles.sourceUrl}>{item.sourceUrl}</code>
                                  </>
                                )}
                              </div>

                              <div className={styles.actions}>
                                <Link
                                  className={styles.primaryButton}
                                  href={`/analyze?input=${encodeURIComponent(item.scriptText ?? item.content)}`}
                                >
                                  使用此案例测试
                                  <ArrowRight size={15} />
                                </Link>
                                <button
                                  type="button"
                                  className={styles.ghostButton}
                                  onClick={() => setSelectedId(null)}
                                >
                                  <ArrowLeft size={15} />
                                  返回列表
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>

                  <div className={styles.actions}>
                    <button type="button" className={styles.ghostButton} onClick={exitAll}>
                      <ArrowLeft size={15} />
                      返回球池
                    </button>
                  </div>
                </>
              ) : (
                <div className={styles.empty}>
                  <ShieldWarning size={26} />
                  <p>
                    点木箱让案例类型弹出来
                    <br />
                    或把鼠标移到小球上选择诈骗类型
                  </p>
                </div>
              )}
            </div>
          </aside>
        </div>
      </div>
    </main>
  );
}
