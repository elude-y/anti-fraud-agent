const baseUrl = (process.env.SAFEAGENT_BASE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

function parseEvents(streamText) {
  const events = [];
  for (const line of streamText.split("\n")) {
    if (!line.startsWith("data: ")) continue;
    if (line.slice(6).trim() === "[DONE]") continue;
    events.push(JSON.parse(line.slice(6)));
  }
  return events;
}

async function analyzeWithEvents(input, mode, forceTier0 = true) {
  const response = await fetch(`${baseUrl}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ input, mode, forceTier0 }),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`/api/analyze ${response.status}: ${text}`);
  const events = parseEvents(text);
  const result = events.find((event) => event.type === "data-result")?.data;
  if (!result) throw new Error("流式响应中没有 data-result");
  return { result, events };
}

async function analyze(input, mode, forceTier0 = true) {
  return (await analyzeWithEvents(input, mode, forceTier0)).result;
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
checks.safeWhitelistPriority = safe.summary.includes("安全") && !safe.summary.includes("诈骗");

const meeting = await analyze("明天下午三点开会，请准时参加。", "message");
checks.normalMessage = ["安全", "可疑"].includes(meeting.verdict)
  && !meeting.summary.includes("命中“")
  && meeting.confidence < malicious.confidence;

const bankMessage = await analyze(
  "【工商银行】您的账户需认证，请点击 https://bank-secure-verify.example.cn/login 输入银行卡号和验证码。",
  "message",
);
checks.bankSummary = bankMessage.summary.includes("银行") && !bankMessage.summary.includes("ETC");

const quick = await analyzeWithEvents(
  "骗子冒充快递，说包裹运输破损，要给理赔，不让用官方APP，诱导下载第三方陌生软件办理理赔，窃取手机信息。",
  "message",
);
const quickConfidence = quick.events.find((event) => event.type === "data-evidence" && event.data?.type === "confidence")?.data?.payload?.score;
checks.fastPath = quick.result.path === "fast"
  && quick.result.sandbox === null
  && quick.result.sandboxMeta === null
  && quick.result.evidenceChain.every((node) => node.type !== "sandbox")
  && quick.events.some((event) => event.type === "data-stage" && event.data?.stage === "sandbox" && event.data?.status === "skipped")
  && quick.events.every((event) => event.type !== "data-tool" || event.data?.tool !== "sandbox_analyze")
  && quick.result.confidence === quickConfidence;
checks.confidenceVaries = new Set([malicious.confidence, safe.confidence, meeting.confidence, quick.result.confidence]).size > 2;

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
