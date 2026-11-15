"use client";

import { useEffect, useRef, useState } from "react";
import { recognizeScreenshot } from "@/lib/screenshot-ocr";
import styles from "@/app/workspace.module.css";

interface ScreenshotClue {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export default function ScreenshotInput({ onText, disabled }: {
  onText: (text: string) => void;
  disabled: boolean;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState("");
  const [clues, setClues] = useState<ScreenshotClue[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [recognized, setRecognized] = useState<"local" | "vision" | null>(null);
  const [truncated, setTruncated] = useState(false);

  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  async function recognize(source: "local" | "vision") {
    if (!file || busy) return;
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setClues([]);
    setRecognized(null);
    setTruncated(false);
    try {
      if (source === "local") {
        const result = await recognizeScreenshot(file, controller.signal);
        if (controller.signal.aborted) return;
        setClues(result.clues);
        onText(result.text);
        setTruncated(result.truncated);
        setRecognized(source);
        return;
      }
      const response = await fetch("/api/analyze/screenshot", {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "截图识别失败");
      if (controller.signal.aborted) return;
      setClues(data.clues);
      onText(data.text);
      setRecognized(source);
    } catch (caught) {
      if (controller.signal.aborted) return;
      setError(caught instanceof Error ? caught.message : "截图识别失败");
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      pending.current = null;
    }
  }

  return (
    <div className={styles.screenshotControl}>
      <label>
        截图研判
        <input type="file" accept="image/png,image/jpeg" disabled={busy || disabled} onChange={(event) => {
          const selected = event.target.files?.[0] ?? null;
          setClues([]);
          setRecognized(null);
          setTruncated(false);
          const invalid = selected && (!["image/png", "image/jpeg"].includes(selected.type) || selected.size > 2 * 1024 * 1024);
          setFile(invalid ? null : selected);
          setPreview(!invalid && selected ? URL.createObjectURL(selected) : "");
          setError(invalid ? "请选择 2 MB 以内的 PNG 或 JPEG。" : "");
        }} />
      </label>
      <p>本机识别在浏览器内处理图片。使用视觉模型前，请遮盖账号、验证码等敏感信息。</p>
      {preview && file && (
        <figure className={styles.screenshotPreview}>
          {/* The browser displays a local object URL without sending it to an image optimizer. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={preview} alt="待研判截图预览" />
          {clues.map((clue, index) => (
            <span className={styles.screenshotClue} key={index} aria-hidden="true" style={{
              left: clue.x * 100 + "%", top: clue.y * 100 + "%",
              width: clue.width * 100 + "%", height: clue.height * 100 + "%",
            }}>{index + 1}</span>
          ))}
        </figure>
      )}
      {file && (
        <div className={styles.sampleRow}>
          <button type="button" disabled={busy || disabled} onClick={() => void recognize("local")}>本机识别文字</button>
          <button type="button" disabled={busy || disabled} onClick={() => void recognize("vision")}>使用视觉模型</button>
        </div>
      )}
      {busy && <p role="status">正在识别截图…</p>}
      {recognized && <p role="status">
        {recognized === "local" ? "已用本机 OCR 提取文字并标注关键词行。" : "已用视觉模型转录并标注可见线索。"}
        {truncated && " 已填入前 500 字，请保留需要研判的段落。"}
        {" 请核对输入框中的文字和链接，再启动研判。"}
      </p>}
      {clues.length > 0 && <ol>{clues.map((clue, index) => <li key={index}>{clue.label}</li>)}</ol>}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
