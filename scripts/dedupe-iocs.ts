/**
 * 名单去重与归一（数据整合）。
 *
 * 检测三类问题：
 *   1. 归一化后重复：大小写 / 首尾空格不同但指向同一实体
 *   2. 冗余 URL：URL 的主机名已被某条 domain 条目覆盖（domain 匹配已能命中该 URL）
 *   3. 电话格式不规范：含空格、短横线、+86 前缀
 *
 * 运行：
 *   npx tsx scripts/dedupe-iocs.ts                    # 只体检，不改数据
 *   npx tsx scripts/dedupe-iocs.ts --apply            # 删除归一化重复项（保留白名单优先）
 *   npx tsx scripts/dedupe-iocs.ts --apply --drop-covered-urls   # 同时删除被 domain 覆盖的 URL
 */
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL as string,
  (process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) as string,
  { auth: { persistSession: false } }
);

interface IocRow {
  id: string;
  list_type: string;
  type: string;
  value: string;
}

const APPLY = process.argv.includes("--apply");
const DROP_COVERED = process.argv.includes("--drop-covered-urls");

/** 按类型归一化 */
function normalize(value: string, type: string): string {
  const v = value.trim();
  if (type === "domain") {
    return v.toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/\.$/, "");
  }
  if (type === "phone") {
    return v.replace(/[^\d]/g, "").replace(/^(0086|86)/, "");
  }
  if (type === "ip") return v.trim();
  // url / shortlink：仅去首尾空格与末尾斜杠，路径大小写保留
  return v.replace(/\/+$/, "");
}

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

(async () => {
  const { data, error } = await supabase
    .from("iocs")
    .select("id,list_type,type,value")
    .order("list_type")
    .order("type")
    .order("value");
  if (error) throw error;

  const rows = (data ?? []) as IocRow[];
  console.log(`当前名单 ${rows.length} 条（white ${rows.filter((r) => r.list_type === "white").length} / black ${rows.filter((r) => r.list_type !== "white").length}）`);

  // 1) 归一化重复
  const groups = new Map<string, IocRow[]>();
  for (const r of rows) {
    const key = normalize(r.value, r.type);
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const dupGroups = [...groups.entries()].filter(([, list]) => list.length > 1);

  console.log(`\n[1] 归一化重复：${dupGroups.length} 组`);
  for (const [key, list] of dupGroups) {
    console.log(`  ${key} → ${list.map((r) => `${r.list_type}:${r.type}:${r.value}`).join(" | ")}`);
  }

  // 2) 冗余 URL（主机已被 domain 覆盖）
  const domains = new Set(rows.filter((r) => r.type === "domain").map((r) => normalize(r.value, "domain")));
  const coveredUrls = rows.filter((r) => {
    if (r.type !== "url" && r.type !== "shortlink") return false;
    const h = hostOf(r.value);
    return h ? domains.has(h) : false;
  });

  console.log(`\n[2] 主机名已被 domain 条目覆盖的 URL/短链：${coveredUrls.length} 条`);
  for (const r of coveredUrls) console.log(`  ${r.list_type} ${r.value}`);

  // 3) 电话格式不规范
  const badPhones = rows.filter(
    (r) => r.type === "phone" && !/^\d+$/.test(r.value.trim())
  );
  console.log(`\n[3] 电话格式不规范：${badPhones.length} 条`);
  for (const r of badPhones) console.log(`  ${r.value} → ${normalize(r.value, "phone")}`);

  if (!APPLY) {
    console.log("\n（体检模式，未修改数据。加 --apply 执行删除；再加 --drop-covered-urls 一并删除冗余 URL）");
    return;
  }

  // 执行：删除重复项，白名单优先保留，其次按 value 字典序最小
  const toDelete: string[] = [];
  for (const [, list] of dupGroups) {
    const keep =
      list.find((r) => r.list_type === "white") ??
      [...list].sort((a, b) => a.value.localeCompare(b.value))[0];
    for (const r of list) if (r.id !== keep.id) toDelete.push(r.id);
  }
  // 电话格式修正（保留原记录，仅改写 value）
  for (const r of badPhones) {
    const fixed = normalize(r.value, "phone");
    const { error: upErr } = await supabase.from("iocs").update({ value: fixed }).eq("id", r.id);
    if (upErr) console.error(`  电话归一失败 ${r.value}: ${upErr.message}`);
    else console.log(`  ✅ 电话归一 ${r.value} → ${fixed}`);
  }

  if (DROP_COVERED) {
    for (const r of coveredUrls) toDelete.push(r.id);
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase.from("iocs").delete().in("id", toDelete);
    if (delErr) throw new Error(`删除失败: ${delErr.message}`);
    console.log(`\n已删除 ${toDelete.length} 条：${toDelete.length === coveredUrls.length ? "（含被 domain 覆盖的 URL）" : ""}`);
  } else {
    console.log("\n没有需要删除的记录");
  }

  const { count } = await supabase.from("iocs").select("*", { count: "exact", head: true });
  console.log(`处理后名单总数：${count}`);
})().catch((e) => {
  console.error("整合失败:", e);
  process.exit(1);
});
