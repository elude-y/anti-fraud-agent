/**
 * 导出向量快照：cases 与 patterns 都落成 JSON，供离线内存向量库使用。
 *
 * 运行：npx tsx scripts/export-vectors.ts
 * 输出：
 *   src/lib/rag/data/cases-vectors.json
 *   src/lib/rag/data/patterns-vectors.json
 */
import fs from "node:fs";
import path from "node:path";
import { createSupabaseClient } from "../src/lib/db/supabase";

const supabase = createSupabaseClient();

interface CaseRow {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
  embedding: string | number[] | null;
}

interface PatternRow {
  id: string;
  pattern: string;
  category: string;
  keywords: string[] | null;
  embedding: string | number[] | null;
}

function toVec(v: string | number[] | null): number[] {
  let vec: number[] = [];
  if (Array.isArray(v)) vec = v;
  else if (typeof v === "string") vec = JSON.parse(v) as number[];
  // 保留 6 位小数，体积可控且不影响余弦排序
  return vec.map((x) => Number(Number(x).toFixed(6)));
}

function write(name: string, rows: unknown[]) {
  const file = path.join(process.cwd(), "src", "lib", "rag", "data", name);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(rows), "utf8");
  const kb = fs.statSync(file).size / 1024;
  console.log(`导出 ${rows.length} 条 → ${name}（${kb.toFixed(0)} KB）`);
}

(async () => {
  const { data: caseData, error: ce } = await supabase
    .from("cases")
    .select("id,title,category,risk_label,content,source,embedding");
  if (ce) throw ce;

  write(
    "cases-vectors.json",
    ((caseData ?? []) as CaseRow[])
      .map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        riskLabel: r.risk_label,
        content: r.content,
        source: r.source,
        embedding: toVec(r.embedding),
      }))
      .filter((r) => r.embedding.length === 1024)
  );

  const { data: patData, error: pe } = await supabase
    .from("patterns")
    .select("id,pattern,category,keywords,embedding");
  if (pe) throw pe;

  write(
    "patterns-vectors.json",
    ((patData ?? []) as PatternRow[])
      .map((r) => ({
        id: r.id,
        pattern: r.pattern,
        category: r.category,
        keywords: r.keywords ?? [],
        embedding: toVec(r.embedding),
      }))
      .filter((r) => r.embedding.length === 1024)
  );

  // 黑白名单快照（离线判定兜底）
  const { data: iocData, error: ie } = await supabase
    .from("iocs")
    .select("list_type,type,value,verdict");
  if (ie) throw ie;

  write(
    "ioc-list.json",
    ((iocData ?? []) as { list_type: string; type: string; value: string; verdict: string | null }[]).map(
      (r) => ({
        list: r.list_type === "white" ? "white" : "black",
        type: r.type,
        value: r.value,
        verdict: r.verdict ?? (r.list_type === "white" ? "安全" : "恶意"),
      })
    )
  );
})().catch((e) => {
  console.error("导出失败:", e);
  process.exit(1);
});
