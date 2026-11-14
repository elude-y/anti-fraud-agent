"use client";

import { useChat } from "@ai-sdk/react";
import { ArrowUp, ChatCircleDots, Trash, X } from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import Image from "next/image";
import { usePathname } from "next/navigation";
import {
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import styles from "./assistant-pet.module.css";

const transport = new DefaultChatTransport({ api: "/api/assistant" });
const POSITION_KEY = "safeagent:assistant-pet-position";
const PANEL_SIZE_KEY = "safeagent:assistant-pet-panel-size";
const PET_WIDTH = 92;
const PET_HEIGHT = 118;
const EDGE_GAP = 12;
const DRAG_THRESHOLD = 6;
const PANEL_MIN_WIDTH = 320;
const PANEL_MIN_HEIGHT = 360;

const quickPrompts = [
  "这条短信像是诈骗吗？",
  "帮我判断这个链接是否安全",
  "已经填写了个人信息怎么办？",
] as const;

type PetPosition = { x: number; y: number };
type PanelSize = { width: number; height: number };

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), Math.max(min, max));
}

function clampPosition(x: number, y: number): PetPosition {
  return {
    x: clamp(x, EDGE_GAP, window.innerWidth - PET_WIDTH - EDGE_GAP),
    y: clamp(y, EDGE_GAP, window.innerHeight - PET_HEIGHT - EDGE_GAP),
  };
}

function clampPanelSize(width: number, height: number): PanelSize {
  const mobile = window.innerWidth <= 640;
  const rightGap = mobile ? 12 : 18;
  const bottomGap = mobile ? 112 : 148;
  return {
    width: Math.round(clamp(width, PANEL_MIN_WIDTH, window.innerWidth - rightGap - EDGE_GAP)),
    height: Math.round(clamp(height, PANEL_MIN_HEIGHT, window.innerHeight - bottomGap - EDGE_GAP)),
  };
}

function messageText(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n")
    .trim();
}

export default function AssistantPet() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [position, setPosition] = useState<PetPosition | null>(null);
  const [panelSize, setPanelSize] = useState<PanelSize | null>(null);
  const [dragging, setDragging] = useState(false);
  const [resizingPanel, setResizingPanel] = useState(false);
  const positionRef = useRef<PetPosition | null>(null);
  const panelSizeRef = useRef<PanelSize | null>(null);
  const panelResizeRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    right: number;
    bottom: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    moved: boolean;
    current: PetPosition;
  } | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { messages, sendMessage, setMessages, status, error, clearError, stop } = useChat({ transport });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    let frame = 0;
    let savedPosition: PetPosition | null = null;
    let savedPanelSize: PanelSize | null = null;
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) ?? "null") as PetPosition | null;
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) savedPosition = saved;
    } catch {
      localStorage.removeItem(POSITION_KEY);
    }
    try {
      const saved = JSON.parse(localStorage.getItem(PANEL_SIZE_KEY) ?? "null") as PanelSize | null;
      if (saved && Number.isFinite(saved.width) && Number.isFinite(saved.height)) savedPanelSize = saved;
    } catch {
      localStorage.removeItem(PANEL_SIZE_KEY);
    }
    if (savedPosition || savedPanelSize) {
      frame = window.requestAnimationFrame(() => {
        if (savedPosition) {
          const next = clampPosition(savedPosition.x, savedPosition.y);
          positionRef.current = next;
          setPosition(next);
        }
        if (savedPanelSize) {
          const next = clampPanelSize(savedPanelSize.width, savedPanelSize.height);
          panelSizeRef.current = next;
          setPanelSize(next);
        }
      });
    }
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      if (positionRef.current) {
        const next = clampPosition(positionRef.current.x, positionRef.current.y);
        positionRef.current = next;
        setPosition(next);
      }
      if (panelSizeRef.current) {
        const next = clampPanelSize(panelSizeRef.current.width, panelSizeRef.current.height);
        panelSizeRef.current = next;
        setPanelSize(next);
      }
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: busy ? "auto" : "smooth", block: "end" });
  }, [messages, busy]);

  useEffect(() => {
    if (!open) return;
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onEscape);
    return () => window.removeEventListener("keydown", onEscape);
  }, [open]);

  function savePosition(next: PetPosition) {
    positionRef.current = next;
    setPosition(next);
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify(next));
    } catch {
      // Position persistence is optional.
    }
  }

  function savePanelSize(next: PanelSize) {
    panelSizeRef.current = next;
    setPanelSize(next);
    try {
      localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(next));
    } catch {
      // Panel size persistence is optional.
    }
  }

  function startPanelResize(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary || window.innerWidth <= 640) return;
    const panel = event.currentTarget.closest("section");
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    panelResizeRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startWidth: rect.width,
      startHeight: rect.height,
      right: rect.right,
      bottom: rect.bottom,
    };
    setResizingPanel(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  }

  function movePanelResize(event: PointerEvent<HTMLButtonElement>) {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    const next = {
      width: Math.round(clamp(
        resize.startWidth - (event.clientX - resize.startX),
        PANEL_MIN_WIDTH,
        resize.right - EDGE_GAP,
      )),
      height: Math.round(clamp(
        resize.startHeight - (event.clientY - resize.startY),
        PANEL_MIN_HEIGHT,
        resize.bottom - EDGE_GAP,
      )),
    };
    panelSizeRef.current = next;
    setPanelSize(next);
    event.preventDefault();
  }

  function finishPanelResize(event: PointerEvent<HTMLButtonElement>) {
    const resize = panelResizeRef.current;
    if (!resize || resize.pointerId !== event.pointerId) return;
    panelResizeRef.current = null;
    setResizingPanel(false);
    if (panelSizeRef.current) savePanelSize(panelSizeRef.current);
  }

  function resizeWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    if (window.innerWidth <= 640) return;
    const panel = event.currentTarget.closest("section");
    if (!panel) return;
    const step = event.shiftKey ? 28 : 12;
    const rect = panel.getBoundingClientRect();
    const current = panelSizeRef.current ?? { width: rect.width, height: rect.height };
    let deltaWidth = 0;
    let deltaHeight = 0;
    if (event.key === "ArrowLeft") deltaWidth = step;
    else if (event.key === "ArrowRight") deltaWidth = -step;
    else if (event.key === "ArrowUp") deltaHeight = step;
    else if (event.key === "ArrowDown") deltaHeight = -step;
    else return;
    event.preventDefault();
    savePanelSize(clampPanelSize(current.width + deltaWidth, current.height + deltaHeight));
  }

  function startDrag(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !event.isPrimary) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = positionRef.current ?? { x: rect.left, y: rect.top };
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: origin.x,
      originY: origin.y,
      moved: false,
      current: origin,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function movePet(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) >= DRAG_THRESHOLD) {
      drag.moved = true;
      setDragging(true);
    }
    if (!drag.moved) return;
    const next = clampPosition(drag.originX + dx, drag.originY + dy);
    drag.current = next;
    positionRef.current = next;
    setPosition(next);
  }

  function finishDrag(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      savePosition(drag.current);
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 0);
    }
    dragRef.current = null;
    setDragging(false);
  }

  function moveWithKeyboard(event: KeyboardEvent<HTMLButtonElement>) {
    const step = event.shiftKey ? 28 : 12;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    const rect = event.currentTarget.getBoundingClientRect();
    const origin = positionRef.current ?? { x: rect.left, y: rect.top };
    savePosition(clampPosition(origin.x + dx, origin.y + dy));
  }

  function toggleOpen() {
    if (suppressClickRef.current) return;
    setOpen((current) => !current);
  }

  function submit(value = input) {
    const question = value.trim();
    if (!question || busy) return;
    clearError();
    void sendMessage({ text: question });
    setInput("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit();
  }

  function clearConversation() {
    if (busy) void stop();
    clearError();
    setMessages([]);
    setInput("");
  }

  if (pathname === "/" || pathname === "/assistant") return null;

  const petStyle = position ? ({ left: position.x, top: position.y } as const) : undefined;
  const panelStyle = panelSize ? ({ width: panelSize.width, height: panelSize.height } as const) : undefined;

  return (
    <>
      <button
        className={`${styles.pet} ${position ? styles.positioned : ""} ${dragging ? styles.dragging : ""} ${open ? styles.open : ""}`}
        style={petStyle}
        type="button"
        onClick={toggleOpen}
        onPointerDown={startDrag}
        onPointerMove={movePet}
        onPointerUp={finishDrag}
        onPointerCancel={finishDrag}
        onKeyDown={moveWithKeyboard}
        aria-label={open ? "收起反诈助手" : "打开反诈助手"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <span className={styles.petGlow} aria-hidden="true" />
        <span className={styles.petAvatar}>
          <Image src="/ai-assistant-mascot.png" alt="" width={184} height={184} priority />
        </span>
        <span className={styles.petLabel}><ChatCircleDots size={14} weight="fill" />AI 反诈助手</span>
        <span className={styles.petHint}>拖动可移动</span>
      </button>

      {open && (
        <section
          className={`${styles.panel} ${resizingPanel ? styles.resizing : ""}`}
          style={panelStyle}
          role="dialog"
          aria-label="AI 反诈助手悬浮聊天窗"
        >
          <button
            className={styles.resizeHandle}
            type="button"
            onPointerDown={startPanelResize}
            onPointerMove={movePanelResize}
            onPointerUp={finishPanelResize}
            onPointerCancel={finishPanelResize}
            onKeyDown={resizeWithKeyboard}
            aria-label="拖动调整聊天窗大小"
            title="拖动调整窗口大小"
          />
          <header className={styles.panelHeader}>
            <span className={styles.headerAvatar}>
              <Image src="/ai-assistant-mascot.png" alt="" width={88} height={88} />
            </span>
            <div className={styles.headerCopy}>
              <strong>AI 反诈助手</strong>
              <span><i />案例检索 · 沙箱验证</span>
            </div>
            <div className={styles.headerActions}>
              {messages.length > 0 && (
                <button type="button" onClick={clearConversation} aria-label="清空对话"><Trash size={16} /></button>
              )}
              <button type="button" onClick={() => setOpen(false)} aria-label="收起聊天窗"><X size={18} /></button>
            </div>
          </header>

          <div className={styles.messages} aria-live="polite">
            {messages.length === 0 ? (
              <div className={styles.welcome}>
                <span className={styles.welcomeAvatar}>
                  <Image src="/ai-assistant-mascot.png" alt="AI 反诈助手" width={160} height={160} />
                </span>
                <strong>有可疑信息，先发给我看看</strong>
                <p>可以问短信、链接、转账风险，也可以追问已经泄露信息后的处置办法。</p>
                <div className={styles.quickPrompts}>
                  {quickPrompts.map((prompt) => (
                    <button type="button" key={prompt} disabled={busy} onClick={() => submit(prompt)}>{prompt}</button>
                  ))}
                </div>
              </div>
            ) : (
              <div className={styles.messageList}>
                {messages.map((message) => {
                  const text = messageText(message.parts);
                  if (!text) return null;
                  const assistant = message.role === "assistant";
                  return (
                    <div className={`${styles.message} ${assistant ? styles.assistantMessage : styles.userMessage}`} key={message.id}>
                      {assistant && (
                        <span className={styles.messageAvatar}>
                          <Image src="/ai-assistant-mascot.png" alt="" width={60} height={60} />
                        </span>
                      )}
                      <div className={styles.bubble}>{text}</div>
                    </div>
                  );
                })}
                {busy && (
                  <div className={`${styles.message} ${styles.assistantMessage}`}>
                    <span className={styles.messageAvatar}>
                      <Image src="/ai-assistant-mascot.png" alt="" width={60} height={60} />
                    </span>
                    <div className={styles.typing} aria-label="正在思考"><i /><i /><i /></div>
                  </div>
                )}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className={styles.composerArea}>
            {error && <p className={styles.error}>回答暂时没有生成，请稍后再试。</p>}
            <form className={styles.composer} onSubmit={handleSubmit}>
              <textarea
                value={input}
                rows={1}
                maxLength={500}
                aria-label="向 AI 反诈助手提问"
                placeholder="输入可疑短信、链接或你的问题…"
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    submit();
                  }
                }}
              />
              <button type="submit" disabled={!input.trim() || busy} aria-label="发送问题"><ArrowUp size={18} weight="bold" /></button>
            </form>
            <span className={styles.footnote}>回答仅作风险提示，不替代官方认定。</span>
          </div>
        </section>
      )}
    </>
  );
}