-- Add Stripe fields to users table
-- Migration for Stripe integration in v8.0

ALTER TABLE users
ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS stripe_price_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS subscription_start_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS subscription_end_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS subscription_cancel_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS trial_end_date TIMESTAMP,
ADD COLUMN IF NOT EXISTS payment_method_id VARCHAR(255);

-- Add indexes for Stripe fields
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_users_stripe_subscription ON users(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON users(subscription_status);

-- Update subscription_status to use more Stripe-friendly values
-- existing values: 'active' (default)
-- new values: 'active', 'canceled', 'past_due', 'unpaid', 'trialing', 'incomplete'

COMMENT ON COLUMN users.stripe_customer_id IS 'Stripe customer ID (cus_xxx)';
COMMENT ON COLUMN users.stripe_subscription_id IS 'Stripe subscription ID (sub_xxx)';
COMMENT ON COLUMN users.stripe_price_id IS 'Stripe price ID for the subscribed plan';
COMMENT ON COLUMN users.subscription_start_date IS 'When the subscription started';
COMMENT ON COLUMN users.subscription_end_date IS 'When the subscription ends (for canceled subscriptions)';
COMMENT ON COLUMN users.subscription_cancel_at IS 'Scheduled cancellation date';
COMMENT ON COLUMN users.trial_end_date IS 'When trial period ends';
COMMENT ON COLUMN users.payment_method_id IS 'Stripe payment method ID (pm_xxx)';
