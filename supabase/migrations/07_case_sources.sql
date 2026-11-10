-- 案例字段规范化（对应《修改建议》第 1 条）：
--   每条案例应包含 诈骗类型、诈骗话术、主要风险特征、案例来源、发布时间、防范建议
--
-- 现有字段：title / category(=诈骗类型) / content(=话术描述) / risk_label / tags / source
-- 本次补齐：source_url（官方或新闻链接）、source_title、published_at、
--           source_kind（official/media/seed，标明来源可信度）、
--           risk_features（风险特征）、prevention（防范建议）、script_text（话术文本）

alter table cases add column if not exists source_url    text;
alter table cases add column if not exists source_title  text;
alter table cases add column if not exists published_at  date;
alter table cases add column if not exists source_kind   text;
alter table cases add column if not exists risk_features text[];
alter table cases add column if not exists prevention    text;
alter table cases add column if not exists script_text   text;

alter table cases drop constraint if exists cases_source_kind_check;
alter table cases add constraint cases_source_kind_check
  check (source_kind is null or source_kind in ('official', 'media', 'seed'));

comment on column cases.source_url    is '官方通报或新闻报道链接';
comment on column cases.source_kind   is 'official=官方通报 media=媒体报道 seed=自建种子';
comment on column cases.risk_features is '主要风险特征关键词';
comment on column cases.prevention    is '防范建议';
comment on column cases.script_text   is '诈骗话术文本（案例正文的描述性话术）';
