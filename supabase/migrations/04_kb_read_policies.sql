-- 知识库只读策略。
--
-- 背景：cases / patterns / iocs 三张表都启用了 RLS，但只有 cases 配了策略，
-- patterns 与 iocs 没有任何策略 —— anon key 读这两张表始终返回空，
-- 导致运行时的 match_patterns RPC 也拿不到数据（函数按调用者权限执行）。
--
-- 策略口径：
--   patterns / iocs 仅开放 SELECT 给 anon（知识库是只读素材）
--   写入仍只允许 service_role（服务端种子脚本使用）

create policy "anon can select patterns"
  on patterns for select to anon using (true);

create policy "anon can select iocs"
  on iocs for select to anon using (true);
