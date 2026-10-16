"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpenText,
  ChartBar,
  ClockCounterClockwise,
  House,
  ShieldCheck,
  Sun,
  UserCircle,
} from "@phosphor-icons/react";
import styles from "./app-header.module.css";

const navItems = [
  { href: "/", label: "首页", icon: House },
  { href: "/analyze", label: "智能研判", icon: ShieldCheck },
  { href: "/history", label: "历史记录", icon: ClockCounterClockwise },
  { href: "/cases", label: "反诈知识库", icon: BookOpenText },
  { href: "/insights", label: "数据洞察", icon: ChartBar },
] as const;

export default function AppHeader() {
  const pathname = usePathname();

  const toggleAmbient = () => {
    document.documentElement.classList.toggle("reduced-ambient");
  };

  return (
    <>
      <header className={styles.header}>
        <Link className={styles.brand} href="/" aria-label="返回 SafeAgent 首页">
          <span className={styles.brandMark}><ShieldCheck size={25} weight="fill" /></span>
          <span>
            <strong>SafeAgent</strong>
            <small>可疑链接与短信智能研判平台</small>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href || (item.href !== "/" && pathname.startsWith(`${item.href}/`));
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
          <button className={styles.avatar} type="button" aria-label="个人中心"><UserCircle size={28} weight="fill" /></button>
        </div>
      </header>
    </>
  );
}
