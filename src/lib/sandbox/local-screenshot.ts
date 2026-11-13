import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, rm, unlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { getExternalAnalysisSkipReason } from "./url-utils";

const chromeCandidates = process.platform === "win32"
  ? [
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  ]
  : ["/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"];

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function screenshotDirectory() {
  return path.join(process.cwd(), "public", "generated-screenshots");
}

export async function clearGeneratedScreenshots() {
  const directory = screenshotDirectory();
  await clearPreviousScreenshots(directory);
}

async function clearPreviousScreenshots(directory: string) {
  try {
    const entries = await readdir(directory);
    await Promise.all(entries
      .filter((entry) => entry.endsWith(".png"))
      .map((entry) => unlink(path.join(directory, entry)).catch(() => undefined)));
  } catch {
    // Directory may not exist yet.
  }
}

function chromeExecutable() {
  const configured = process.env.CHROME_EXECUTABLE_PATH?.trim();
  if (configured && existsSync(configured)) return configured;
  return chromeCandidates.find(existsSync) ?? null;
}

function isPng(buffer: Buffer) {
  return buffer.length > 1024
    && buffer[0] === 0x89
    && buffer.toString("ascii", 1, 4) === "PNG";
}

interface CdpMessage {
  id?: number;
  result?: unknown;
  error?: { message?: string };
}

function createCdpClient(socketUrl: string) {
  const socket = new WebSocket(socketUrl);
  let sequence = 0;
  const pending = new Map<number, { resolve: (value: unknown) => void; reject: (reason?: unknown) => void }>();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as CdpMessage;
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (!request) return;
    if (message.error) request.reject(new Error(message.error.message ?? "CDP 请求失败"));
    else request.resolve(message.result);
  });

  const ready = new Promise<void>((resolve, reject) => {
    socket.addEventListener("open", () => resolve(), { once: true });
    socket.addEventListener("error", () => reject(new Error("无法连接本地浏览器调试端口")), { once: true });
  });

  return {
    ready,
    send<T>(method: string, params: Record<string, unknown> = {}): Promise<T> {
      const id = ++sequence;
      return new Promise<T>((resolve, reject) => {
        pending.set(id, {
          resolve: (value) => resolve(value as T),
          reject,
        });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function waitForDebugPort(profilePath: string) {
  const activePortFile = path.join(profilePath, "DevToolsActivePort");
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const content = await readFile(activePortFile, "utf8");
      const [port] = content.trim().split(/\r?\n/);
      if (port) return Number(port);
    } catch {
      // Chrome is still starting.
    }
    await delay(150);
  }
  throw new Error("本地浏览器调试端口启动超时");
}

async function runChromeFullPage(executable: string, url: string, outputPath: string, profilePath: string) {
  const child = spawn(executable, [
    "--headless=new",
    "--disable-gpu",
    "--disable-extensions",
    "--disable-sync",
    "--hide-scrollbars",
    "--no-first-run",
    "--no-default-browser-check",
    "--remote-debugging-port=0",
    `--user-data-dir=${profilePath}`,
    "about:blank",
  ], { stdio: "ignore", windowsHide: true });

  let client: ReturnType<typeof createCdpClient> | null = null;
  try {
    const port = await waitForDebugPort(profilePath);
    const targetsResponse = await fetch(`http://127.0.0.1:${port}/json/list`);
    const targets = await targetsResponse.json() as Array<{
      type?: string;
      webSocketDebuggerUrl?: string;
    }>;
    const target = targets.find((item) => item.type === "page" && item.webSocketDebuggerUrl);
    if (!target?.webSocketDebuggerUrl) throw new Error("未找到可用的浏览器页面");

    client = createCdpClient(target.webSocketDebuggerUrl);
    await client.ready;
    await client.send("Page.enable");
    await client.send("Runtime.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1440,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      const state = await client.send<{
        result?: { value?: string };
      }>("Runtime.evaluate", {
        expression: "document.readyState",
        returnByValue: true,
      });
      if (state.result?.value === "complete") break;
      await delay(200);
    }

    await delay(900);
    await client.send("Runtime.evaluate", {
      expression: `(async () => {
        window.scrollTo(0, document.body.scrollHeight);
        await new Promise((resolve) => setTimeout(resolve, 500));
        window.scrollTo(0, 0);
        return true;
      })()`,
      awaitPromise: true,
      returnByValue: true,
    });

    const metrics = await client.send<{
      cssContentSize?: { width?: number; height?: number };
      contentSize?: { width?: number; height?: number };
    }>("Page.getLayoutMetrics");
    const content = metrics.cssContentSize ?? metrics.contentSize;
    const width = Math.max(900, Math.min(1440, Math.ceil(content?.width ?? 1440)));
    const height = Math.max(600, Math.min(7000, Math.ceil(content?.height ?? 1000)));

    const shot = await client.send<{ data?: string }>("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: true,
      clip: { x: 0, y: 0, width, height, scale: 1 },
    });
    if (!shot.data) throw new Error("浏览器没有返回截图数据");
    await writeFile(outputPath, Buffer.from(shot.data, "base64"));
  } finally {
    client?.close();
    child.kill();
  }
}

export async function captureLocalScreenshot(target: URL): Promise<string | null> {
  if (process.env.SAFEAGENT_LOCAL_SCREENSHOT === "0") return null;
  if (!["http:", "https:"].includes(target.protocol)) return null;
  // SSRF 防护：截图前检查目标，不截图 localhost/内网/云元数据地址
  if (getExternalAnalysisSkipReason(target)) return null;

  const executable = chromeExecutable();
  if (!executable) return null;

  const key = createHash("sha256").update(target.toString()).digest("hex").slice(0, 24);
  const relativePath = `/api/sandbox/screenshot?id=${key}`;
  const directory = screenshotDirectory();
  const outputPath = path.join(directory, `${key}.png`);
  const profilePath = path.join(os.tmpdir(), `safeagent-screenshot-${randomUUID()}`);

  try {
    await mkdir(directory, { recursive: true });
    await clearPreviousScreenshots(directory);
    await runChromeFullPage(executable, target.toString(), outputPath, profilePath);
    const bytes = await readFile(outputPath);
    return isPng(bytes) ? relativePath : null;
  } catch {
    return null;
  } finally {
    const resolvedProfile = path.resolve(profilePath);
    const resolvedTemp = path.resolve(os.tmpdir());
    if (resolvedProfile.startsWith(`${resolvedTemp}${path.sep}`)) {
      await rm(resolvedProfile, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}



