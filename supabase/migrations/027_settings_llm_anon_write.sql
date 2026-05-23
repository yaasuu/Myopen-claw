-- Allow dashboard (anon role) to update llm_config in settings table
-- Scoped to only the llm_config key for safety
CREATE POLICY "settings_llm_write_anon"
  ON settings
  FOR UPDATE
  USING (key = 'llm_config')
  WITH CHECK (key = 'llm_config');
