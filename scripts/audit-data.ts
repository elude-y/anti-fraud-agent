/**
 * 数据体检脚本（第四周「数据打磨」配套，也用于第五周答辩说明数据口径）。
 *
 * 对照分工文档检查：
 *   cases：≥50 条、覆盖 10 个类别、100% 有 embedding / tags / source、
 *          正文 ≥40 字、标题 ≥8 字、无重复标题
 *   patterns：每条有 keywords 与 embedding、类别数
 *   iocs：类型分布（domain/ip/url/shortlink）
 *
 * 运行：npx tsx scripts/audit-data.ts
 * 输出：scripts/data-audit.md
 */
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  { auth: { persistSession: false } }
);

const EXPECTED_CATEGORIES = [
  "刷单", "冒充客服", "快递理赔", "ETC", "KYC",
  "中奖", "杀猪盘", "贷款", "冒充公检法", "退费",
];

interface CaseRow {
  title: string;
  category: string;
  content: string;
  source: string | null;
  tags: string[] | null;
  embedding: unknown;
}

const results: { check: string; expect: string; actual: string; ok: boolean }[] = [];

function check(name: string, expect: string, actual: string, ok: boolean) {
  results.push({ check: name, expect, actual, ok });
  console.log(`${ok ? "✅" : "❌"} ${name.padEnd(22)} 期望 ${expect.padEnd(14)} 实际 ${actual}`);
}

(async () => {
  const { data: caseData, error: ce } = await supabase
    .from("cases")
    .select("title,category,content,source,tags,embedding");
  if (ce) throw ce;
  const cases = (caseData ?? []) as CaseRow[];

  check("cases 总数", "≥50", String(cases.length), cases.length >= 50);

  const cats = new Set(cases.map((c) => c.category));
  const missingCats = EXPECTED_CATEGORIES.filter((c) => !cats.has(c));
  check(
    "类别覆盖",
    "10 类",
    `${cats.size} 类${missingCats.length ? "，缺 " + missingCats.join("/") : ""}`,
    missingCats.length === 0
  );

  const withVec = cases.filter((c) => c.embedding !== null).length;
  check("embedding 覆盖", "100%", `${withVec}/${cases.length}`, withVec === cases.length);

  const withTags = cases.filter((c) => c.tags && c.tags.length > 0).length;
  check("tags 覆盖", "100%", `${withTags}/${cases.length}`, withTags === cases.length);

  const withSrc = cases.filter((c) => c.source && c.source.trim() !== "").length;
  check("source 覆盖", "100%", `${withSrc}/${cases.length}`, withSrc === cases.length);

  const shortContent = cases.filter((c) => c.content.length < 40);
  check("正文长度 ≥40 字", "0 条不达标", `${shortContent.length} 条不达标`, shortContent.length === 0);

  const shortTitle = cases.filter((c) => c.title.length < 8);
  check("标题长度 ≥8 字", "0 条不达标", `${shortTitle.length} 条不达标`, shortTitle.length === 0);

  const titleCount = new Map<string, number>();
  for (const c of cases) titleCount.set(c.title, (titleCount.get(c.title) ?? 0) + 1);
  const dupTitles = [...titleCount.entries()].filter(([, n]) => n > 1);
  check("重复标题", "0 组", `${dupTitles.length} 组`, dupTitles.length === 0);

  // patterns
  const { data: patData, error: pe } = await supabase
    .from("patterns")
    .select("category,keywords,embedding");
  if (pe) throw pe;
  const patterns = (patData ?? []) as { category: string; keywords: string[] | null; embedding: unknown }[];
  check("patterns 总数", ">0", String(patterns.length), patterns.length > 0);
  const pWithVec = patterns.filter((p) => p.embedding !== null).length;
  check("patterns 向量覆盖", "100%", `${pWithVec}/${patterns.length}`, pWithVec === patterns.length);
  const pWithKw = patterns.filter((p) => p.keywords && p.keywords.length > 0).length;
  check("patterns 关键词覆盖", "100%", `${pWithKw}/${patterns.length}`, pWithKw === patterns.length);

  // iocs
  const { data: iocData, error: ie } = await supabase.from("iocs").select("type,value");
  if (ie) throw ie;
  const iocs = (iocData ?? []) as { type: string; value: string }[];
  const byType = new Map<string, number>();
  for (const i of iocs) byType.set(i.type, (byType.get(i.type) ?? 0) + 1);
  check("iocs 总数", ">0", String(iocs.length), iocs.length > 0);
  check(
    "iocs 类型覆盖",
    "4 类",
    [...byType.entries()].map(([k, v]) => `${k}:${v}`).join(" "),
    byType.size >= 4
  );

  const failed = results.filter((r) => !r.ok);
  const md = [
    "# 数据体检报告",
    "",
    `- 生成时间：${new Date().toISOString()}`,
    `- 数据源：Supabase（cases / patterns / iocs）`,
    "",
    "| 检查项 | 期望 | 实际 | 结果 |",
    "|---|---|---|---|",
    ...results.map((r) => `| ${r.check} | ${r.expect} | ${r.actual} | ${r.ok ? "通过" : "**不通过**"} |`),
    "",
    `## 结论`,
    "",
    failed.length === 0
      ? `全部 ${results.length} 项检查通过。`
      : `${failed.length} 项不通过：${failed.map((f) => f.check).join("、")}`,
    "",
  ].join("\n");

  const out = path.join(process.cwd(), "scripts", "data-audit.md");
  fs.writeFileSync(out, md, "utf8");
  console.log(`\n结论：${failed.length === 0 ? "全部通过" : failed.length + " 项不通过"}`);
  console.log("报告已写入:", out);
  if (failed.length > 0) process.exitCode = 1;
})().catch((e) => {
  console.error("体检失败:", e);
  process.exit(1);
});
