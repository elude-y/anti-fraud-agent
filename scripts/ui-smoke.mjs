import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { spawn } from "node:child_process";

const chromeCandidates = [
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
];
const chrome = chromeCandidates.find(existsSync);

if (!chrome) {
  throw new Error("未找到 Chrome 或 Edge，无法执行 UI 冒烟测试");
}

const port = Number(process.env.UI_DEBUG_PORT ?? 9339);
const baseUrl = (process.env.SAFEAGENT_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
const profile = `${process.env.TEMP ?? "."}\\safeagent-ui-smoke-${process.pid}-${Date.now()}`;
const input = "https://bank-secure-verify.example.cn/login";
const pageUrl = `${baseUrl}/analyze?input=${encodeURIComponent(input)}`;
const artifactsDirectory = new URL("../artifacts/", import.meta.url);
mkdirSync(artifactsDirectory, { recursive: true });
const browser = spawn(chrome, [
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--window-size=1536,1000",
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: "ignore", windowsHide: true });

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForDebugger() {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await delay(250);
  }
  throw new Error("浏览器调试端口未就绪");
}

function createCdpClient(socketUrl) {
  const socket = new WebSocket(socketUrl);
  let sequence = 0;
  const pending = new Map();

  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data));
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });

  const ready = new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });

  return {
    ready,
    send(method, params = {}) {
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    },
    close() {
      socket.close();
    },
  };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    const detail = result.exceptionDetails.exception?.description
      ?? result.exceptionDetails.text
      ?? "未知异常";
    throw new Error(`页面脚本执行失败：${detail}`);
  }
  return result.result.value;
}

try {
  await waitForDebugger();
  const targetResponse = await fetch(
    `http://127.0.0.1:${port}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" },
  );
  const target = await targetResponse.json();
  const client = createCdpClient(target.webSocketDebuggerUrl);
  await client.ready;
  await client.send("Runtime.enable");
  await client.send("Page.enable");
  await client.send("Page.navigate", { url: pageUrl });

  for (let attempt = 0; attempt < 30; attempt += 1) {
    const ready = await evaluate(client, "document.readyState === 'complete'");
    if (ready) break;
    await delay(200);
  }
  let hydrated = false;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    hydrated = await evaluate(client, `(() => {
      const textarea = document.querySelector('textarea');
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.textContent.includes('启动智能研判'));
      return Boolean(textarea?.value.includes('bank-secure-verify') && button && !button.disabled);
    })()`);
    if (hydrated) break;
    await delay(200);
  }
  if (!hydrated) {
    const diagnostic = await evaluate(client, `({
      href: location.href,
      text: document.body?.innerText.slice(0, 500) ?? '',
    })`);
    throw new Error(`页面尚未完成交互水合：${JSON.stringify(diagnostic)}`);
  }

  const clicked = await evaluate(client, `(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent.includes('启动智能研判'));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) {
    const diagnostic = await evaluate(client, `({
      href: location.href,
      text: document.body.innerText.slice(0, 500),
    })`);
    throw new Error(`未找到启动智能研判按钮：${JSON.stringify(diagnostic)}`);
  }

  let state;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    await delay(300);
    state = await evaluate(client, `(() => {
      if (!document.body) return { text: '', saved: 0 };
      let saved = 0;
      try {
        saved = JSON.parse(localStorage.getItem('safeagent:history') || '[]').length;
      } catch {}
      return { text: document.body.innerText, saved };
    })()`);
    if (state.text.includes("研判结论：诈骗") && state.saved > 0) break;
  }

  const checks = {
    verdict: state.text.includes("研判结论：诈骗"),
    evidence: state.text.includes("沙箱行为证据已回传"),
    fallback: state.text.includes("Tier0 离线"),
    history: state.saved > 0,
  };
  const snapshotId = await evaluate(client, `(() => {
    try {
      const history = JSON.parse(localStorage.getItem('safeagent:history') || '[]');
      return history[0]?.snapshotId ?? '';
    } catch {
      return '';
    }
  })()`);
  if (snapshotId) {
    await client.send("Page.navigate", {
      url: `${baseUrl}/analyze?replay=${encodeURIComponent(snapshotId)}`,
    });
    for (let attempt = 0; attempt < 25; attempt += 1) {
      await delay(200);
      const replayText = await evaluate(client, "document.body?.innerText ?? ''");
      if (replayText.includes("已载入 诈骗 研判快照") && replayText.includes("沙箱行为证据已回传")) break;
    }
    const replayText = await evaluate(client, "document.body?.innerText ?? ''");
    checks.replay = replayText.includes("已载入 诈骗 研判快照") && replayText.includes("沙箱行为证据已回传");
  } else {
    checks.replay = false;
  }
  const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
  if (failed.length) throw new Error(`UI 冒烟测试失败：${failed.join(", ")}`);

  const screenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  writeFileSync(
    new URL("../artifacts/review-analysis-result.png", import.meta.url),
    Buffer.from(screenshot.data, "base64"),
  );

  await evaluate(client, `(() => {
    const heading = [...document.querySelectorAll('h2')]
      .find((item) => item.textContent.includes('研判结论'));
    heading?.closest('aside')?.scrollIntoView({ block: 'center' });
    return true;
  })()`);
  await delay(250);
  const conclusionScreenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  writeFileSync(
    new URL("../artifacts/review-analysis-conclusion.png", import.meta.url),
    Buffer.from(conclusionScreenshot.data, "base64"),
  );

  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await client.send("Page.navigate", { url: `${baseUrl}/analyze` });
  await delay(1400);
  const mobileLayout = await evaluate(client, `({
    viewport: document.documentElement.clientWidth,
    content: document.documentElement.scrollWidth,
  })`);
  if (mobileLayout.content > mobileLayout.viewport) {
    throw new Error(`移动端出现横向溢出：${JSON.stringify(mobileLayout)}`);
  }
  const mobileScreenshot = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
  });
  writeFileSync(
    new URL("../artifacts/review-mobile-final.png", import.meta.url),
    Buffer.from(mobileScreenshot.data, "base64"),
  );

  console.log(JSON.stringify({ ok: true, checks, savedHistory: state.saved, mobileLayout }, null, 2));
  client.close();
} finally {
  browser.kill();
}
