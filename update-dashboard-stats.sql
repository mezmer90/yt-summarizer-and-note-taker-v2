-- Update admin_dashboard_stats view to include total video and cost stats
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
