// 第一行加载环境变量：npm run embed 不再依赖 -r dotenv/config（它只读 .env，不读 .env.local）
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

/**
 * 批量补齐向量（cases + patterns）。
 *
 * 只处理 embedding 为 NULL 的记录，已有向量不会被覆盖。
 *
 * 两个关键点：
 *   1. 必须同时处理 patterns —— 否则只跑 cases 的话，patterns 全部为 NULL，
 *      match_patterns 会返回空集，话术检索功能等于失效。
 *   2. 必须用 service_role 写入 —— cases/patterns 都启用了 RLS，
 *      anon key 对 patterns 没有任何写策略。
 *
 * 运行：npm run embed
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ??
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string;

if (!url || !key) {
  throw new Error("缺少 NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn("⚠️ 未找到 SUPABASE_SERVICE_ROLE_KEY，将用 anon key 写入（patterns 会被 RLS 拒绝）");
}

const supabase = createClient(url, key, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const API = process.env.EMBEDDING_BASE_URL ?? "https://api.siliconflow.cn/v1/embeddings";
const API_KEY = process.env.EMBEDDING_API_KEY;
const MODEL = process.env.EMBEDDING_MODEL ?? "BAAI/bge-m3";

async function embed(text: string): Promise<number[]> {
  if (!API_KEY) throw new Error("缺少 EMBEDDING_API_KEY");
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify({ model: MODEL, input: text }),
  });
  if (!res.ok) throw new Error(`embedding API ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const json = (await res.json()) as { data: { embedding: number[] }[] };
  return json.data[0].embedding;
}

/** cases：向量化文本 = title + "\n" + content */
async function fillCases(): Promise<{ done: number; failed: number }> {
  const { data, error } = await supabase
    .from("cases")
    .select("id,title,content")
    .is("embedding", null);
  if (error) throw new Error(`读取 cases 失败: ${error.message}`);

  const rows = data ?? [];
  console.log(`cases：待生成向量 ${rows.length} 条`);

  let done = 0;
  let failed = 0;
  for (const r of rows as { id: string; title: string; content: string }[]) {
    try {
      const vec = await embed(`${r.title}\n${r.content}`);
      const { error: upErr } = await supabase
        .from("cases")
        .update({ embedding: `[${vec.join(",")}]` })
        .eq("id", r.id);
      if (upErr) throw new Error(upErr.message);
      done++;
      console.log(`  ✅ ${r.title.slice(0, 28)}`);
    } catch (e) {
      failed++;
      console.error(`  ❌ ${r.title.slice(0, 28)}: ${(e as Error).message}`);
    }
  }
  return { done, failed };
}

/** patterns：向量化文本 = pattern + "\n" + keywords.join("、") */
async function fillPatterns(): Promise<{ done: number; failed: number }> {
  const { data, error } = await supabase
    .from("patterns")
    .select("id,pattern,keywords")
    .is("embedding", null);
  if (error) throw new Error(`读取 patterns 失败: ${error.message}`);

  const rows = (data ?? []) as { id: string; pattern: string; keywords: string[] | null }[];
  console.log(`patterns：待生成向量 ${rows.length} 条`);

  let done = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      const vec = await embed(`${r.pattern}\n${(r.keywords ?? []).join("、")}`);
      const { error: upErr } = await supabase
        .from("patterns")
        .update({ embedding: `[${vec.join(",")}]` })
        .eq("id", r.id);
      if (upErr) throw new Error(upErr.message);
      done++;
      console.log(`  ✅ ${r.pattern.slice(0, 28)}`);
    } catch (e) {
      failed++;
      console.error(`  ❌ ${r.pattern.slice(0, 28)}: ${(e as Error).message}`);
    }
  }
  return { done, failed };
}

(async () => {
  console.log(`模型=${MODEL}`);

  const c = await fillCases();
  const p = await fillPatterns();

  const [{ count: caseTotal }, { count: caseVec }, { count: patTotal }, { count: patVec }] =
    await Promise.all([
      supabase.from("cases").select("*", { count: "exact", head: true }),
      supabase.from("cases").select("*", { count: "exact", head: true }).not("embedding", "is", null),
      supabase.from("patterns").select("*", { count: "exact", head: true }),
      supabase
        .from("patterns")
        .select("*", { count: "exact", head: true })
        .not("embedding", "is", null),
    ]);

  console.log(
    `\n本次：cases +${c.done}（失败 ${c.failed}），patterns +${p.done}（失败 ${p.failed}）`
  );
  console.log(`当前：cases ${caseVec}/${caseTotal} 有向量，patterns ${patVec}/${patTotal} 有向量`);

  if (c.failed > 0 || p.failed > 0 || caseVec !== caseTotal || patVec !== patTotal) {
    process.exit(1);
  }
})().catch((e) => {
  console.error("向量化失败:", e);
  process.exit(1);
});
