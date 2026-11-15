import { mkdir, readFile, writeFile } from "node:fs/promises";
import { z } from "zod";
import { withProviderUsage, type ProviderUsage } from "../src/lib/agent/provider-usage";
import { config } from "dotenv";
import { analyzeRequest, type AnalysisVariant } from "../src/lib/agent/analyze-request";
import type { AnalysisStreamResult } from "../src/lib/contracts";
import { TEST_SET_200, type TestSample } from "./test-set-200";

config({ path: ".env.local" });

const regression: TestSample[] = [
  { input: "反诈提醒：不要向陌生人提供银行卡号和验证码，不要转账到所谓安全账户。", label: "安全" },
  { input: "校园安全课：请勿告知陌生人短信验证码。", label: "安全" },
  { input: "请勿将短信验证码告诉他人。", label: "安全" },
  { input: "不要告诉别人验证码，但为了办理理赔，请把验证码发给我。", label: "诈骗" },
  { input: "快递客服称包裹丢失，让我提供银行卡号和短信验证码领取理赔金", label: "诈骗" },
  { input: "明天下午三点在学校图书馆门口见", label: "安全" },
  { input: "贷款秒到账，无需抵·押", label: "可疑" },
  { input: "https://neutral-review.test/", label: "待核验" },
];

async function analyze(sample: TestSample, variant: AnalysisVariant) {
  const start = performance.now();
  const usage = new Map<ProviderUsage["provider"], ProviderUsage>();
  const response = await withProviderUsage(usage, () => analyzeRequest(new Request("http://localhost/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ input: sample.input, forceTier0: process.env.SAFEAGENT_EVAL_TIER0 === "1" }),
  }), variant));
  if (!response.ok) throw new Error("Analysis HTTP " + response.status);
  const raw = await response.text();
  for (const line of raw.split("\n")) {
    if (!line.startsWith("data: {")) continue;
    const event = JSON.parse(line.slice(6));
    if (event.type === "data-result") {
      return { result: event.data as AnalysisStreamResult, ms: performance.now() - start, usage: [...usage.values()] };
    }
  }
  throw new Error("Missing analysis result");
}

const isRisk = (label: TestSample["label"]) => label !== "安全" && label !== "待核验";
const ratio = (value: number, total: number) => total ? Number((value / total).toFixed(4)) : null;

const nonnegativeRate = z.number().finite().nonnegative();
const rateCard = z.object({
  currency: z.string().min(1).max(10),
  providers: z.partialRecord(z.enum(["chat", "embedding", "virustotal", "urlscan"]), z.object({
    perRequest: nonnegativeRate.optional(),
    perMillionInputTokens: nonnegativeRate.optional(),
    perMillionOutputTokens: nonnegativeRate.optional(),
  }).refine((rate) => rate.perRequest !== undefined || rate.perMillionInputTokens !== undefined
    || rate.perMillionOutputTokens !== undefined)),
});

function estimateCost(usage: ProviderUsage[], rates?: z.infer<typeof rateCard>) {
  if (!rates) return null;
  let knownCost = 0;
  const unknownProviders: string[] = [];
  for (const entry of usage) {
    const rate = rates.providers[entry.provider];
    if (!rate || (entry.requests !== entry.metered &&
      (rate.perMillionInputTokens !== undefined || rate.perMillionOutputTokens !== undefined))) {
      unknownProviders.push(entry.provider);
      continue;
    }
    knownCost += entry.requests * (rate.perRequest ?? 0)
      + entry.inputTokens * (rate.perMillionInputTokens ?? 0) / 1_000_000
      + entry.outputTokens * (rate.perMillionOutputTokens ?? 0) / 1_000_000;
  }
  return { currency: rates.currency, knownCost: Number(knownCost.toFixed(8)), unknownProviders };
}

async function evaluate(samples: TestSample[], variant: AnalysisVariant, rates?: z.infer<typeof rateCard>) {
  let tp = 0, fp = 0, tn = 0, fn = 0, pending = 0, expectedPending = 0, pendingRisk = 0, errors = 0;
  const latency: number[] = [];
  const sandboxSources: Record<string, number> = {};
  const providers = new Map<ProviderUsage["provider"], ProviderUsage>();
  const failures: Array<{ sample: number; expected: string; actual: string }> = [];
  for (const [index, sample] of samples.entries()) {
    try {
      const { result, ms, usage } = await analyze(sample, variant);
      for (const item of usage) {
        const total = providers.get(item.provider) ?? { provider: item.provider, requests: 0, metered: 0, inputTokens: 0, outputTokens: 0 };
        total.requests += item.requests;
        total.metered += item.metered;
        total.inputTokens += item.inputTokens;
        total.outputTokens += item.outputTokens;
        providers.set(item.provider, total);
      }
      latency.push(ms);
      const source = result.sandboxMeta?.source ?? "none";
      sandboxSources[source] = (sandboxSources[source] ?? 0) + 1;
      if (result.verdict === "待核验") {
        pending++;
        if (sample.label === "待核验") expectedPending++;
        if (isRisk(sample.label)) pendingRisk++;
      } else if (sample.label !== "待核验") {
        if (isRisk(result.verdict)) {
          if (isRisk(sample.label)) tp++; else fp++;
        } else if (isRisk(sample.label)) fn++; else tn++;
      }
      const matches = sample.label === "待核验"
        ? result.verdict === sample.label
        : result.verdict !== "待核验" && isRisk(result.verdict) === isRisk(sample.label);
      if (!matches) failures.push({ sample: index + 1, expected: sample.label, actual: result.verdict });
    } catch {
      errors++;
      failures.push({ sample: index + 1, expected: sample.label, actual: "error" });
    }
  }
  latency.sort((a, b) => a - b);
  const risky = samples.filter((s) => isRisk(s.label)).length;
  return {
    total: samples.length, tp, fp, tn, fn, pending, expectedPending, pendingRisk, errors,
    accuracy: ratio(tp + tn + expectedPending, samples.length),
    precision: ratio(tp, tp + fp),
    recall: ratio(tp, risky),
    coverage: ratio(samples.length - pending - errors, samples.length),
    p50Ms: latency.length ? Math.round(latency[Math.ceil(latency.length * .5) - 1]) : null,
    p95Ms: latency.length ? Math.round(latency[Math.ceil(latency.length * .95) - 1]) : null,
    falsePositiveRate: ratio(fp, samples.filter((sample) => sample.label === "安全").length),
    missedRiskRate: ratio(risky - tp, risky),
    sandboxSources, providerUsage: [...providers.values()], estimatedCost: estimateCost([...providers.values()], rates), failures,
  };
}

async function main() {
  const variants = ["rule-only", "rule-rag", "full"] as const;
  const groups: Record<string, TestSample[]> = process.argv.includes("--regression")
    ? { regression }
    : { synthetic: TEST_SET_200, regression };
  const datasetFlag = process.argv.indexOf("--dataset");
  if (datasetFlag !== -1) {
    const path = process.argv[datasetFlag + 1];
    if (!path || path.startsWith("--")) throw new Error("请在 --dataset 后填写已脱敏 JSON 文件的路径。");
    const schema = z.array(z.object({
      input: z.string().trim().min(1).max(500),
      label: z.enum(["安全", "待核验", "可疑", "高危", "诈骗"]),
    })).min(1);
    const holdout = schema.parse(JSON.parse(await readFile(path, "utf8")));
    const known = new Set([...TEST_SET_200, ...regression].map((sample) => sample.input.replace(/\s+/g, "")));
    for (const sample of holdout) {
      const key = sample.input.replace(/\s+/g, "");
      if (known.has(key)) throw new Error("独立评测集包含重复样本或已有调参样本。");
      known.add(key);
    }
    groups.holdout = holdout;
  }
  const ratesFlag = process.argv.indexOf("--rates");
  const ratesPath = ratesFlag === -1 ? undefined : process.argv[ratesFlag + 1];
  if (ratesFlag !== -1 && (!ratesPath || ratesPath.startsWith("--"))) throw new Error("请在 --rates 后填写服务单价文件路径。");
  const rates = ratesPath ? rateCard.parse(JSON.parse(await readFile(ratesPath, "utf8"))) : undefined;
  const localReport: Record<string, unknown> = {};
  for (const [name, samples] of Object.entries(groups)) {
    const results: Partial<Record<AnalysisVariant, Awaited<ReturnType<typeof evaluate>>>> = {};
    for (const variant of variants) {
      const metrics = await evaluate(samples, variant, rates);
      results[variant] = metrics;
      console.log(name, variant, "accuracy", metrics.accuracy, "recall", metrics.recall, "pending", metrics.pending, "errors", metrics.errors);
    }
    localReport[name] = results;
  }
  await mkdir(".safeagent-eval", { recursive: true });
  await writeFile(".safeagent-eval/ablation.json", JSON.stringify({
    generatedAt: new Date().toISOString(),
    forceTier0: process.env.SAFEAGENT_EVAL_TIER0 === "1",
    embeddingConfigured: Boolean(process.env.EMBEDDING_API_KEY),
    llmConfigured: Boolean(process.env.DEEPSEEK_API_KEY),
    datasetNote: "合成、回归与外部留出数据分别报告，由提交者注明外部样本来源。风险召回率分母包含待核验及错误的风险样本。",
    costNote: "providerUsage 记录请求次数和供应商返回的 token。estimatedCost 按显式传入的费率估算，未提供费率则为空。",
    results: localReport,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
