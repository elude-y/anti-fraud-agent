export async function createScreenshotRecognizer(signal: AbortSignal) {
  const { createWorker, OEM } = await import("tesseract.js");
  signal.throwIfAborted();
  const assetRoot = new URL("/ocr/", window.location.href).href;
  const worker = await createWorker(["chi_sim", "eng"], OEM.LSTM_ONLY, {
    workerPath: assetRoot + "worker.min.js",
    corePath: assetRoot,
    langPath: assetRoot,
    workerBlobURL: false,
  });
  return {
    close: () => worker.terminate(),
    async read(file: Blob) {
      const bitmap = await createImageBitmap(file);
      const { width, height } = bitmap;
      bitmap.close();
      let stop: (() => void) | undefined;
      try {
        signal.throwIfAborted();
        const aborted = new Promise<never>((_, reject) => {
          stop = () => reject(signal.reason);
          signal.addEventListener("abort", stop, { once: true });
        });
        const { data } = await Promise.race([worker.recognize(file, {}, { blocks: true }), aborted]);
        const compactChinese = (value: string) => value.replace(/(?<=\p{Script=Han})[ \t]+(?=\p{Script=Han})/gu, "");
        const text = compactChinese(data.text).trim();
        const lines = (data.blocks ?? []).flatMap((block) => block.paragraphs.flatMap((paragraph) => paragraph.lines));
        const clues = lines.filter((line) => /转账|汇款|付款|验证码|银行卡|密码|退款|理赔|下载|扫码|https?:/i.test(compactChinese(line.text)))
          .slice(0, 6).map(({ text, bbox }) => ({
            label: compactChinese(text).trim().slice(0, 80),
            x: bbox.x0 / width,
            y: bbox.y0 / height,
            width: (bbox.x1 - bbox.x0) / width,
            height: (bbox.y1 - bbox.y0) / height,
          }));
        return { text, clues };
      } finally {
        if (stop) signal.removeEventListener("abort", stop);
      }
    },
  };
}
