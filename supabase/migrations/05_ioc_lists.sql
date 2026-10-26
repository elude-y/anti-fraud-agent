-- 黑白名单整合：iocs 表原本只有"恶意"实体，现在扩展为统一名单表。
--
-- 设计：
--   list_type = 'black' 黑名单（默认，原有 23 条示例 IOC 全部视为黑名单）
--   list_type = 'white' 白名单（政府/银行/运营商等可信号码与域名）
--
-- 用途：检索前先做确定性判定
--   命中白名单 → 直接判「安全」，不再走向量召回
--   命中黑名单 → 标记为「诈骗」，向量检索结果仅作证据补充
--
-- 注意：value 上有 UNIQUE 约束，同一实体只能属于一个名单。

alter table iocs add column if not exists list_type text not null default 'black';

alter table iocs drop constraint if exists iocs_list_type_check;
alter table iocs add constraint iocs_list_type_check check (list_type in ('white', 'black'));

create index if not exists iocs_list_type_value_idx on iocs (list_type, value);

-- ── 白名单种子：政府与公共服务 ─────────────────────────────
insert into iocs (type, value, verdict, source, list_type, last_seen) values
  ('domain', 'gov.cn',   '安全', '官方政务域名',           'white', now()),
  ('domain', '12321.cn', '安全', '12321 举报中心官方域名', 'white', now()),
  ('phone',  '12321',    '安全', '12321 举报中心',         'white', now()),
  ('phone',  '12381',    '安全', '工信部反诈预警号码',     'white', now()),
  ('phone',  '12345',    '安全', '政务服务便民热线',       'white', now()),
  ('phone',  '12306',    '安全', '铁路 12306 官方客服',    'white', now())
on conflict (value) do update
  set list_type = excluded.list_type, verdict = excluded.verdict, source = excluded.source;

-- ── 白名单种子：银行官方域名与客服电话 ─────────────────────
insert into iocs (type, value, verdict, source, list_type, last_seen) values
  ('domain', 'icbc.com.cn',  '安全', '工商银行官方域名', 'white', now()),
  ('domain', 'ccb.com.cn',   '安全', '建设银行官方域名', 'white', now()),
  ('domain', 'abchina.com',  '安全', '农业银行官方域名', 'white', now()),
  ('domain', 'boc.cn',       '安全', '中国银行官方域名', 'white', now()),
  ('domain', 'cmbchina.com', '安全', '招商银行官方域名', 'white', now()),
  ('phone',  '95588',        '安全', '工商银行客服',     'white', now()),
  ('phone',  '95533',        '安全', '建设银行客服',     'white', now()),
  ('phone',  '95599',        '安全', '农业银行客服',     'white', now()),
  ('phone',  '95566',        '安全', '中国银行客服',     'white', now()),
  ('phone',  '95555',        '安全', '招商银行客服',     'white', now())
on conflict (value) do update
  set list_type = excluded.list_type, verdict = excluded.verdict, source = excluded.source;

-- ── 白名单种子：运营商官方客服 ─────────────────────────────
insert into iocs (type, value, verdict, source, list_type, last_seen) values
  ('phone', '10086', '安全', '中国移动客服', 'white', now()),
  ('phone', '10010', '安全', '中国联通客服', 'white', now()),
  ('phone', '10000', '安全', '中国电信客服', 'white', now())
on conflict (value) do update
  set list_type = excluded.list_type, verdict = excluded.verdict, source = excluded.source;
