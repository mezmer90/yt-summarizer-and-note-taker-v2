-- Update user_details view to include Stripe information
-- Run this to update the view with Stripe fields

-- Drop the old view first to avoid column conflicts
DROP VIEW IF EXISTS user_details;

-- Create new view with all fields including Stripe data
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
