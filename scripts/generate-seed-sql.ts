/**
 * 从数据库导出可复现的种子 SQL（第五周「数据可溯源」配套）。
 *
 * 输出：supabase/seed.sql
 *
 * 设计：
 *  - 幂等：按主键 id 做 ON CONFLICT DO NOTHING，重复执行不会产生重复行
 *  - 不含 embedding：向量由 bge-m3 对固定文本确定性生成，
 *    执行迁移后跑 npm run embed 即可重建（避免把 1MB 浮点数塞进仓库）
 *  - 覆盖三张表：cases / patterns / iocs
 *
 * 运行：npx tsx scripts/generate-seed-sql.ts
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  { auth: { persistSession: false } }
);

const q = (s: string | null | undefined) => (s == null ? "NULL" : `'${s.replace(/'/g, "''")}'`);
const arr = (xs: string[] | null | undefined) =>
  xs && xs.length ? `ARRAY[${xs.map((x) => q(x)).join(", ")}]::text[]` : "NULL";

interface CaseRow {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
  tags: string[] | null;
}

interface PatternRow {
  id: string;
  pattern: string;
  category: string;
  keywords: string[] | null;
}

interface IocRow {
  id: string;
  type: string;
  value: string;
  verdict: string | null;
  source: string | null;
  list_type: string;
}

(async () => {
  const [{ data: cases, error: ce }, { data: patterns, error: pe }, { data: iocs, error: ie }] =
    await Promise.all([
      supabase.from("cases").select("id,title,category,risk_label,content,source,tags").order("title"),
      supabase.from("patterns").select("id,pattern,category,keywords").order("category"),
      supabase.from("iocs").select("id,type,value,verdict,source,list_type").order("type"),
    ]);
  if (ce) throw ce;
  if (pe) throw pe;
  if (ie) throw ie;

  const lines: string[] = [];
  lines.push("-- 由 scripts/generate-seed-sql.ts 从数据库自动导出，请勿手工编辑。");
  lines.push("-- 重新生成：npx tsx scripts/generate-seed-sql.ts");
  lines.push("-- 幂等：按主键 id 冲突时跳过，可安全重复执行。");
  lines.push("-- 不含 embedding：执行迁移后运行 `npm run embed` 由 bge-m3 重建向量。");
  lines.push("");

  lines.push("-- ── cases ──────────────────────────────────────────────");
  lines.push("insert into cases (id,title,category,risk_label,content,source,tags) values");
  lines.push(
    ((cases ?? []) as CaseRow[])
      .map((c) => `(${q(c.id)},${q(c.title)},${q(c.category)},${q(c.risk_label)},${q(c.content)},${q(c.source)},${arr(c.tags)})`)
      .join(",\n")
  );
  lines.push("on conflict (id) do nothing;");
  lines.push("");

  lines.push("-- ── patterns ───────────────────────────────────────────");
  lines.push("insert into patterns (id,pattern,category,keywords) values");
  lines.push(
    ((patterns ?? []) as PatternRow[])
      .map((p) => `(${q(p.id)},${q(p.pattern)},${q(p.category)},${arr(p.keywords)})`)
      .join(",\n")
  );
  lines.push("on conflict (id) do nothing;");
  lines.push("");

  lines.push("-- ── iocs ───────────────────────────────────────────────");
  lines.push("-- list_type: white = 白名单（政府/银行/运营商官方实体），black = 黑名单（示例保留地址）");
  lines.push("insert into iocs (id,type,value,verdict,source,list_type,last_seen) values");
  lines.push(
    ((iocs ?? []) as IocRow[])
      .map(
        (i) =>
          `(${q(i.id)},${q(i.type)},${q(i.value)},${q(i.verdict)},${q(i.source)},${q(i.list_type)},now())`
      )
      .join(",\n")
  );
  lines.push("on conflict (id) do nothing;");
  lines.push("");

  const out = path.join(process.cwd(), "supabase", "seed.sql");
  fs.writeFileSync(out, lines.join("\n"), "utf8");

  const kb = fs.statSync(out).size / 1024;
  console.log(
    `导出 cases=${(cases ?? []).length} patterns=${(patterns ?? []).length} iocs=${(iocs ?? []).length} → supabase/seed.sql（${kb.toFixed(0)} KB）`
  );
})().catch((e) => {
  console.error("导出失败:", e);
  process.exit(1);
});
