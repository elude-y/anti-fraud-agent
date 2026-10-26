/**
 * 黑白名单判定（确定性优先于向量召回）。
 *
 * 数据源：iocs 表（list_type = 'white' | 'black'）
 *   白名单：政府/银行/运营商等官方域名与客服号码
 *   黑名单：已知恶意域名 / URL / 短链 / IP（当前为示例保留地址）
 *
 * 判定顺序：黑名单优先（宁可误报不可漏报），其次白名单。
 *
 * 离线兜底：读取 src/lib/rag/data/ioc-list.json 快照。
 */
import { createSupabaseClient } from "../db/supabase";
import snapshot from "./data/ioc-list.json";

export interface ListEntry {
  list: "white" | "black";
  type: string;
  value: string;
  verdict: string;
}

export interface ListHit extends ListEntry {
  matchedBy: "domain" | "phone" | "url" | "ip";
}

const snapshotEntries = snapshot as ListEntry[];

let cache: ListEntry[] | null = null;
let cacheAt = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

/** 读取名单（5 分钟缓存；失败时用快照） */
export async function loadList(): Promise<ListEntry[]> {
  const now = Date.now();
  if (cache && now - cacheAt < CACHE_TTL_MS) return cache;

  try {
    const supabase = createSupabaseClient();
    const { data, error } = await supabase.from("iocs").select("list_type,type,value,verdict");
    if (error) throw error;
    cache = (data ?? []).map((r: { list_type: string; type: string; value: string; verdict: string | null }) => ({
      list: (r.list_type === "white" ? "white" : "black") as "white" | "black",
      type: r.type,
      value: r.value,
      verdict: r.verdict ?? (r.list_type === "white" ? "安全" : "恶意"),
    }));
    cacheAt = now;
    return cache;
  } catch {
    // 断网或 RLS 异常时退回快照
    return snapshotEntries;
  }
}

/** 从输入中提取域名（支持裸域名与完整 URL） */
function extractHost(input: string): string | null {
  const s = input.trim();
  try {
    return new URL(s).hostname.toLowerCase();
  } catch {
    // 不是完整 URL，尝试用正则抓域名
  }
  const m = s.match(/([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}/);
  return m ? m[0].toLowerCase() : null;
}

function hit(e: ListEntry, matchedBy: ListHit["matchedBy"]): ListHit {
  return { ...e, matchedBy };
}

/** 在给定名单里匹配输入；黑名单优先 */
export function matchList(entries: ListEntry[], input: string): ListHit | null {
  const host = extractHost(input);
  const lower = input.toLowerCase();

  for (const want of ["black", "white"] as const) {
    for (const e of entries) {
      if (e.list !== want) continue;
      const v = e.value.toLowerCase();

      if (e.type === "domain") {
        // 精确域名或子域名
        if (host && (host === v || host.endsWith(`.${v}`))) return hit(e, "domain");
        // 文本里直接出现完整 URL 形式
        if (lower.includes(`://${v}`) || lower.includes(`//${v}`)) return hit(e, "domain");
        continue;
      }

      if (e.type === "phone") {
        // 号码按非数字边界匹配，避免误伤长数字串；
        // 输入同时做一次"去分隔符"归一，兼容 955-88 / 955 88 / +86 95588 这类写法
        const compact = input.replace(/[\s\-()]/g, "");
        const re = new RegExp(`(^|\\D)${e.value}(\\D|$)`);
        if (re.test(input) || re.test(compact)) return hit(e, "phone");
        continue;
      }

      // url / shortlink / ip：子串匹配
      if (lower.includes(v)) return hit(e, e.type as ListHit["matchedBy"]);
    }
  }

  return null;
}

/** 对外入口：先查名单，再决定是否走向量召回 */
export async function checkList(input: string): Promise<ListHit | null> {
  const entries = await loadList();
  return matchList(entries, input);
}
