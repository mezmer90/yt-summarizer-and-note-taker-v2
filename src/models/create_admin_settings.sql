-- Create admin_settings table for configurable settings
-- This table stores various admin-configurable settings including AI verification prompt

CREATE TABLE IF NOT EXISTS admin_settings (
  id SERIAL PRIMARY KEY,
  ai_verification_prompt TEXT,
  openrouter_api_key TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Insert default row if not exists
INSERT INTO admin_settings (id, ai_verification_prompt, openrouter_api_key)
SELECT 1, NULL, NULL
WHERE NOT EXISTS (SELECT 1 FROM admin_settings WHERE id = 1);
