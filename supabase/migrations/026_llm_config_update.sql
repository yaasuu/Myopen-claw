-- Update llm_config to current Gemini 2.5 Flash model
UPDATE settings
SET
  value = jsonb_set(
    jsonb_set(
      jsonb_set(value, '{model}',         '"gemini-2.5-flash"'),
      '{provider}',                        '"google"'
    ),
    '{fallbackModel}',                     '"openai/gpt-oss-120b:free"'
  ),
  updated_by  = 'system',
  updated_at  = NOW()
WHERE key = 'llm_config';
