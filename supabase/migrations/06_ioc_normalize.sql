-- 名单归一化：防止同一实体以大小写/空格不同形态重复登记。
--
-- value_norm = lower(btrim(value))  —— 生成列，自动跟随 value 变化
-- 唯一索引保证「同一归一化值」只能存在一条记录（跨名单也唯一，
-- 避免同一实体既在白名单又在黑名单）。

alter table iocs
  add column if not exists value_norm text
  generated always as (lower(btrim(value))) stored;

create unique index if not exists iocs_value_norm_uidx on iocs (value_norm);

comment on column iocs.value_norm is '归一化后的名单值（小写去空格），用于唯一性约束';
