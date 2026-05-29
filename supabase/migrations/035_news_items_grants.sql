-- 035_news_items_grants.sql
-- Fix "permission denied for table news_items" on insert/upsert.
-- Migration 034 added RLS policies, but RLS policies only filter rows —
-- the roles still need table-level GRANTs. SELECT was implicitly granted
-- (reads worked), but INSERT/UPDATE/DELETE were not, so the daily news
-- fetch failed with "permission denied for table news_items".
-- Safe to run multiple times.

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE news_items TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE news_items TO authenticated;
GRANT ALL ON TABLE news_items TO service_role;
