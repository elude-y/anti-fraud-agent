"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Bank,
  BookOpenText,
  CarProfile,
  ChartBar,
  ChatCircleDots,
  CheckCircle,
  ClockCounterClockwise,
  Gift,
  Headset,
  House,
  LinkSimple,
  Moon,
  ShieldCheck,
  Sparkle,
  Sun,
  Truck,
  UserCircle,
  WarningCircle,
} from "@phosphor-icons/react";
import { useRef, useState } from "react";
import styles from "./home.module.css";

type AnalysisMode = "link" | "message";

const examples = [
  { label: "快递理赔", value: "【速运中心】您的包裹已破损，请点击 http://claim-example.cn 办理理赔。", icon: Truck, tone: "violet" },
  { label: "银行认证", value: "https://bank-verify.example.com/security", icon: Bank, tone: "blue" },
  { label: "ETC 通知", value: "您的ETC账户已停用，请于今日完成身份认证：https://etc-check.example.cn", icon: CarProfile, tone: "cyan" },
  { label: "中奖活动", value: "恭喜您成为幸运用户，点击链接领取手机大奖：http://gift-example.cn", icon: Gift, tone: "orange" },
  { label: "冒充客服", value: "我是平台客服，检测到订单异常，请添加联系方式处理退款。", icon: Headset, tone: "indigo" },
] as const;

const toneClass = {
  violet: styles.violet,
  blue: styles.blue,
  cyan: styles.cyan,
  orange: styles.orange,
  indigo: styles.indigo,
};

export default function Home() {
  const router = useRouter();
  const [mode, setMode] = useState<AnalysisMode>("link");
  const [value, setValue] = useState("");
  const [quietLight, setQuietLight] = useState(false);
  const [invalid, setInvalid] = useState(false);
  const fieldRef = useRef<HTMLInputElement | HTMLTextAreaElement>(null);

  const switchMode = (nextMode: AnalysisMode) => {
    setMode(nextMode);
    setValue("");
    setInvalid(false);
    window.setTimeout(() => fieldRef.current?.focus(), 0);
  };

  const chooseExample = (example: (typeof examples)[number]) => {
    const nextMode: AnalysisMode = example.value.startsWith("http") ? "link" : "message";
    setMode(nextMode);
    setValue(example.value);
    setInvalid(false);
    window.setTimeout(() => fieldRef.current?.focus(), 0);
  };

  const startAnalysis = () => {
    if (!value.trim()) {
      setInvalid(true);
      fieldRef.current?.focus();
      return;
    }

    setInvalid(false);
    router.push(`/analyze?input=${encodeURIComponent(value.trim())}&autorun=1`);
  };

  return (
    <main className={`${styles.page} ${quietLight ? styles.quietLight : ""}`}>
      <div className={styles.ambientOne} aria-hidden="true" />
      <div className={styles.ambientTwo} aria-hidden="true" />
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="SafeAgent 首页">
          <span className={styles.brandMark}><ShieldCheck size={26} weight="fill" /></span>
          <span>
            <strong>SafeAgent</strong>
            <small>AI 驱动的可疑链接与短信智能研判平台</small>
          </span>
        </Link>

        <div className={styles.headerTools}>
          <button type="button" aria-label={quietLight ? "恢复环境光" : "减少环境光"} onClick={() => setQuietLight((current) => !current)}>
            {quietLight ? <Moon size={21} /> : <Sun size={21} />}
          </button>
          <button className={styles.avatar} type="button" aria-label="个人中心"><UserCircle size={28} weight="fill" /></button>
        </div>
      </header>

      <nav className={styles.nav} aria-label="主导航">
        <Link className={styles.navActive} href="/"><House size={18} weight="fill" />首页</Link>
        <Link href="/analyze"><ShieldCheck size={18} />智能研判</Link>
        <Link href="/history"><ClockCounterClockwise size={18} />历史记录</Link>
        <Link href="/cases"><BookOpenText size={18} />反诈知识库</Link>
        <Link href="/assistant"><ChatCircleDots size={18} />AI 助手</Link>
        <Link href="/insights"><ChartBar size={18} />数据洞察</Link>
      </nav>

      <section className={styles.hero} id="top">
        <div className={styles.heroCopy}>
          <span className={styles.eyebrow}><ShieldCheck size={18} weight="fill" />守护每一次点击，让网络更安全</span>
          <h1>先判断，<br /><em>再点击。</em></h1>
          <div className={styles.trustLine}>
            <span><CheckCircle size={17} weight="fill" />真实案例溯源</span>
            <span><CheckCircle size={17} weight="fill" />全链路证据</span>
            <span><CheckCircle size={17} weight="fill" />隐私安全保护</span>
          </div>
        </div>

        <div className={styles.heroVisual} aria-label="AI 安全盾牌视觉图">
          <div className={styles.heroHalo} aria-hidden="true" />
          <Image className={styles.shieldImage} src="/safeagent-shield.png" width={780} height={560} priority alt="蓝色透明材质的 SafeAgent AI 安全盾牌" />
          <span className={`${styles.floatingTag} ${styles.tagLink}`}><LinkSimple size={22} weight="bold" />可疑链接</span>
          <span className={`${styles.floatingTag} ${styles.tagRisk}`}><WarningCircle size={22} weight="fill" />诈骗风险</span>
          <span className={`${styles.floatingTag} ${styles.tagSafe}`}><CheckCircle size={22} weight="fill" />安全访问</span>
          <span className={`${styles.floatingTag} ${styles.tagChat}`}><ChatCircleDots size={25} weight="fill" /></span>
        </div>
      </section>

      <section className={styles.analyzer} id="analyzer" aria-label="智能研判输入区">
        <div className={styles.tabs} role="tablist" aria-label="分析类型">
          <button className={mode === "link" ? styles.tabActive : ""} type="button" role="tab" aria-selected={mode === "link"} onClick={() => switchMode("link")}>
            <LinkSimple size={20} weight="bold" />链接分析
          </button>
          <button className={mode === "message" ? styles.tabActive : ""} type="button" role="tab" aria-selected={mode === "message"} onClick={() => switchMode("message")}>
            <ChatCircleDots size={20} weight="bold" />短信分析
          </button>
        </div>

        <div className={styles.analyzerBody}>
          <div className={`${styles.inputShell} ${invalid ? styles.inputInvalid : ""}`}>
            <span className={styles.inputIcon}>{mode === "link" ? <LinkSimple size={27} /> : <ChatCircleDots size={27} />}</span>
            {mode === "link" ? (
              <input
                ref={(node) => { fieldRef.current = node; }}
                type="url"
                value={value}
                aria-label="输入可疑链接"
                aria-invalid={invalid}
                placeholder="请输入可疑链接（如：https://example.com）"
                onChange={(event) => { setValue(event.target.value); setInvalid(false); }}
                onKeyDown={(event) => { if (event.key === "Enter") startAnalysis(); }}
              />
            ) : (
              <textarea
                ref={(node) => { fieldRef.current = node; }}
                value={value}
                aria-label="输入可疑短信"
                aria-invalid={invalid}
                placeholder="粘贴收到的短信内容，我们将分析话术、链接与潜在风险"
                rows={1}
                onChange={(event) => { setValue(event.target.value); setInvalid(false); }}
              />
            )}
            {value && <button className={styles.clearButton} type="button" onClick={() => setValue("")} aria-label="清空输入">×</button>}
          </div>
          <button className={styles.analyzeButton} type="button" onClick={startAnalysis}>
            <Sparkle size={22} weight="fill" />开始分析<ArrowRight size={19} weight="bold" />
          </button>
        </div>
        <p className={`${styles.inputHint} ${invalid ? styles.hintVisible : ""}`}>请先输入需要研判的{mode === "link" ? "链接" : "短信内容"}</p>

        <div className={styles.examples}>
          <span>试试这些示例：</span>
          <div className={styles.exampleList}>
            {examples.map((example) => {
              const Icon = example.icon;
              return (
                <button className={`${styles.exampleChip} ${toneClass[example.tone]}`} type="button" key={example.label} onClick={() => chooseExample(example)}>
                  <Icon size={20} weight="fill" />{example.label}
                </button>
              );
            })}
          </div>
        </div>
      </section>

    </main>
  );
}
