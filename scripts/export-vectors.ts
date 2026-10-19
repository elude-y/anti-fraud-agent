/**
 * 导出向量快照：把 cases 表（含 embedding）落成 JSON，供离线内存向量库使用。
 *
 * 运行：npx tsx scripts/export-vectors.ts
 * 输出：src/lib/rag/data/cases-vectors.json
 *
 * 为什么要这份快照：文档「关键约定」要求内存向量库兜底必须可用，
 * 断网时无法调 embedding API、也读不到 Supabase，只能靠本地快照 + 关键词检索。
 */
import fs from "node:fs";
import path from "node:path";
import { createSupabaseClient } from "../src/lib/db/supabase";

const supabase = createSupabaseClient();

interface Row {
  id: string;
  title: string;
  category: string;
  risk_label: string;
  content: string;
  source: string | null;
  embedding: string | number[] | null;
}

(async () => {
  const { data, error } = await supabase
    .from("cases")
    .select("id,title,category,risk_label,content,source,embedding");
  if (error) throw error;

  const rows = (data ?? []) as Row[];
  const out = rows
    .map((r) => {
      let vec: number[] = [];
      if (Array.isArray(r.embedding)) vec = r.embedding;
      else if (typeof r.embedding === "string") vec = JSON.parse(r.embedding) as number[];
      return {
        id: r.id,
        title: r.title,
        category: r.category,
        riskLabel: r.risk_label,
        content: r.content,
        source: r.source,
        // 保留 6 位小数，体积可控且不影响余弦排序
        embedding: vec.map((x) => Number(Number(x).toFixed(6))),
      };
    })
    .filter((r) => r.embedding.length === 1024);

  const file = path.join(process.cwd(), "src", "lib", "rag", "data", "cases-vectors.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out), "utf8");

  const kb = fs.statSync(file).size / 1024;
  console.log(`导出 ${out.length} 条（源表 ${rows.length} 条）→ ${file}`);
  console.log(`文件大小 ${kb.toFixed(0)} KB`);
})().catch((e) => {
  console.error("导出失败:", e);
  process.exit(1);
});
