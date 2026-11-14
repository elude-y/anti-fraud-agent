import { createClient } from "@supabase/supabase-js";

export function isSupabaseConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

export function createSupabaseClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    // 不抛错：构建期/未配置时返回 null，由调用方兜底，避免导入即失败
    return null;
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}

/** 脚本/必须联网的场景用：未配置直接抛错，避免拿到 null 继续往下跑 */
export function requireSupabaseClient() {
  const client = createSupabaseClient();
  if (!client) throw new Error("未配置 Supabase，请检查 .env.local");
  return client;
}
