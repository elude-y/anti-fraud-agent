/**
 * 验证「安全输入不再被判成诈骗」（问题修复清单验收标准）。
 *
 * 走项目自身的 supabase 客户端 + match_cases RPC，不引入额外依赖。
 *
 * 四部分：
 *   1. 安全输入 → top-1 必须是「安全」标签
 *   2. 银行短信 → top-1 必须是「银行」类别（不是 ETC）
 *   3. 诈骗输入 → top-1 仍为诈骗类别（确认无回归）
 *   4. 向量区分度：银行 / ETC / 快递理赔 的类别内与类别间相似度
 *
 * 运行：npx tsx scripts/verify-safe.ts
 */
import { createSupabaseClient } from "../src/lib/db/supabase";
import { createEmbedding } from "../src/lib/rag/embedding";

const supabase = createSupabaseClient();

interface Q {
  query: string;
  expect: "safe" | "bank" | "fraud";
  note: string;
}

const CASES: Q[] = [
  { query: "https://www.gov.cn/", expect: "safe", note: "政府官网" },
  { query: "明天上午十点在三楼会议室开会，请准时参加", expect: "safe", note: "开会通知" },
  { query: "您的快递已放在丰巢柜，取件码8842", expect: "safe", note: "正常快递通知" },
  { query: "12321举报中心：您反映的垃圾短信已受理", expect: "safe", note: "12321 回复" },
  { query: "【中国工商银行】您尾号8877的储蓄卡消费128.00元", expect: "bank", note: "工行短信" },
  { query: "【建设银行】您账户入账工资8600元", expect: "bank", note: "建行短信" },
  { query: "您的ETC账户异常，点击链接完成认证否则停用", expect: "fraud", note: "ETC 诈骗短信" },
  { query: "做任务返利，垫付越多返得越多", expect: "fraud", note: "刷单话术" },
  { query: "你涉嫌洗钱，需要把钱转到安全账户接受核查", expect: "fraud", note: "冒充公检法" },
];

interface Row {
  category: string;
  risk_label: string;
  title: string;
  similarity: number;
}

async function top1(query: string): Promise<Row> {
  const vec = await createEmbedding(query);
  const { data, error } = await supabase.rpc("match_cases", {
    query_embedding: vec,
    match_count: 1,
  });
  if (error) throw error;
  return (data as Row[])[0];
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

(async () => {
  console.log("【验收检查】");
  let pass = 0;

  for (const item of CASES) {
    const top = await top1(item.query);
    const label = top.risk_label;
    const cat = top.category;

    let ok = false;
    if (item.expect === "safe") ok = label === "安全";
    else if (item.expect === "bank") ok = cat === "银行";
    else ok = label === "诈骗";

    if (ok) pass++;
    console.log(
      `${ok ? "✅" : "❌"} ${item.note.padEnd(12)} → top-1 [${cat}/${label}] ${Number(top.similarity).toFixed(4)}  ${top.title.slice(0, 24)}`
    );
  }
  console.log(`\n验收结果：${pass}/${CASES.length} 通过`);

  // 向量区分度：拉取三个类别的向量，在 JS 里算两两余弦
  const { data, error } = await supabase
    .from("cases")
    .select("category,embedding")
    .in("category", ["银行", "ETC", "快递理赔"]);
  if (error) throw error;

  const items = (data ?? []).map((r: { category: string; embedding: string | number[] }) => ({
    category: r.category,
    vec: (Array.isArray(r.embedding) ? r.embedding : JSON.parse(r.embedding as string)) as number[],
  }));

  const acc: Record<string, { sum: number; n: number }> = {};
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const key = `${items[i].category}|${items[j].category}`;
      const s = cosine(items[i].vec, items[j].vec);
      acc[key] = acc[key] ?? { sum: 0, n: 0 };
      acc[key].sum += s;
      acc[key].n += 1;
    }
  }

  console.log("\n【向量区分度】");
  for (const [key, v] of Object.entries(acc).sort()) {
    const [a, b] = key.split("|");
    const tag = a === b ? "同类" : "跨类";
    console.log(`  ${tag} ${a.padEnd(6)} ↔ ${b.padEnd(6)} ${(v.sum / v.n).toFixed(4)}  (${v.n} 对)`);
  }

  const counts = new Map<string, number>();
  for (const it of items) counts.set(it.category, (counts.get(it.category) ?? 0) + 1);
  console.log("\n【相关类别规模】");
  for (const [k, n] of counts) console.log(`  ${k.padEnd(6)} ${n} 条`);

  if (pass < CASES.length) process.exit(1);
})().catch((e) => {
  console.error("验证失败:", e);
  process.exit(1);
});
