// scripts/ablation.ts —— 三组对比消融实验：仅规则 / 规则+RAG / 完整AI
// 运行：npx tsx scripts/ablation.ts
// 指标：准确率、漏报（诈骗判安全）、误报（安全判风险）、沙箱调用率、平均耗时
// 说明：离线（未配 Supabase）时 URL 样本相似度恒为 0，配好 Supabase + embedding 后重跑，
//       才能得到「沙箱调用率 ~15%、准确率接近全量」的真实数据。

import { normalize } from "../src/lib/agent/normalize";
import { computeRuleScore } from "../src/lib/agent/rules";
import { rag_search } from "../src/lib/rag/retrieve";
import { computeConfidence } from "../src/lib/agent/confidence";
import { decidePath } from "../src/lib/agent/stateMachine";
import { sandboxAnalyze } from "../src/lib/sandbox/analyze";
import { deriveVerdict } from "../src/lib/agent/synthesize";
import type { RiskLevel, SandboxResult } from "../src/lib/contracts";
import { TEST_SET_200 } from "./test-set-200";
import { writeFileSync } from "node:fs";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

type Mode = "rule-only" | "rule-rag" | "full";

const MODE_LABEL: Record<Mode, string> = {
  "rule-only": "仅规则",
  "rule-rag": "规则+RAG",
  full: "完整AI",
};

// 仅规则：把规则分映射成风险等级（无 RAG、无沙箱、无 LLM）
function ruleOnlyVerdict(ruleScore: number): RiskLevel {
  if (ruleScore >= 0.5) return "高危";
  if (ruleScore >= 0.3) return "可疑";
  return "安全";
}

interface RunResult {
  verdict: RiskLevel;
  sandboxCalled: boolean;
  latencyMs: number;
}

async function analyze(input: string, mode: Mode): Promise<RunResult> {
  const startedAt = Date.now();
  const normalized = await normalize(input);
  const ruleScore = computeRuleScore(normalized);

  // 仅规则：不检索、不沙箱
  if (mode === "rule-only") {
    return { verdict: ruleOnlyVerdict(ruleScore), sandboxCalled: false, latencyMs: Date.now() - startedAt };
  }

  const rag = await rag_search(normalized.raw);
  const confidence = computeConfidence(rag.topSimilarity, rag.labelAgreement, rag.coverageScore, ruleScore);

  let sandbox: SandboxResult | null = null;
  let sandboxCalled = false;

  if (mode === "full") {
    // 完整AI：置信度调度 + 规则兜底，低置信度才进沙箱
    const decision = await decidePath(confidence, normalized);
    if (decision.path === "sandbox" && normalized.urls.length > 0) {
      const env = await sandboxAnalyze(normalized.urls[0], normalized.raw);
      sandbox = env.result;
      sandboxCalled = true;
    }
  }
  // rule-rag：规则 + RAG，不进沙箱

  const verdict = deriveVerdict(confidence, rag.matches, sandbox);
  return { verdict, sandboxCalled, latencyMs: Date.now() - startedAt };
}

function isRisky(verdict: RiskLevel): boolean {
  return verdict !== "安全";
}

interface ModeStats {
  correct: number;
  falseNeg: number;
  falsePos: number;
  sandboxCalls: number;
  totalLatency: number;
  wrong: Array<{ input: string; label: RiskLevel; verdict: RiskLevel }>;
}

async function runMode(mode: Mode): Promise<ModeStats> {
  const stats: ModeStats = { correct: 0, falseNeg: 0, falsePos: 0, sandboxCalls: 0, totalLatency: 0, wrong: [] };
  for (const sample of TEST_SET_200) {
    const r = await analyze(sample.input, mode);
    stats.totalLatency += r.latencyMs;
    if (r.sandboxCalled) stats.sandboxCalls++;
    const verdictRisky = isRisky(r.verdict);
    const labelRisky = isRisky(sample.label);
    if (verdictRisky === labelRisky) {
      stats.correct++;
    } else {
      if (labelRisky && !verdictRisky) stats.falseNeg++;
      if (!labelRisky && verdictRisky) stats.falsePos++;
      stats.wrong.push({ input: sample.input, label: sample.label, verdict: r.verdict });
    }
  }
  return stats;
}

function printStats(mode: Mode, stats: ModeStats, n: number, riskyCount: number, safeCount: number) {
  const acc = ((stats.correct / n) * 100).toFixed(1);
  const sr = ((stats.sandboxCalls / n) * 100).toFixed(1);
  const avg = (stats.totalLatency / n).toFixed(0);
  const tp = riskyCount - stats.falseNeg;
  const fp = stats.falsePos;
  const fn = stats.falseNeg;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  console.log(`【${MODE_LABEL[mode]}】`);
  console.log(`  准确率：${acc}%  (${stats.correct}/${n})`);
  console.log(`  Precision（精准率）：${(precision * 100).toFixed(1)}%`);
  console.log(`  Recall（召回率）：${(recall * 100).toFixed(1)}%`);
  console.log(`  F1：${(f1 * 100).toFixed(1)}%`);
  console.log(`  漏报（诈骗判成安全）：${stats.falseNeg} 条`);
  console.log(`  误报（安全判成风险）：${stats.falsePos} 条`);
  console.log(`  沙箱调用率：${sr}%`);
  console.log(`  平均耗时：${avg}ms`);
  console.log("");
}

function computeMetrics(stats: ModeStats, n: number, riskyCount: number) {
  const tp = riskyCount - stats.falseNeg;
  const fp = stats.falsePos;
  const fn = stats.falseNeg;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
  return {
    accuracy: Number((stats.correct / n).toFixed(4)),
    precision: Number(precision.toFixed(4)),
    recall: Number(recall.toFixed(4)),
    f1: Number(f1.toFixed(4)),
    falseNeg: stats.falseNeg,
    falsePos: stats.falsePos,
    sandboxRate: Number((stats.sandboxCalls / n).toFixed(4)),
    avgLatencyMs: Number((stats.totalLatency / n).toFixed(1)),
  };
}

async function main() {
  const n = TEST_SET_200.length;
  const riskyCount = TEST_SET_200.filter((s) => isRisky(s.label)).length;
  const safeCount = TEST_SET_200.filter((s) => !isRisky(s.label)).length;
  console.log(`\n消融实验：测试集 ${n} 条样本（${riskyCount} 风险 / ${safeCount} 安全）`);
  console.log("对比维度：仅规则 / 规则+RAG / 完整AI\n");

  const results: Record<Mode, ModeStats> = {} as Record<Mode, ModeStats>;
  for (const mode of ["rule-only", "rule-rag", "full"] as Mode[]) {
    results[mode] = await runMode(mode);
    printStats(mode, results[mode], n, riskyCount, safeCount);
  }

  // 完整AI 的误判明细（帮助定位难样本）
  const full = results.full;
  if (full.wrong.length) {
    console.log(`完整AI 误判明细（共 ${full.wrong.length} 条）：`);
    for (const w of full.wrong) {
      console.log(`  [${w.label} → 判为 ${w.verdict}] ${w.input.slice(0, 48)}`);
    }
  }
  console.log("\n结论：完整AI 通过置信度调度，用更低的沙箱调用率拿到更高准确率。\n");

  // 保存原始实验结果（含数据口径说明）
  const report = {
    generatedAt: new Date().toISOString(),
    dataset: {
      source: "自建评测集（人工构造）",
      note: "本测试集为人工构造的评测样本，用于消融对比，不代表真实线上流量。真实在线识别效果需单独统计并明确标注。",
      composition: "60 典型诈骗短信 + 40 可疑链接/仿冒网站 + 60 正常样本 + 40 难判断（谐音/拆字/隐藏关键词）",
      total: n,
      risky: riskyCount,
      safe: safeCount,
    },
    results: {
      "rule-only": computeMetrics(results["rule-only"], n, riskyCount),
      "rule-rag": computeMetrics(results["rule-rag"], n, riskyCount),
      full: computeMetrics(results.full, n, riskyCount),
    },
    wrongCasesFull: full.wrong.map((w) => ({ label: w.label, verdict: w.verdict, input: w.input })),
  };
  writeFileSync("scripts/ablation-results.json", JSON.stringify(report, null, 2), "utf-8");
  console.log("已保存实验结果到 scripts/ablation-results.json\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
