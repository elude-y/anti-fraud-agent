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

/** 上传/识别前压缩：长边压到 1280px、转 JPEG 0.8，减少体积与识别耗时 */
async function compressImage(file: File): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const maxSide = 1280;
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    if (scale >= 1 && file.size <= 512 * 1024) {
      bitmap.close();
      return file;
    }
    const width = Math.round(bitmap.width * scale);
    const height = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("compress failed"))), "image/jpeg", 0.8);
    });
    return new File([blob], file.name.replace(/\.(png|jpe?g)$/i, ".jpg"), { type: "image/jpeg" });
  } catch {
    return file;
  }
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
      const image = await compressImage(file);
      if (source === "local") {
        const result = await recognizeScreenshot(image, controller.signal);
        if (controller.signal.aborted) return;
        setClues(result.clues);
        onText(result.text);
        setTruncated(result.truncated);
        setRecognized(source);
        return;
      }
      const response = await fetch("/api/analyze/screenshot", {
        method: "POST",
        headers: { "Content-Type": image.type },
        body: image,
        signal: controller.signal,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.message ?? "截图识别失败");
      if (controller.signal.aborted) return;
      if (!data.text) {
        setError("没有识别到文字，请换一张清晰截图或手动输入");
        return;
      }
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
