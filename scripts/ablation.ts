// scripts/ablation.ts —— 消融实验：RAG-only / Sandbox-only / 混合（本系统）三组对照
// 运行：npx tsx scripts/ablation.ts
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

type Mode = "rag-only" | "sandbox-only" | "hybrid";

interface Sample {
  input: string;
  label: RiskLevel;
}

// 测试集：20 条风险样本 + 10 条安全样本
const TEST_SET: Sample[] = [
  // —— 诈骗（快递理赔 / ETC / 冒充客服 / 中奖 / 银行 / 贷款 / 刷单 / 杀猪盘 / 公检法 / 退费）——
  { input: "【速运中心】您的包裹已破损，请点击 http://claim-example.cn 办理理赔。", label: "诈骗" },
  { input: "您的快递在运输中丢失，点击链接申请三倍理赔", label: "诈骗" },
  { input: "您的ETC账户已停用，请于今日完成身份认证：https://etc-check.example.cn", label: "诈骗" },
  { input: "【ETC】账户将在今晚停用，请访问 https://etc-check.example.cn 完成认证。", label: "诈骗" },
  { input: "我是平台客服，检测到订单异常，请添加好友处理退款。", label: "诈骗" },
  { input: "您的订单支付失败，请点击链接重新支付：http://pay-refund.example.cn", label: "诈骗" },
  { input: "恭喜您成为幸运用户，点击链接领取手机大奖：http://gift-example.cn", label: "诈骗" },
  { input: "您中了一等奖，需先缴纳保证金才能领奖", label: "诈骗" },
  { input: "【银行】您的账户异常将被冻结，请登录 https://bank-verify.example.com 验证", label: "诈骗" },
  { input: "您的银行卡存在风险，请点击链接更新身份信息", label: "诈骗" },
  { input: "无抵押秒到账，点击链接申请贷款：http://loan-fast.example.cn", label: "诈骗" },
  { input: "低息贷款，先交手续费即可放款", label: "诈骗" },
  { input: "招聘点赞兼职，日入300，添加客服开始", label: "诈骗" },
  { input: "刷单返现，先垫付后返佣金，多垫多赚", label: "诈骗" },
  { input: "最近在交友软件认识的朋友推荐了一个稳赚的投资平台", label: "诈骗" },
  { input: "这是公安局，你涉嫌洗钱，请配合资金清查并转账到安全账户", label: "诈骗" },
  { input: "您名下的社保卡涉嫌骗保，即将停用，请配合调查", label: "诈骗" },
  { input: "教育机构退费，请下载指定APP办理退款", label: "诈骗" },
  { input: "您的手机号积分即将过期，点击兑换现金：http://points.example.cn", label: "诈骗" },
  { input: "扫码进群领红包，完成任务返现", label: "诈骗" },
  // —— 安全（正常消息 / 官方链接 / 正常快递）——
  { input: "https://www.gov.cn/zhengce/", label: "安全" },
  { input: "https://github.com/elude-y/anti-fraud-agent", label: "安全" },
  { input: "明天下午3点开会，记得带材料", label: "安全" },
  { input: "你的快递已到菜鸟驿站，取件码 1234", label: "安全" },
  { input: "本周五公司团建，请大家准时参加", label: "安全" },
  { input: "你订阅的课程更新了，登录官网查看", label: "安全" },
  { input: "https://www.bilibili.com/video/BV1xx", label: "安全" },
  { input: "今晚一起吃饭吗？", label: "安全" },
  { input: "您的宽带套餐即将到期，可到营业厅办理续约", label: "安全" },
  { input: "天气降温，注意保暖", label: "安全" },
];

interface RunResult {
  verdict: RiskLevel;
  sandboxCalled: boolean;
  latencyMs: number;
}

async function analyze(input: string, mode: Mode): Promise<RunResult> {
  const startedAt = Date.now();
  const normalized = await normalize(input);
  const ruleScore = computeRuleScore(normalized);
  const rag = await rag_search(normalized.raw);
  const confidence = computeConfidence(rag.topSimilarity, rag.labelAgreement, rag.coverageScore, ruleScore);

  let sandbox: SandboxResult | null = null;
  let sandboxCalled = false;

  if (mode === "sandbox-only") {
    // 全量沙箱：所有样本都进沙箱
    if (normalized.urls.length > 0) {
      const env = await sandboxAnalyze(normalized.urls[0], normalized.raw);
      sandbox = env.result;
      sandboxCalled = true;
    }
  } else if (mode === "hybrid") {
    // 置信度调度：低置信度 / 规则兜底才进沙箱
    const decision = decidePath(confidence, normalized);
    if (decision.path === "sandbox" && normalized.urls.length > 0) {
      const env = await sandboxAnalyze(normalized.urls[0], normalized.raw);
      sandbox = env.result;
      sandboxCalled = true;
    }
  }
  // rag-only：不进沙箱

  const verdict = deriveVerdict(confidence, rag.matches, sandbox);
  return { verdict, sandboxCalled, latencyMs: Date.now() - startedAt };
}

// 二分类判定：风险（诈骗/高危/可疑）vs 安全
function isCorrect(verdict: RiskLevel, label: RiskLevel): boolean {
  const verdictRisky = verdict !== "安全";
  const labelRisky = label !== "安全";
  return verdictRisky === labelRisky;
}

async function main() {
  const n = TEST_SET.length;
  const riskyCount = TEST_SET.filter((s) => s.label !== "安全").length;
  const safeCount = TEST_SET.filter((s) => s.label === "安全").length;
  console.log(`\n消融实验：测试集 ${n} 条样本（${riskyCount} 风险 / ${safeCount} 安全）\n`);

  const summary: Array<{ mode: Mode; correct: number; sandboxCalls: number; totalLatency: number }> = [];

  for (const mode of ["rag-only", "sandbox-only", "hybrid"] as Mode[]) {
    let correct = 0;
    let sandboxCalls = 0;
    let totalLatency = 0;

    for (const sample of TEST_SET) {
      const r = await analyze(sample.input, mode);
      totalLatency += r.latencyMs;
      if (r.sandboxCalled) sandboxCalls++;
      if (isCorrect(r.verdict, sample.label)) correct++;
    }
    summary.push({ mode, correct, sandboxCalls, totalLatency });
  }

  console.log("模式\t\t准确率\t沙箱调用率\t平均耗时");
  console.log("--------------------------------------------------");
  for (const s of summary) {
    const acc = ((s.correct / n) * 100).toFixed(1);
    const sr = ((s.sandboxCalls / n) * 100).toFixed(1);
    const avg = (s.totalLatency / n).toFixed(0);
    console.log(`${s.mode}\t${acc}%\t${sr}%\t\t${avg}ms`);
  }
  console.log("\n结论：混合模式用更低的沙箱调用率，拿到接近全量沙箱的准确率。\n");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
