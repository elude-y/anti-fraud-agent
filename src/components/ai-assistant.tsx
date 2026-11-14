"use client";

import { useChat } from "@ai-sdk/react";
import {
  ArrowUp,
  BookOpenText,
  CaretDown,
  ChatCircleDots,
  Check,
  Copy,
  MagnifyingGlass,
  Plus,
  ShieldCheck,
  Sparkle,
  Stop,
  Trash,
} from "@phosphor-icons/react";
import { DefaultChatTransport } from "ai";
import { useEffect, useRef, useState } from "react";
import styles from "./ai-assistant.module.css";

const transport = new DefaultChatTransport({ api: "/api/assistant" });
const storageKey = "safeagent:assistant-conversations";

interface Conversation {
  id: string;
  title: string;
  messages: unknown[];
  updatedAt: number;
}

const suggestions = [
  "收到 ETC 停用短信让我点链接认证，是真的吗？",
  "陌生客服索要验证码，我该怎么办？",
  "我已经点了链接还填了手机号，现在怎么办？",
  "怎么判断一个网站是不是官方网站？",
] as const;

const EXPERT_OPTIONS = [
  { id: "fraud-analyst", name: "反诈研判专家", hint: "识别类型·判风险·拆套路" },
] as const;

function textFromParts(parts: Array<{ type: string; text?: string }>) {
  return parts
    .filter((part) => part.type === "text" && part.text)
    .map((part) => part.text)
    .join("\n");
}

function conversationTitle(messages: Array<{ role: string; parts: Array<{ type: string; text?: string }> }>) {
  const firstUser = messages.find((m) => m.role === "user");
  if (!firstUser) return "新对话";
  const text = textFromParts(firstUser.parts).replace(/\s+/g, " ").trim();
  return text ? text.slice(0, 18) : "新对话";
}

export default function AiAssistant() {
  const [input, setInput] = useState("");
  const [restored, setRestored] = useState(false);
  const [copiedId, setCopiedId] = useState("");
  const [expert, setExpert] = useState<string | null>(null);
  const [expertOpen, setExpertOpen] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentId, setCurrentId] = useState("");
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
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as Conversation[];
      if (Array.isArray(saved) && saved.length > 0) {
        setConversations(saved);
        setCurrentId(saved[0].id);
        setMessages(saved[0].messages as never);
      } else {
        setCurrentId(crypto.randomUUID());
      }
    } catch {
      localStorage.removeItem(storageKey);
      setCurrentId(crypto.randomUUID());
    } finally {
      setRestored(true);
    }
  }, [setMessages]);

  useEffect(() => {
    if (!restored) return;
    localStorage.setItem(storageKey, JSON.stringify(conversations));
  }, [conversations, restored]);

  useEffect(() => {
    if (!restored || !currentId) return;
    const title = conversationTitle(messages);
    setConversations((prev) => {
      const conv: Conversation = { id: currentId, title, messages: messages.slice(-30), updatedAt: Date.now() };
      const next = prev.filter((c) => c.id !== currentId);
      next.unshift(conv);
      return next;
    });
  }, [messages, restored, currentId]);

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
    void sendMessage({ text: question }, { body: { expert } });
    setInput("");
  };

  const newConversation = () => {
    if (busy) void stop();
    clearError();
    setMessages([]);
    setInput("");
    setCurrentId(crypto.randomUUID());
    window.setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const switchConversation = (id: string) => {
    if (id === currentId) return;
    if (busy) void stop();
    clearError();
    const conv = conversations.find((c) => c.id === id);
    if (!conv) return;
    setCurrentId(id);
    setMessages(conv.messages as never);
    setInput("");
  };

  const deleteConversation = (id: string) => {
    if (busy && id === currentId) void stop();
    const rest = conversations.filter((c) => c.id !== id);
    setConversations(rest);
    if (id === currentId) {
      if (rest.length > 0) {
        setCurrentId(rest[0].id);
        setMessages(rest[0].messages as never);
      } else {
        setCurrentId(crypto.randomUUID());
        setMessages([]);
      }
      setInput("");
    }
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
          <div>
            <strong>AI 助手</strong>
            <small>反诈问答与风险咨询</small>
          </div>
        </div>

        <button className={styles.newChat} type="button" onClick={newConversation}>
          <Plus size={17} weight="bold" />新对话
        </button>

        {conversations.length > 0 && (
          <nav className={styles.conversationList} aria-label="历史对话">
            {conversations.map((conv) => (
              <div key={conv.id} className={conv.id === currentId ? `${styles.conversationItem} ${styles.conversationActive}` : styles.conversationItem}>
                <button type="button" className={styles.conversationButton} onClick={() => switchConversation(conv.id)}>
                  {conv.title || "新对话"}
                </button>
                <button type="button" className={styles.conversationDelete} onClick={() => deleteConversation(conv.id)} aria-label="删除对话">
                  <Trash size={13} />
                </button>
              </div>
            ))}
          </nav>
        )}

        <div className={styles.sideInfo}>
          <div><BookOpenText size={18} /><span><strong>案例库检索</strong><small>自动匹配真实反诈案例</small></span></div>
          <div><MagnifyingGlass size={18} /><span><strong>动态验证</strong><small>提供链接时自动沙箱检测</small></span></div>
          <div><ShieldCheck size={18} /><span><strong>安全优先</strong><small>提供核实与处置建议</small></span></div>
        </div>

        <p className={styles.sideNote}>回答用于风险提示，不能替代警方、银行或相关平台的正式认定。</p>
      </aside>

      <section className={styles.chatPanel} aria-label="SafeAgent AI 助手对话">
        <header className={styles.chatHeader}>
          <div>
            <span className={styles.onlineDot} />
            <strong>SafeAgent AI 助手</strong>
            <small>案例库检索 + 沙箱验证</small>
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
              <p>识别可疑短信、验证陌生链接、拆解诈骗话术；追问"已经填了信息怎么办"我会结合上文继续给处置建议。</p>
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
                        <button className={styles.copyButton} type="button" onClick={() => void copyMessage(message.id, text)} aria-label="复制消息">
                          {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                        </button>
                      )}
                    </div>
                    {!assistant && !busy && (
                      <button className={styles.copyButton} type="button" onClick={() => void copyMessage(message.id, text)} aria-label="复制消息">
                        {copiedId === message.id ? <Check size={14} /> : <Copy size={14} />}
                      </button>
                    )}
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
            <div className={styles.expertPicker}>
              <button
                className={styles.expertTrigger}
                type="button"
                onClick={() => setExpertOpen((v) => !v)}
                aria-haspopup="listbox"
                aria-expanded={expertOpen}
              >
                {expert ? (
                  <><ShieldCheck size={14} weight="fill" />{EXPERT_OPTIONS.find((e) => e.id === expert)?.name}</>
                ) : (
                  <span className={styles.expertPlaceholder}>选择专家</span>
                )}
                <CaretDown size={12} />
              </button>
              {expertOpen && (
                <ul className={styles.expertMenu} role="listbox">
                  <li>
                    <button type="button" className={expert === null ? styles.expertActive : ""} onClick={() => { setExpert(null); setExpertOpen(false); }}>
                      不使用专家
                    </button>
                  </li>
                  {EXPERT_OPTIONS.map((opt) => (
                    <li key={opt.id}>
                      <button type="button" className={expert === opt.id ? styles.expertActive : ""} onClick={() => { setExpert(opt.id); setExpertOpen(false); }}>
                        <span className={styles.expertName}>{opt.name}</span>
                        <span className={styles.expertHint}>{opt.hint}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className={styles.composerRow}>
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
          </div>
          <p className={styles.composerHint}>Enter 发送，Shift + Enter 换行 · 请勿输入银行卡号、验证码等敏感信息</p>
        </div>
      </section>
    </div>
  );
}
