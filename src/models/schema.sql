-- YouTube Video Summarizer Pro - Database Schema
-- PostgreSQL Database Schema for Admin Control & User Management

-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  extension_user_id VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  tier VARCHAR(50) DEFAULT 'free',
  plan_name VARCHAR(100),
  subscription_status VARCHAR(50) DEFAULT 'active',
  student_verified BOOLEAN DEFAULT false,
  student_verified_at TIMESTAMP,
  student_verification_expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Model Configuration Table (Admin Control)
CREATE TABLE IF NOT EXISTS model_configs (
  id SERIAL PRIMARY KEY,
  tier VARCHAR(50) UNIQUE NOT NULL,
  model_id VARCHAR(100) NOT NULL,
  model_name VARCHAR(100) NOT NULL,
  max_output_tokens INTEGER NOT NULL,
  cost_per_1m_input DECIMAL(10,4),
  cost_per_1m_output DECIMAL(10,4),
  context_window INTEGER,
  is_active BOOLEAN DEFAULT true,
  updated_by VARCHAR(255),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- User Usage Tracking
CREATE TABLE IF NOT EXISTS user_usage (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  extension_user_id VARCHAR(255) NOT NULL,
  date DATE DEFAULT CURRENT_DATE,
  videos_processed INTEGER DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  api_calls INTEGER DEFAULT 0,
  cost_incurred DECIMAL(10,4) DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

-- API Keys (for Managed Plan Backend)
CREATE TABLE IF NOT EXISTS api_keys (
  id SERIAL PRIMARY KEY,
  key_name VARCHAR(100) NOT NULL,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  openrouter_api_key_encrypted TEXT,
  is_active BOOLEAN DEFAULT true,
  usage_limit_daily INTEGER,
  usage_count_today INTEGER DEFAULT 0,
  last_reset TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin Users
CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100),
  role VARCHAR(50) DEFAULT 'admin',
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Admin Actions Log
CREATE TABLE IF NOT EXISTS admin_actions (
  id SERIAL PRIMARY KEY,
  admin_email VARCHAR(255) NOT NULL,
  action VARCHAR(100) NOT NULL,
  target_entity VARCHAR(100),
  target_id INTEGER,
  details JSONB,
  ip_address VARCHAR(50),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Payment Events (synced from ExtensionPay)
CREATE TABLE IF NOT EXISTS payment_events (
  id SERIAL PRIMARY KEY,
  extension_user_id VARCHAR(255) NOT NULL,
  plan_name VARCHAR(100),
  amount INTEGER,
  currency VARCHAR(10),
  status VARCHAR(50),
  extpay_data JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Student Verification Requests
CREATE TABLE IF NOT EXISTS student_verifications (
  id SERIAL PRIMARY KEY,
  extension_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  student_name VARCHAR(255),
  student_id_url TEXT,
  student_id_front_url TEXT,
  student_id_back_url TEXT,
  university_name VARCHAR(255),
  graduation_year INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  email_verified BOOLEAN DEFAULT false,
  verification_token TEXT,
  token_expires_at TIMESTAMP,
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  expires_at TIMESTAMP
);

-- System Settings (Global Config)
CREATE TABLE IF NOT EXISTS system_settings (
  id SERIAL PRIMARY KEY,
  setting_key VARCHAR(100) UNIQUE NOT NULL,
  setting_value TEXT NOT NULL,
  description TEXT,
  updated_by VARCHAR(255),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_users_extension_id ON users(extension_user_id);
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON user_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_extension_id ON user_usage(extension_user_id);
CREATE INDEX IF NOT EXISTS idx_usage_date ON user_usage(date);
CREATE INDEX IF NOT EXISTS idx_payment_events_extension_id ON payment_events(extension_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_actions_admin ON admin_actions(admin_email);
CREATE INDEX IF NOT EXISTS idx_student_verifications_extension_id ON student_verifications(extension_user_id);
CREATE INDEX IF NOT EXISTS idx_student_verifications_status ON student_verifications(status);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_model_configs_updated_at BEFORE UPDATE ON model_configs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert Default Model Configurations
INSERT INTO model_configs (tier, model_id, model_name, max_output_tokens, cost_per_1m_input, cost_per_1m_output, context_window) VALUES
  ('free', 'google/gemini-flash-1.5-8b', 'Gemini Flash 1.5 8B', 8192, 0.0375, 0.15, 1000000),
  ('premium', 'anthropic/claude-3.5-sonnet', 'Claude 3.5 Sonnet', 8192, 3.00, 15.00, 200000),
  ('unlimited', 'anthropic/claude-3-opus', 'Claude 3 Opus', 4096, 15.00, 75.00, 200000),
  ('managed', 'google/gemini-flash-1.5-8b', 'Gemini Flash 1.5 8B', 8192, 0.0375, 0.15, 1000000),
  ('trial', 'google/gemini-flash-1.5-8b', 'Gemini Flash 1.5 8B', 8192, 0.0375, 0.15, 1000000)
ON CONFLICT (tier) DO NOTHING;

-- Insert Default System Settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
  ('require_api_key_for_free', 'true', 'Whether free users must provide their own API key'),
  ('require_api_key_for_premium', 'true', 'Whether premium users must provide their own API key'),
  ('require_api_key_for_unlimited', 'true', 'Whether unlimited users must provide their own API key'),
  ('require_api_key_for_managed', 'false', 'Whether managed users must provide their own API key (we handle it)'),
  ('require_api_key_for_trial', 'false', 'Whether trial users must provide their own API key (we handle it)'),
  ('default_max_video_length_free', '30', 'Max video length in minutes for free tier'),
  ('default_max_video_length_premium', '120', 'Max video length in minutes for premium tier (2 hours)'),
  ('default_max_video_length_unlimited', '999999', 'Max video length in minutes for unlimited tier'),
  ('default_max_video_length_managed', '999999', 'Max video length in minutes for managed tier (unlimited)'),
  ('default_max_video_length_trial', '999999', 'Max video length in minutes for trial tier (unlimited)'),
  ('managed_plan_openrouter_key', '', 'OpenRouter API key for managed plans (backend uses this)')
ON CONFLICT (setting_key) DO NOTHING;

-- View for Admin Dashboard Stats
DROP VIEW IF EXISTS admin_dashboard_stats;

CREATE VIEW admin_dashboard_stats AS
SELECT
  (SELECT COUNT(*) FROM users) as total_users,
  (SELECT COUNT(*) FROM users WHERE tier = 'free') as free_users,
  (SELECT COUNT(*) FROM users WHERE tier = 'premium') as premium_users,
  (SELECT COUNT(*) FROM users WHERE tier = 'unlimited') as unlimited_users,
  (SELECT COUNT(*) FROM users WHERE tier = 'managed') as managed_users,
  (SELECT COUNT(*) FROM users WHERE tier = 'student') as student_users,
  (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '24 hours') as new_users_24h,
  (SELECT COUNT(*) FROM users WHERE created_at > NOW() - INTERVAL '7 days') as new_users_7d,
  (SELECT SUM(videos_processed) FROM user_usage WHERE date = CURRENT_DATE) as videos_today,
  (SELECT SUM(tokens_used) FROM user_usage WHERE date = CURRENT_DATE) as tokens_today,
  (SELECT SUM(cost_incurred) FROM user_usage WHERE date = CURRENT_DATE) as cost_today,
  (SELECT SUM(videos_processed) FROM user_usage WHERE date > CURRENT_DATE - INTERVAL '30 days') as videos_30d,
  (SELECT SUM(cost_incurred) FROM user_usage WHERE date > CURRENT_DATE - INTERVAL '30 days') as cost_30d,
  (SELECT SUM(videos_processed) FROM user_usage) as total_videos,
  (SELECT SUM(cost_incurred) FROM user_usage) as total_cost;

-- View for User Details (includes Stripe information)
DROP VIEW IF EXISTS user_details;

CREATE VIEW user_details AS
SELECT
  u.id,
  u.extension_user_id,
  u.email,
  u.tier,
  u.plan_name,
  u.subscription_status,
  u.stripe_customer_id,
  u.stripe_subscription_id,
  u.stripe_price_id,
  u.subscription_start_date,
  u.subscription_end_date,
  u.subscription_cancel_at,
  u.trial_end_date,
  mc.model_name as assigned_model,
  mc.model_id,
  COALESCE(SUM(uu.videos_processed), 0) as total_videos,
  COALESCE(SUM(uu.tokens_used), 0) as total_tokens,
  COALESCE(SUM(uu.cost_incurred), 0) as total_cost,
  u.created_at,
  u.updated_at
FROM users u
LEFT JOIN model_configs mc ON u.tier = mc.tier
LEFT JOIN user_usage uu ON u.id = uu.user_id
GROUP BY u.id, mc.model_name, mc.model_id;
