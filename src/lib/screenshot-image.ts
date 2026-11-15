export const MAX_SCREENSHOT_BYTES = 32 * 1024 * 1024;
export const MAX_VISION_UPLOAD_BYTES = 2 * 1024 * 1024;
const MAX_PIXELS = 48_000_000;
const MAX_TILE_EDGE = 1920;
const MAX_TILES = 6;

export interface ScreenshotClue {
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotReading {
  text: string;
  clues: ScreenshotClue[];
  truncated?: boolean;
}

export function isScreenshotMime(mime: string) {
  return mime === "image/png" || mime === "image/jpeg";
}

type Rectangle = { x: number; y: number; width: number; height: number };
type ContentBand = { start: number; end: number };

function rectangles(width: number, height: number): Rectangle[] {
  const vertical = height >= width;
  const long = Math.max(width, height);
  const short = Math.min(width, height);
  const target = Math.max(MAX_TILE_EDGE, Math.round(short * 1.8));
  if (long <= target) return [{ x: 0, y: 0, width, height }];

  const overlap = Math.min(120, Math.round(short * 0.1));
  const count = Math.ceil((long - overlap) / (target - overlap));
  if (count > MAX_TILES) throw new Error("截图过长，请裁成几张较短的图后分别识别。");
  const step = Math.ceil((long - overlap) / count);
  return Array.from({ length: count }, (_, index) => {
    const start = index * step;
    const length = Math.min(long - start, step + overlap);
    return vertical ? { x: 0, y: start, width, height: length }
      : { x: start, y: 0, width: length, height };
  });
}

function bandRectangles(width: number, band: ContentBand): Rectangle[] {
  const length = band.end - band.start;
  const target = MAX_TILE_EDGE;
  if (length <= target) return [{ x: 0, y: band.start, width, height: length }];
  const overlap = Math.min(120, Math.round(width * 0.08));
  const count = Math.ceil((length - overlap) / (target - overlap));
  const step = Math.ceil((length - overlap) / count);
  return Array.from({ length: count }, (_, index) => {
    const start = band.start + index * step;
    return { x: 0, y: start, width, height: Math.min(band.end - start, step + overlap) };
  });
}

async function contentBands(bitmap: ImageBitmap, signal: AbortSignal): Promise<ContentBand[]> {
  const { width, height } = bitmap;
  const sampleWidth = Math.min(360, width);
  const sampleHeight = Math.max(1, Math.min(6000, Math.round(height * sampleWidth / width)));
  const canvas = document.createElement("canvas");
  canvas.width = sampleWidth;
  canvas.height = sampleHeight;
  try {
    const context = canvas.getContext("2d", { alpha: false, willReadFrequently: true });
    if (!context) throw new Error("浏览器无法分析这张图片。");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, sampleWidth, sampleHeight);
    context.drawImage(bitmap, 0, 0, sampleWidth, sampleHeight);
    signal.throwIfAborted();
    const pixels = context.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const left = Math.max(1, Math.floor(sampleWidth * 0.035));
    const right = Math.min(sampleWidth - 1, Math.ceil(sampleWidth * 0.965));
    const threshold = Math.max(2, Math.round((right - left) * 0.003));
    const activeRows = new Uint8Array(sampleHeight);
    for (let y = 0; y < sampleHeight; y++) {
      let count = 0;
      for (let x = left; x < right; x++) {
        const offset = (y * sampleWidth + x) * 4;
        const red = pixels[offset];
        const green = pixels[offset + 1];
        const blue = pixels[offset + 2];
        const alpha = pixels[offset + 3];
        if (alpha < 16) continue;
        const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
        const spread = Math.max(red, green, blue) - Math.min(red, green, blue);
        if (luminance < 238 || spread > 18) count++;
        if (count >= threshold) {
          activeRows[y] = 1;
          break;
        }
      }
    }

    const scaleY = height / sampleHeight;
    const gapTolerance = Math.max(8, Math.round(48 * sampleHeight / height));
    const bands: ContentBand[] = [];
    let start = -1;
    let last = -1;
    for (let y = 0; y < sampleHeight; y++) {
      if (activeRows[y]) {
        if (start < 0) start = y;
        last = y;
      } else if (start >= 0 && y - last > gapTolerance) {
        bands.push({
          start: Math.max(0, Math.floor(start * scaleY) - 18),
          end: Math.min(height, Math.ceil((last + 1) * scaleY) + 18),
        });
        start = -1;
        last = -1;
      }
    }
    if (start >= 0) {
      bands.push({
        start: Math.max(0, Math.floor(start * scaleY) - 18),
        end: Math.min(height, Math.ceil((last + 1) * scaleY) + 18),
      });
    }
    return bands;
  } finally {
    canvas.width = canvas.height = 0;
  }
}

async function screenshotRectangles(bitmap: ImageBitmap, signal: AbortSignal): Promise<Rectangle[]> {
  const { width, height } = bitmap;
  if (height < width) return rectangles(width, height);
  const bands = await contentBands(bitmap, signal);
  if (!bands.length) throw new Error("截图中没有检测到有效内容，可能是一张空白图。");

  const merged = [...bands];
  const estimateTiles = () => merged.reduce((total, band) => total + Math.max(1, Math.ceil((band.end - band.start) / MAX_TILE_EDGE)), 0);
  while (merged.length > 1 && estimateTiles() > MAX_TILES) {
    let mergeIndex = 0;
    let smallestGap = Number.POSITIVE_INFINITY;
    for (let index = 0; index < merged.length - 1; index++) {
      const gap = merged[index + 1].start - merged[index].end;
      if (gap < smallestGap) {
        smallestGap = gap;
        mergeIndex = index;
      }
    }
    merged.splice(mergeIndex, 2, { start: merged[mergeIndex].start, end: merged[mergeIndex + 1].end });
  }

  const tiles = merged.flatMap((band) => bandRectangles(width, band));
  if (tiles.length > MAX_TILES) throw new Error("截图中的有效内容过于分散，请裁成几张较短的图后分别识别。");
  return tiles;
}

function encode(canvas: HTMLCanvasElement, mime: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("图片处理失败，请重新选择截图。")), mime, quality);
  });
}

async function encodeTile(bitmap: ImageBitmap, rect: Rectangle, signal: AbortSignal) {
  const canvas = document.createElement("canvas");
  let scale = Math.min(1, MAX_TILE_EDGE / Math.max(rect.width, rect.height));
  try {
    for (let attempt = 0; attempt < 4; attempt++) {
      signal.throwIfAborted();
      canvas.width = Math.max(1, Math.round(rect.width * scale));
      canvas.height = Math.max(1, Math.round(rect.height * scale));
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("浏览器无法处理此图片。");
      context.fillStyle = "#fff";
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, rect.x, rect.y, rect.width, rect.height, 0, 0, canvas.width, canvas.height);

      if (attempt === 0) {
        const png = await encode(canvas, "image/png");
        if (png.size <= 768 * 1024) return png;
      }
      const jpeg = await encode(canvas, "image/jpeg", attempt === 0 ? 0.9 : 0.8);
      if (jpeg.size <= MAX_VISION_UPLOAD_BYTES) return jpeg;
      scale *= 0.8;
    }
    throw new Error("图片压缩后仍超过上传上限，请裁切后重试。");
  } finally {
    canvas.width = canvas.height = 0;
  }
}

function appendText(existing: string, next: string) {
  const before = existing.split("\n");
  const after = next.split("\n");
  for (let count = Math.min(before.length, after.length, 12); count > 0; count--) {
    const left = before.slice(-count).map((line) => line.trim()).join("\n");
    const right = after.slice(0, count).map((line) => line.trim()).join("\n");
    if (left && left === right) return [...before, ...after.slice(count)].join("\n");
  }
  return [existing, next].filter(Boolean).join("\n");
}

export async function readScreenshot(
  file: File,
  signal: AbortSignal,
  read: (part: Blob) => Promise<ScreenshotReading>,
  onProgress: (index: number, total: number) => void,
): Promise<ScreenshotReading> {
  if (!isScreenshotMime(file.type) || !file.size || file.size > MAX_SCREENSHOT_BYTES) {
    throw new Error("请选择 32 MB 以内的 PNG 或 JPEG 截图。");
  }
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("无法打开这张图片，请重新导出为 PNG 或 JPEG。");
  });
  try {
    const { width, height } = bitmap;
    if (width * height > MAX_PIXELS) throw new Error("截图超过 4800 万像素，请先裁切。");
    const tiles = await screenshotRectangles(bitmap, signal);
    let text = "";
    let truncated = false;
    const clues: ScreenshotClue[] = [];
    for (const [index, tile] of tiles.entries()) {
      signal.throwIfAborted();
      onProgress(index + 1, tiles.length);
      const image = await encodeTile(bitmap, tile, signal);
      signal.throwIfAborted();
      const result = await read(image);
      text = appendText(text, result.text.trim());
      truncated ||= Boolean(result.truncated);
      for (const clue of result.clues) {
        const mapped = {
          label: clue.label,
          x: (tile.x + clue.x * tile.width) / width,
          y: (tile.y + clue.y * tile.height) / height,
          width: Math.min(clue.width, 1 - clue.x) * tile.width / width,
          height: Math.min(clue.height, 1 - clue.y) * tile.height / height,
        };
        if (!clues.some((previous) => previous.label === mapped.label
          && Math.abs(previous.x - mapped.x) < 0.012 && Math.abs(previous.y - mapped.y) < 0.012)) clues.push(mapped);
      }
    }
    return { text, clues: clues.slice(0, 18), truncated };
  } finally {
    bitmap.close();
  }
}