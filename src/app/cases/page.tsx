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

const SPARSE_SLOTS = [
  { x: 24, y: 20 }, { x: 62, y: 12 }, { x: 44, y: 46 }, { x: 20, y: 66 }, { x: 74, y: 62 },
];

/**
 * 随机撒点，但保证任意两球不重叠。
 * 用固定种子的伪随机数，保证每次渲染位置一致（不会跳动）。
 * 约束用「切比雪夫距离」：横向或纵向至少有一个方向拉开足够间距。
 */
function scatterPositions(count: number): Array<{ x: number; y: number }> {
  let seed = 20261114;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  const MIN_DX = 0.15; // 横向最小间距（占球池宽度比例）
  const MIN_DY = 0.24; // 纵向最小间距（占球池高度比例）

  const placed: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < count; i++) {
    let best = { x: 0.5, y: 0.5 };
    let bestScore = -1;

    for (let attempt = 0; attempt < 400; attempt++) {
      const cand = { x: 0.05 + rand() * 0.9, y: 0.06 + rand() * 0.86 };

      let score = Number.POSITIVE_INFINITY;
      for (const p of placed) {
        const dx = Math.abs(cand.x - p.x) / MIN_DX;
        const dy = Math.abs(cand.y - p.y) / MIN_DY;
        score = Math.min(score, Math.max(dx, dy));
      }
      if (score === Number.POSITIVE_INFINITY) score = 9;
      if (score > bestScore) {
        bestScore = score;
        best = cand;
      }
      if (score >= 1) break; // 已满足最小间距，直接采用
    }

    placed.push(best);
  }

  return placed.map((p) => ({ x: p.x * 100, y: p.y * 100 }));
}

/**
 * 送去智能研判的文本：优先用话术原文，过长则只保留开头，并去掉案例改写时追加的说明段。
 * 研判输入框上限 500 字，这里控制在约 160 字，保留关键话术即可。
 */
function buildAnalysisText(item: ApiCase): string {
  const raw =
    item.scriptText && !item.scriptText.includes("无话术") ? item.scriptText : item.content ?? "";
  let text = raw
    .split("从同类案件看")[0]
    .split("这类案件的共同特征")[0]
    .split("。同类案件中")[0]
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[。；;，,]$/, "");

  if (text.length > 160) {
    text = `${text.slice(0, 160)}…`;
  }
  return text;
}

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
  const panelRef = useRef<HTMLElement>(null);

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

    // 球少的时候用更分散的站位和更大的体积
    const sparse = entries.length <= 5;
    const size = sparse ? 104 : 80;

    // 随机撒点 + 最小间距约束：看起来错落，但任意两球不会重叠
    const positions = scatterPositions(entries.length);

    return entries.map(([group, list], index) => ({
      category: group,
      count: list.length,
      color: BALL_COLORS[group] ?? FALLBACK_COLORS[index % FALLBACK_COLORS.length],
      slot: sparse
        ? SPARSE_SLOTS[index % SPARSE_SLOTS.length]
        : positions[index] ?? { x: 50, y: 50 },
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

  // 窄屏时面板会排到球池下方，选中类型后自动滚过去，避免"点了没反应"
  useEffect(() => {
    if (!active) return;
    if (typeof window === "undefined") return;
    if (window.innerWidth <= 1080) {
      panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [active]);
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
    setActive(category); // 点一次必定展开，再次点同一个球不再收起（收起用木箱或返回球池）
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
                  onPointerDown={(event) => {
                    event.preventDefault();
                    pickCategory(ball.category);
                  }}
                  aria-label={`${ball.category}，${ball.count} 条案例`}
                  tabIndex={ballsOut ? 0 : -1}
                >
                  <span className={styles.ballLabel}>{ball.category}</span>
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

          <aside className={styles.poolPanel} ref={panelRef}>
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
                                  href={`/analyze?input=${encodeURIComponent(buildAnalysisText(item))}&title=${encodeURIComponent(item.title)}${item.sourceUrl ? `&source=${encodeURIComponent(item.sourceUrl)}` : ""}`}
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
