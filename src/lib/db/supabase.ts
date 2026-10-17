import { createClient } from "@supabase/supabase-js";

export function createSupabaseClient() {
  // 用.env里真实的变量名
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string;

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error("读取Supabase环境变量失败！");
  }
  return createClient(supabaseUrl, supabaseAnonKey);
}
