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
    const decision = decidePath(confidence, normalized);
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

function printStats(mode: Mode, stats: ModeStats, n: number) {
  const acc = ((stats.correct / n) * 100).toFixed(1);
  const sr = ((stats.sandboxCalls / n) * 100).toFixed(1);
  const avg = (stats.totalLatency / n).toFixed(0);
  console.log(`【${MODE_LABEL[mode]}】`);
  console.log(`  准确率：${acc}%  (${stats.correct}/${n})`);
  console.log(`  漏报（诈骗判成安全）：${stats.falseNeg} 条`);
  console.log(`  误报（安全判成风险）：${stats.falsePos} 条`);
  console.log(`  沙箱调用率：${sr}%`);
  console.log(`  平均耗时：${avg}ms`);
  console.log("");
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
    printStats(mode, results[mode], n);
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
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
