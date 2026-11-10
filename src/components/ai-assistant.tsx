"use client";

import { useChat } from "@ai-sdk/react";
import {
  ArrowUp,
  BookOpenText,
  ChatCircleDots,
  Check,
  Copy,
  Plus,
  ShieldCheck,
  Sparkle,
  Stop,
} from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import styles from "./ai-assistant.module.css";

const transport = new DefaultChatTransport({ api: "/api/assistant" });
const storageKey = "safeagent:assistant-messages";

const suggestions = [
  "陌生客服索要验证码，我该怎么办？",
  "怎么判断一个网站是不是官方网站？",
  "收到 ETC 失效短信应该如何核实？",
  "给我讲讲冒充公检法诈骗的常见话术",
] as const;

function textFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");
}

export default function AiAssistant() {
  const [input, setInput] = useState("");
  const [restored, setRestored] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const {
    messages,
    sendMessage,
    setMessages,
    status,
    error,
    clearError,
    stop,
  } = useChat({ transport });

  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown;
      if (Array.isArray(saved)) setMessages(saved);
    } catch {
      localStorage.removeItem(storageKey);
    } finally {
      setRestored(true);
    }
  }, [setMessages]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(storageKey, JSON.stringify(messages.slice(-30)));
  }, [messages, restored]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: status === "streaming" ? "auto" : "smooth" });
  }, [messages, status]);

  useEffect(() => {
    const field = textareaRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 160)}px`;
  }, [input]);

  const submit = (value = input) => {
    const question = value.trim();
    if (!question || busy) return;
    clearError();
    void sendMessage({ text: question });
    setInput("");
  };

  const newConversation = () => {
    if (busy) void stop();
    clearError();
    setMessages([]);
    setInput("");
    localStorage.removeItem(storageKey);
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const copyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId(""), 1500);
    } catch {
      setCopiedId("");
    }
  };

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar} aria-label="AI 助手功能说明">
        <div className={styles.sideBrand}>
          <span><ChatCircleDots size={22} weight="duotone" /></span>
          <div><strong>AI 助手</strong><small>反诈问答与风险咨询</small></div>
        </div>

        <button className={styles.newChat} type="button" onClick={newConversation}>
          <Plus size={17} weight="bold" />新对话
        </button>

        <div className={styles.sideInfo}>
          <div><BookOpenText size={18} /><span><strong>案例库增强</strong><small>结合真实反诈案例回答</small></span></div>
          <div><ShieldCheck size={18} /><span><strong>安全优先</strong><small>提供核实与处置建议</small></span></div>
        </div>

        <p className={styles.sideNote}>回答用于风险提示，不能替代警方、银行或相关平台的正式认定。</p>
      </aside>

      <section className={styles.chatPanel} aria-label="SafeAgent AI 助手对话">
        <header className={styles.chatHeader}>
          <div>
            <span className={styles.onlineDot} />
            <strong>SafeAgent AI 助手</strong>
            <small>案例库增强</small>
          </div>
          {messages.length > 0 && (
            <button type="button" onClick={newConversation}><Plus size={16} />新对话</button>
          )}
        </header>

        <div className={styles.messages} aria-live="polite">
          {messages.length === 0 ? (
            <div className={styles.emptyState}>
              <span className={styles.assistantMark}><Sparkle size={28} weight="fill" /></span>
              <h1>有什么可以帮你分析的？</h1>
              <p>询问可疑短信、陌生链接、诈骗话术或遇险后的处理方式，我会结合案例库给出建议。</p>
              <div className={styles.suggestions}>
                {suggestions.map((suggestion) => (
                  <button type="button" key={suggestion} onClick={() => submit(suggestion)}>
                    <span>{suggestion}</span><ArrowUp size={15} />
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className={styles.messageList}>
              {messages.map((message) => {
                const text = textFromParts(message.parts);
                if (!text) return null;
                const assistant = message.role === "assistant";
                return (
                  <article className={`${styles.message} ${assistant ? styles.assistantMessage : styles.userMessage}`} key={message.id}>
                    {assistant && <span className={styles.messageAvatar}><Sparkle size={17} weight="fill" /></span>}
                    <div className={styles.messageBody}>
                      {assistant && <strong>SafeAgent</strong>}
                      <p>{text}</p>
                      {assistant && !busy && (
                        <button className={styles.copyButton} type="button" onClick={() => void copyMessage(message.id, text)} aria-label="复制回答">
                          {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                          {copiedId === message.id ? "已复制" : "复制"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
              {status === "submitted" && (
                <div className={`${styles.message} ${styles.assistantMessage}`}>
                  <span className={styles.messageAvatar}><Sparkle size={17} weight="fill" /></span>
                  <div className={styles.thinking} aria-label="正在思考"><i /><i /><i /></div>
                </div>
              )}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className={styles.composerArea}>
          {error && <p className={styles.error} role="alert">回答暂时没有生成，请稍后再试。</p>}
          <div className={styles.composer}>
            <textarea
              ref={textareaRef}
              value={input}
              maxLength={1000}
              rows={1}
              placeholder="向 SafeAgent 提问，输入具体话术或链接会更准确"
              aria-label="输入反诈问题"
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
            {busy ? (
              <button className={styles.stopButton} type="button" onClick={() => void stop()} aria-label="停止生成">
                <Stop size={17} weight="fill" />
              </button>
            ) : (
              <button className={styles.sendButton} type="button" disabled={!input.trim()} onClick={() => submit()} aria-label="发送消息">
                <ArrowUp size={19} weight="bold" />
              </button>
            )}
          </div>
          <p className={styles.composerHint}>Enter 发送，Shift + Enter 换行 · 请勿输入银行卡号、验证码等敏感信息</p>
        </div>
      </section>
    </div>
  );
}
