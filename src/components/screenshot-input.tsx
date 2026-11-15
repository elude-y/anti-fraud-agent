"use client";

import { ArrowsClockwise, FrameCorners, ImageSquare, Scan, Sparkle, UploadSimple, X } from "@phosphor-icons/react";
import { useEffect, useId, useRef, useState } from "react";
import { isScreenshotMime, MAX_SCREENSHOT_BYTES, readScreenshot, type ScreenshotReading } from "@/lib/screenshot-image";
import { createScreenshotRecognizer } from "@/lib/screenshot-ocr";
import styles from "@/app/workspace.module.css";
import screenshot from "./screenshot-input.module.css";

type Source = "local" | "vision";

async function recognizeWithVision(image: Blob, signal: AbortSignal): Promise<ScreenshotReading> {
  const response = await fetch("/api/analyze/screenshot", {
    method: "POST",
    headers: { "Content-Type": image.type },
    body: image,
    signal,
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.message ?? (response.status === 413
    ? "上传片段超出服务限制，请先裁切截图。"
    : "视觉模型未能完成识别，可以改用本机 OCR。"));
  if (typeof data?.text !== "string" || !Array.isArray(data.clues)) {
    throw new Error("视觉模型返回格式异常，可以改用本机 OCR。");
  }
  return data;
}

function sizeLabel(bytes: number) {
  return bytes < 1024 * 1024 ? Math.max(1, Math.round(bytes / 1024)) + " KB"
    : (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export default function ScreenshotInput({ onText, disabled }: {
  onText: (text: string) => void;
  disabled: boolean;
}) {
  const titleId = useId();
  const hintId = useId();
  const [selection, setSelection] = useState<{ file: File; preview: string } | null>(null);
  const [reading, setReading] = useState<(ScreenshotReading & { source: Source }) | null>(null);
  const [progress, setProgress] = useState<{ source: Source; index: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef<AbortController | null>(null);

  useEffect(() => () => pending.current?.abort(), []);
  useEffect(() => () => { if (selection) URL.revokeObjectURL(selection.preview); }, [selection]);

  const locked = disabled || Boolean(progress);

  function selectFile(file: File | undefined) {
    if (!file || locked) return;
    if (!isScreenshotMime(file.type) || file.size === 0 || file.size > MAX_SCREENSHOT_BYTES) {
      setError("请选择 32 MB 以内的 PNG 或 JPEG 截图。");
      return;
    }
    setSelection({ file, preview: URL.createObjectURL(file) });
    setReading(null);
    setError("");
  }

  async function recognize(source: Source) {
    if (!selection || locked || pending.current) return;
    const controller = new AbortController();
    pending.current = controller;
    setProgress({ source, index: 0, total: 0 });
    setError("");
    setReading(null);
    let localReader: Awaited<ReturnType<typeof createScreenshotRecognizer>> | undefined;
    try {
      const result = await readScreenshot(selection.file, controller.signal,
        async (part) => {
          if (source === "vision") return recognizeWithVision(part, controller.signal);
          localReader ??= await createScreenshotRecognizer(controller.signal);
          return localReader.read(part);
        },
        (index, total) => setProgress({ source, index, total }));
      controller.signal.throwIfAborted();
      if (!result.text && !result.clues.length) {
        throw new Error("未识别到文字或线索。请裁切到聊天区域，或手动输入文字。");
      }
      if (result.text) onText(result.text.slice(0, 500));
      setReading({ ...result, source });
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "截图识别失败，请重试。");
    } finally {
      await localReader?.close().catch(() => undefined);
      pending.current = null;
      if (!controller.signal.aborted) setProgress(null);
    }
  }

  return (
    <section className={screenshot.card} aria-labelledby={titleId}>
      <div className={screenshot.header}>
        <span className={screenshot.icon}><FrameCorners size={21} weight="duotone" /></span>
        <div>
          <h3 id={titleId}>截图研判</h3>
          <p id={hintId}>识别聊天截图或短信图片。空白区域会自动跳过，长截图按内容分段。</p>
        </div>
      </div>

      <label className={screenshot.dropzone} data-dragging={dragging} data-disabled={locked}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = locked ? "none" : "copy";
          if (!locked) setDragging(true);
        }}
        onDragLeave={(event) => {
          if (!(event.relatedTarget instanceof Node) || !event.currentTarget.contains(event.relatedTarget)) setDragging(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          selectFile(event.dataTransfer.files[0]);
        }}>
        <input className={screenshot.fileInput} type="file" accept="image/png,image/jpeg" disabled={locked}
          aria-describedby={hintId} onChange={(event) => {
            selectFile(event.target.files?.[0]);
            event.currentTarget.value = "";
          }} />
        <span className={screenshot.dropIcon}><UploadSimple size={19} weight="bold" /></span>
        <span className={screenshot.dropText}>
          <strong>{selection ? "更换截图" : "选择或拖入截图"}</strong>
          <small>PNG / JPEG · 单张最大 32 MB</small>
        </span>
      </label>

      {selection && (
        <>
          <div className={screenshot.fileRow}>
            <ImageSquare size={17} aria-hidden="true" />
            <span className={screenshot.fileName} title={selection.file.name}>{selection.file.name}</span>
            <span className={screenshot.fileSize}>{sizeLabel(selection.file.size)}</span>
            <button type="button" className={screenshot.remove} disabled={locked} aria-label="移除截图"
              onClick={() => { setSelection(null); setReading(null); setError(""); }}>
              <X size={16} />
            </button>
          </div>
          <div className={screenshot.previewScroll} tabIndex={0} role="region" aria-label="原图预览，可滚动查看">
            <figure className={screenshot.preview}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={selection.preview} alt="待研判截图" />
              {reading?.clues.map((clue, index) => (
                <span className={screenshot.clue} key={index} aria-hidden="true" style={{
                  left: clue.x * 100 + "%", top: clue.y * 100 + "%",
                  width: clue.width * 100 + "%", height: clue.height * 100 + "%",
                }}><span>{index + 1}</span></span>
              ))}
            </figure>
          </div>
          <div className={screenshot.actions}>
            <button type="button" className={styles.secondaryButton} disabled={locked} onClick={() => void recognize("local")}>
              <Scan size={17} />本机识别文字
            </button>
            <button type="button" className={styles.primaryButton} disabled={locked} onClick={() => void recognize("vision")}>
              <Sparkle size={17} weight="fill" />使用视觉模型
            </button>
          </div>
        </>
      )}

      {!selection && (
        <div className={screenshot.previewEmpty}>
          <span><ImageSquare size={30} weight="duotone" /></span>
          <strong>截图预览区</strong>
          <small>上传后在这里查看原图、分段进度和风险标注</small>
        </div>
      )}

      <p className={screenshot.note}>本机识别时图片留在浏览器。使用视觉模型前，请遮盖敏感信息。</p>
      {progress && <p role="status" className={screenshot.status}>
        <ArrowsClockwise className={styles.spinning} size={17} />
        {progress.total ? (progress.source === "local" ? "本机识别" : "视觉识别") + " " + progress.index + "/" + progress.total : "正在准备图片…"}
      </p>}
      {error && <p role="alert" className={screenshot.error}>{error}</p>}
      {reading && (
        <div className={screenshot.reading}>
          <p role="status">{reading.text ? "识别完成。请核对输入框中的文字和链接，再启动研判。" : "已标注可见线索。请手动填写需要研判的文字。"}
            {reading.truncated && " 部分分段可能还有未转录的内容，请对照原图。"}
          </p>
          {reading.text.length > 500 && (
            <details>
              <summary>查看完整转录（输入框已填前 500 字）</summary>
              <textarea aria-label="截图完整转录" className={screenshot.transcript} value={reading.text} readOnly rows={5} />
            </details>
          )}
          {reading.clues.length > 0 && <ol>{reading.clues.map((clue, index) => <li key={index}>{clue.label}</li>)}</ol>}
        </div>
      )}
    </section>
  );
}
