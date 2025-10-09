-- Update database views to include all user tier stats and Stripe information
-- Run this to update the views with all fields

-- Update admin dashboard stats view to include student users
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
  (SELECT COALESCE(SUM(ai_cost), 0) FROM student_verifications WHERE ai_verified_at >= CURRENT_DATE) as ai_cost_today,
  (SELECT COALESCE(SUM(ai_cost), 0) FROM student_verifications WHERE ai_verified_at >= CURRENT_DATE - INTERVAL '30 days') as ai_cost_30d,
  (SELECT COUNT(*) FROM student_verifications WHERE ai_status = 'approved' AND ai_verified_at >= CURRENT_DATE) as ai_approved_today,
  (SELECT COUNT(*) FROM student_verifications WHERE ai_verified_at >= CURRENT_DATE) as ai_verifications_today;

-- Drop the old user_details view first to avoid column conflicts
DROP VIEW IF EXISTS user_details;

-- Create new user_details view with all fields including Stripe data and student verification
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
  u.student_verified,
  u.student_verified_at,
  u.student_verification_expires_at,
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
