/**
 * 离线内存向量库（文档「关键约定」：内存向量库兜底必须可用，保证离线演示不翻车）。
 *
 * 数据来源：src/lib/rag/data/cases-vectors.json（由 scripts/export-vectors.ts 从 Supabase 导出）
 *
 * 两种用法：
 *   - 有 query 向量：在内存里算余弦相似度 top-K
 *   - 无 query 向量（断网、embedding 调用失败）：退化为关键词要素打分
 */
import raw from "./data/cases-vectors.json";
import { keywordScore, type MatchItem } from "./signals";

interface MemCase {
  id: string;
  title: string;
  category: string;
  riskLabel: string;
  content: string;
  source: string | null;
  embedding: number[];
}

const CASES = raw as MemCase[];

/** 内存库规模（启动时可用于健康检查/日志） */
export function memoryStoreSize(): number {
  return CASES.length;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/**
 * 内存检索：
 *   vec 存在且维度匹配 → 余弦相似度检索
 *   否则              → 关键词要素打分
 */
export function searchMemory(query: string, vec: number[] | null, topK = 5): MatchItem[] {
  const useVector = Array.isArray(vec) && vec.length === (CASES[0]?.embedding?.length ?? 0);

  const scored = CASES.map((c) => {
    const sim = useVector
      ? cosine(vec as number[], c.embedding)
      : keywordScore(query, `${c.title} ${c.content}`);
    return { c, sim };
  });

  scored.sort((x, y) => y.sim - x.sim);

  return scored.slice(0, topK).map(({ c, sim }) => ({
    caseId: c.id,
    title: c.title,
    category: c.category,
    riskLabel: c.riskLabel as MatchItem["riskLabel"],
    content: c.content,
    similarity: Number(sim.toFixed(4)),
    source: c.source,
  }));
}
