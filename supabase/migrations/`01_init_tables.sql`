-- 开启pgvector向量扩展
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE cases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  category text NOT NULL,
  risk_label text NOT NULL,
  content text NOT NULL,
  source text,
  tags text[],
  embedding vector(1024),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE patterns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,
  category text NOT NULL,
  keywords text[],
  embedding vector(1024),
  created_at timestamptz DEFAULT now()
);

CREATE TABLE iocs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  value text UNIQUE NOT NULL,
  verdict text,
  source text,
  last_seen timestamptz
);
