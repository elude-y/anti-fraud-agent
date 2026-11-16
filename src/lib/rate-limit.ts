// src/lib/rate-limit.ts —— 简单内存 IP 限流器（单实例；生产可替换为 Redis/Upstash）
const stores = new Map<string, Map<string, number[]>>();

/** 创建按 key（如 IP）限流的实例：窗口内最多 limit 次 */
export function createRateLimiter(name: string, windowMs: number, limit: number) {
  let hits = stores.get(name);
  if (!hits) {
    hits = new Map();
    stores.set(name, hits);
  }
  return {
    allow(key: string): boolean {
      const now = Date.now();
      const arr = (hits!.get(key) ?? []).filter((t) => now - t < windowMs);
      if (arr.length >= limit) return false;
      arr.push(now);
      hits!.set(key, arr);
      return true;
    },
  };
}

/** 从请求头取客户端 IP（优先 x-forwarded-for，Vercel 会注入） */
export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || "unknown";
}
