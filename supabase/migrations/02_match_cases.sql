-- 向量相似度检索函数：供 src/lib/db/cases.ts 的 vectorSearchCases 通过 RPC 调用。
-- 原因：PostgREST 的 select 不支持 `1 - (embedding <=> $1)` 这类 SQL 表达式，
-- 必须把相似度计算下沉到数据库函数，再用 supabase.rpc() 调用。

create or replace function match_cases(
  query_embedding vector(1024),
  match_count int default 5
)
returns table (
  id uuid,
  title text,
  category text,
  risk_label text,
  content text,
  source text,
  similarity double precision
)
language sql
stable
as $$
  select
    c.id,
    c.title,
    c.category,
    c.risk_label,
    c.content,
    c.source,
    (1 - (c.embedding <=> query_embedding))::double precision as similarity
  from cases c
  where c.embedding is not null
  order by c.embedding <=> query_embedding
  limit match_count;
$$;

-- HNSW 索引：向量检索加速。57 条时顺序扫描也够快，这个索引是为数据量增长准备的。
create index if not exists cases_embedding_hnsw_idx
  on cases using hnsw (embedding vector_cosine_ops);
