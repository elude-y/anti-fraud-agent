-- 话术模式向量检索函数：供 src/lib/db/patterns.ts 的 vectorSearchPatterns 通过 RPC 调用。
-- 与 match_cases 同构，只是返回 patterns 表字段（含 keywords）。

create or replace function match_patterns(
  query_embedding vector(1024),
  match_count int default 3
)
returns table (
  id uuid,
  pattern text,
  category text,
  keywords text[],
  similarity double precision
)
language sql
stable
as $$
  select
    p.id,
    p.pattern,
    p.category,
    p.keywords,
    (1 - (p.embedding <=> query_embedding))::double precision as similarity
  from patterns p
  where p.embedding is not null
  order by p.embedding <=> query_embedding
  limit match_count;
$$;

create index if not exists patterns_embedding_hnsw_idx
  on patterns using hnsw (embedding vector_cosine_ops);
