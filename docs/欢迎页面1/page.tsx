"use client";

import Link from "next/link";
import { ArrowRight, BookOpenText, FrameCorners, LinkSimple, ShieldCheck } from "@phosphor-icons/react";
import { useRef, type PointerEvent } from "react";
import headerStyles from "@/components/app-header.module.css";
import styles from "./welcome.module.css";

function tilt(stage: HTMLDivElement, x: number, y: number) {
  stage.style.setProperty("--tilt-x", `${y * -26}deg`);
  stage.style.setProperty("--tilt-y", `${x * 32}deg`);
  stage.style.setProperty("--light-x", `${x * 25}%`);
  stage.style.setProperty("--light-y", `${y * 20}%`);
}

const clamp = (value: number) => Math.max(-1, Math.min(1, value));

export default function Welcome() {
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0 || !event.isPrimary || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    event.currentTarget.dataset.dragging = "true";
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const stage = event.currentTarget;
    if (drag.current?.id === event.pointerId) {
      tilt(stage, clamp((event.clientX - drag.current.x) / 100), clamp((event.clientY - drag.current.y) / 100));
    } else if (event.pointerType === "mouse" && !drag.current) {
      const bounds = stage.getBoundingClientRect();
      tilt(stage, (event.clientX - bounds.left) / bounds.width - 0.5, (event.clientY - bounds.top) / bounds.height - 0.5);
    }
  }

  function reset(event: PointerEvent<HTMLDivElement>) {
    if (drag.current && drag.current.id !== event.pointerId) return;
    if (event.type === "pointerleave" && drag.current) return;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    tilt(event.currentTarget, 0, 0);
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span className={headerStyles.brandMark} aria-hidden="true">
          <ShieldCheck size={25} weight="fill" />
        </span>
        <span>SafeAgent</span>
      </header>

      <section className={styles.hero} aria-labelledby="welcome-title">
        <div className={styles.copy}>
          <h1 id="welcome-title">AI 智能反诈<span>研判平台</span></h1>
          <Link className={styles.enter} href="/platform">
            进入系统
            <span aria-hidden="true"><ArrowRight size={19} weight="bold" /></span>
          </Link>
        </div>

        <div
          className={styles.stage}
          onPointerDown={startDrag}
          onPointerMove={move}
          onPointerLeave={reset}
          onLostPointerCapture={reset}
          aria-hidden="true"
        >
          <div className={styles.motion}>
            <div className={styles.sculpture}>
              <div className={styles.backLoop} />
              <div className={styles.core} />
              <div className={styles.frontLoop} />
              <div className={styles.bubble} />
            </div>
          </div>
        </div>

        <ul className={styles.capabilities} aria-label="平台能力">
          <li><LinkSimple size={20} weight="bold" aria-hidden="true" />链接与短信研判</li>
          <li><FrameCorners size={20} weight="bold" aria-hidden="true" />沙箱截图分析</li>
          <li><BookOpenText size={20} weight="bold" aria-hidden="true" />真实案例溯源</li>
        </ul>
      </section>
    </main>
  );
}
