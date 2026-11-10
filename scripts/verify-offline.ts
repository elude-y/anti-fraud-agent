/**
 * 验证内存向量库兜底（第一周验收项：离线内存库可跑）。
 *
 * 两个场景：
 *   1. RAG_OFFLINE=1 —— 完全离线：不调 embedding、不查 Supabase，纯关键词检索内存库
 *   2. Supabase 不可达但 embedding 可用 —— 用 query 向量在内存库里算余弦
 *
 * 运行：npx tsx scripts/verify-offline.ts
 */
import { rag_search } from "../src/lib/rag/retrieve";
import { memoryStoreSize } from "../src/lib/rag/memoryStore";

const QUERY = "您的快递包裹丢失了，需要理赔，请提供银行卡和验证码";

function show(tag: string, r: Awaited<ReturnType<typeof rag_search>>) {
  console.log(`\n【${tag}】matches=${r.matches.length}`);
  r.matches.slice(0, 3).forEach((m, i) =>
    console.log(`  ${i + 1}. ${m.similarity.toFixed(4)}  [${m.category}] ${m.title.slice(0, 26)}`)
  );
  console.log(
    `  topSimilarity=${r.topSimilarity} labelAgreement=${r.labelAgreement} coverageScore=${r.coverageScore}`
  );
}

(async () => {
  console.log("内存库规模:", memoryStoreSize(), "条");

  // 场景 1：完全离线
  process.env.RAG_OFFLINE = "1";
  const r1 = await rag_search(QUERY);
  show("场景1 完全离线（关键词检索内存库）", r1);

  // 场景 2：数据库不可达（把 Supabase 地址指向一个黑洞端口），embedding 仍可用
  delete process.env.RAG_OFFLINE;
  const realUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
  // supabase 客户端在模块加载时创建，这里需要重新加载模块才能生效
  const fresh = await import(`../src/lib/rag/retrieve.ts?t=${Date.now()}`);
  const r2 = await (fresh as typeof import("../src/lib/rag/retrieve")).rag_search(QUERY);
  show("场景2 数据库不可达（向量检索内存库）", r2);
  process.env.NEXT_PUBLIC_SUPABASE_URL = realUrl;

  const ok1 = r1.matches.length > 0;
  const ok2 = r2.matches.length > 0;
  console.log(`\n结论：离线关键词兜底 ${ok1 ? "✅" : "❌"}，内存向量兜底 ${ok2 ? "✅" : "❌"}`);
  if (!ok1 || !ok2) process.exit(1);
})().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
