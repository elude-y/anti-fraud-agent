const baseUrl = (process.env.SAFEAGENT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

function parseResult(streamText) {
  for (const line of streamText.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    const payload = JSON.parse(line.slice(6));
    if (payload.type === "data-result") return payload.data;
  }
  throw new Error("流式响应中没有 data-result");
}

async function analyze(input, mode, forceTier0 = true) {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, mode, forceTier0 }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`/api/analyze ${response.status}: ${text}`);
  return parseResult(text);
}

async function json(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} ${response.status}: ${JSON.stringify(payload)}`);
  return { payload, headers: response.headers };
}

const checks = {};

const providerStatus = await json("/api/sandbox");
checks.providerStatus = providerStatus.payload.providers?.tier0 === true;

const iocValidation = await fetch(`${baseUrl}/api/check-ioc`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ value: "" }),
});
checks.checkIocValidation = iocValidation.status === 400;

const sandbox = await json("/api/sandbox", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: "https://bank-secure-verify.example.cn/login",
    forceTier0: true,
  }),
});
checks.forceTier0 = sandbox.payload.source === "tier0"
  && sandbox.payload.result?.redirectChain?.length === 3
  && sandbox.payload.result?.formFields?.length > 0;

const unknownSandbox = await json("/api/sandbox", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    url: "https://unknown-service.example/login",
    forceTier0: true,
  }),
});
checks.unknownSnapshot = unknownSandbox.payload.result?.screenshotUrl === "/tier0-unknown-snapshot.png";

const malicious = await analyze("https://bank-secure-verify.example.cn/login", "link");
checks.malicious = malicious.verdict === "诈骗"
  && malicious.sandboxMeta.source === "tier0"
  && malicious.sandbox.formFields.includes("银行卡号")
  && malicious.sandbox.screenshotUrl === "/tier0-bank-snapshot.png"
  && (malicious.sandbox.raw?.screenshotType === "simulated"
    || malicious.sandbox.raw?.behavior?.screenshotType === "simulated");

const safe = await analyze("https://www.gov.cn/zhengce/", "link");
checks.safe = safe.verdict === "安全"
  && safe.sandbox.formFields.length === 0
  && safe.sandbox.redirectChain.length === 1
  && safe.sandbox.screenshotUrl === "/tier0-safe-snapshot.png";

const snapshotResponse = await fetch(`${baseUrl}${sandbox.payload.result.screenshotUrl}`);
checks.snapshotAsset = snapshotResponse.ok
  && snapshotResponse.headers.get("content-type")?.includes("image/png");

const pii = await analyze(
  "客服称订单异常，请联系 13800138000，身份证 11010519491231002X，邮箱 test@example.com 办理退款。",
  "message",
);
checks.piiRedaction = pii.input.includes("[手机号已脱敏]")
  && pii.input.includes("[证件号已脱敏]")
  && pii.input.includes("[邮箱已脱敏]")
  && !pii.input.includes("13800138000")
  && !pii.input.includes("11010519491231002X");
checks.messageOnly = pii.sandbox.finalUrl === "未提取到链接"
  && pii.sandbox.formFields.length === 0
  && pii.sandbox.raw?.template === "message-only";

const cases = await json("/api/cases");
checks.cases = cases.payload.total > 0 && cases.payload.items.length > 0;

const failed = Object.entries(checks).filter(([, value]) => !value).map(([key]) => key);
if (failed.length) throw new Error(`API 冒烟测试失败：${failed.join(", ")}`);

console.log(JSON.stringify({
  ok: true,
  checks,
  providers: providerStatus.payload.providers,
  results: {
    malicious: malicious.verdict,
    safe: safe.verdict,
    message: pii.verdict,
  },
}, null, 2));
