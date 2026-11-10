"use client";

import { useEffect, useRef } from "react";

/**
 * 鼠标跟随光晕。
 *
 * 做法：监听 pointermove，用 requestAnimationFrame 把坐标写进 CSS 变量
 * （--glow-x / --glow-y），渐变完全由 CSS 计算，不触发 React 重渲染。
 *
 * 行为约束：
 *  - 触屏设备没有 hover，不渲染（由 CSS 的 hover 媒体查询兜底）
 *  - 用户开启「减少动态效果」时保持静态
 */
export default function CursorGlow({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;

    let raf = 0;
    let visible = false;

    const apply = (x: number, y: number) => {
      el.style.setProperty("--glow-x", `${x}px`);
      el.style.setProperty("--glow-y", `${y}px`);
      if (!visible) {
        el.style.setProperty("--glow-opacity", "1");
        visible = true;
      }
    };

    const onMove = (e: PointerEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => apply(e.clientX, e.clientY));
    };

    // 首次进入先放在页面中上部，避免一进来是一块空光斑
    apply(window.innerWidth * 0.5, window.innerHeight * 0.28);

    window.addEventListener("pointermove", onMove, { passive: true });
    return () => {
      window.removeEventListener("pointermove", onMove);
      cancelAnimationFrame(raf);
    };
  }, []);

  return <div ref={ref} aria-hidden className={className} />;
}
