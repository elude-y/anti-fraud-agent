/**
 * 验证 LLM 重排分支（第二周遗留：没有 DEEPSEEK_API_KEY，真实调用没被验证过）。
 *
 * 做法：起一个本地 mock 服务模拟 DeepSeek 的 /chat/completions，
 * 返回固定的重排结果，检查 rerank 是否正确解析并应用；再关掉服务，
 * 检查失败时是否安全降级（不抛异常、保持混合打分顺序）。
 *
 * 运行：npx tsx scripts/verify-llm-rerank.ts
 */
import http from "node:http";
import { rerank } from "../src/lib/rag/rerank";
import type { MatchItem } from "../src/lib/rag/signals";

const PORT = 18099;
const BASE = `http://127.0.0.1:${PORT}/v1`;

// 三条内容相同、相似度相同的假数据 → 混合打分会保持原顺序，便于验证 LLM 的排序被真正应用
const matches: MatchItem[] = [
  { caseId: "A", title: "案例A", category: "刷单", riskLabel: "诈骗", content: "内容", similarity: 0.8, source: null },
  { caseId: "B", title: "案例B", category: "刷单", riskLabel: "诈骗", content: "内容", similarity: 0.8, source: null },
  { caseId: "C", title: "案例C", category: "刷单", riskLabel: "诈骗", content: "内容", similarity: 0.8, source: null },
];

function makeServer(reply: string) {
  return http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ choices: [{ message: { content: reply } }] }));
    });
  });
}

async function listen(server: http.Server): Promise<void> {
  await new Promise<void>((r) => server.listen(PORT, "127.0.0.1", () => r()));
}

async function close(server: http.Server): Promise<void> {
  await new Promise<void>((r) => server.close(() => r()));
}

(async () => {
  process.env.DEEPSEEK_API_KEY = "test-key-for-mock";
  process.env.DEEPSEEK_BASE_URL = BASE;

  // 场景 1：mock 返回 [2,1,0] → 期望顺序 C,B,A
  let server = makeServer("[2,1,0]");
  await listen(server);
  const r1 = await rerank("任意查询", { matches, topSimilarity: 0, labelAgreement: 0, coverageScore: 0 });
  const order1 = r1.matches.map((m) => m.caseId).join(",");
  console.log(`场景1 mock 返回 [2,1,0] → 实际顺序 ${order1}  ${order1 === "C,B,A" ? "✅" : "❌"}`);
  await close(server);

  // 场景 2：mock 返回非法内容 → 应安全降级为混合打分顺序 A,B,C
  server = makeServer("我不排序");
  await listen(server);
  const r2 = await rerank("任意查询", { matches, topSimilarity: 0, labelAgreement: 0, coverageScore: 0 });
  const order2 = r2.matches.map((m) => m.caseId).join(",");
  console.log(`场景2 mock 返回非法内容 → 实际顺序 ${order2}  ${order2 === "A,B,C" ? "✅ 已降级" : "❌"}`);
  await close(server);

  // 场景 3：服务不可达 → 应安全降级
  process.env.DEEPSEEK_BASE_URL = `http://127.0.0.1:${PORT + 1}/v1`;
  const r3 = await rerank("任意查询", { matches, topSimilarity: 0, labelAgreement: 0, coverageScore: 0 });
  const order3 = r3.matches.map((m) => m.caseId).join(",");
  console.log(`场景3 服务不可达 → 实际顺序 ${order3}  ${order3 === "A,B,C" ? "✅ 已降级" : "❌"}`);
})().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
