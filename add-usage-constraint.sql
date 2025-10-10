-- Add unique constraint to user_usage table for (user_id, date)
-- This is required for the ON CONFLICT clause in trackUsageAsync to work

ALTER TABLE user_usage ADD CONSTRAINT user_usage_user_date_unique UNIQUE (user_id, date);
