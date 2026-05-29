-- 034_news_items.sql
-- News feed table. Populated daily by /api/cron/fetch-news from real
-- sources (OpenRouter API, Hugging Face API, Google News RSS).
-- Safe to run multiple times.

CREATE TABLE IF NOT EXISTS news_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category      TEXT NOT NULL,          -- llm-models | hermes | technology | ai | export | tariffs | shipping | forex | compliance
  title         TEXT NOT NULL,
  summary       TEXT DEFAULT '',
  url           TEXT NOT NULL,
  source        TEXT DEFAULT '',        -- e.g. "OpenRouter", "Hugging Face", publisher name
  published_at  TIMESTAMPTZ,
  is_pinned     BOOLEAN DEFAULT false,
  is_read       BOOLEAN DEFAULT false,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT news_items_url_unique UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS idx_news_category    ON news_items(category);
CREATE INDEX IF NOT EXISTS idx_news_published   ON news_items(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_news_created      ON news_items(created_at DESC);

-- RLS
ALTER TABLE news_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "news_select_anon" ON news_items FOR SELECT USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "news_insert_anon" ON news_items FOR INSERT WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "news_update_anon" ON news_items FOR UPDATE USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "news_delete_anon" ON news_items FOR DELETE USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
