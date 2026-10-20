/**
 * 验证「patterns 接入检索」（在线 + 离线两条路径）。
 *
 * 运行：npx tsx scripts/verify-patterns.ts
 */
import { rag_search } from "../src/lib/rag/retrieve";
import { memoryStoreSize, patternStoreSize } from "../src/lib/rag/memoryStore";

const QUERY = "您的ETC账户异常，点击链接完成认证否则停用";

function show(tag: string, r: Awaited<ReturnType<typeof rag_search>>) {
  console.log(`\n【${tag}】`);
  console.log(`  案例 ${r.matches.length} 条  topSimilarity=${r.topSimilarity} labelAgreement=${r.labelAgreement} coverageScore=${r.coverageScore}`);
  r.matches.slice(0, 2).forEach((m, i) =>
    console.log(`    ${i + 1}. ${m.similarity.toFixed(4)} [${m.category}] ${m.title.slice(0, 26)}`)
  );
  const ps = r.patterns ?? [];
  console.log(`  话术 ${ps.length} 条`);
  ps.forEach((p, i) =>
    console.log(`    ${i + 1}. ${p.similarity.toFixed(4)} [${p.category}] ${p.pattern.slice(0, 30)}`)
  );
}

(async () => {
  console.log(`内存库：cases ${memoryStoreSize()} 条，patterns ${patternStoreSize()} 条`);

  const online = await rag_search(QUERY);
  show("在线（Supabase + match_patterns）", online);

  process.env.RAG_OFFLINE = "1";
  const offline = await rag_search(QUERY);
  show("离线（内存向量库）", offline);

  const ok =
    (online.patterns?.length ?? 0) > 0 &&
    (offline.patterns?.length ?? 0) > 0 &&
    (online.matches.length > 0) &&
    (offline.matches.length > 0);

  console.log(`\n结论：在线话术 ${online.patterns?.length ?? 0} 条，离线话术 ${offline.patterns?.length ?? 0} 条 → ${ok ? "✅" : "❌"}`);
  if (!ok) process.exit(1);
})().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
