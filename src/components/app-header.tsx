"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  ChatCircleDots,
  ClockCounterClockwise,
  House,
  ShieldCheck,
  Sun,
} from "@phosphor-icons/react";
import styles from "./app-header.module.css";

const navItems = [
  { href: "/platform", label: "首页", icon: House },
  { href: "/analyze", label: "智能研判", icon: ShieldCheck },
  { href: "/cases", label: "反诈知识库", icon: BookOpenText },
  { href: "/assistant", label: "AI 助手", icon: ChatCircleDots },
  { href: "/history", label: "历史与洞察", icon: ClockCounterClockwise },
] as const;

export default function AppHeader() {
  const pathname = usePathname();

  const toggleAmbient = () => {
    document.documentElement.classList.toggle("reduced-ambient");
  };

  return (
    <>
      <header className={styles.header}>
        <Link className={styles.brand} href="/platform" aria-label="返回 SafeAgent 首页">
          <span className={styles.brandMark}><ShieldCheck size={25} weight="fill" /></span>
          <span>
            <strong>SafeAgent</strong>
            <small>AI 驱动的可疑链接与短信智能研判平台</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (pathname.startsWith(`${item.href}/`));
            return (
              <Link className={active ? styles.active : ""} href={item.href} key={item.href}>
                <Icon size={18} weight={active ? "fill" : "regular"} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.tools}>
          <button type="button" onClick={toggleAmbient} aria-label="切换环境光强度"><Sun size={21} /></button>
        </div>
      </header>
    </>
  );
}

