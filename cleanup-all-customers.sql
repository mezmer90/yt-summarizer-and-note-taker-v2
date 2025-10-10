-- ============================================
-- CLEANUP ALL CUSTOMER DATA
-- This script removes all customer/subscription data
-- Use this for a fresh start after deleting customers in Stripe
-- ============================================

-- WARNING: This will delete all user subscription data!
-- Users will be downgraded to free tier
-- Run this AFTER you delete all customers in Stripe dashboard

BEGIN;

-- 1. Clear all Stripe-related data from users table
UPDATE users
SET stripe_customer_id = NULL,
    stripe_subscription_id = NULL,
    stripe_price_id = NULL,
    tier = 'free',
    plan_name = NULL,
    subscription_status = NULL,
    subscription_start_date = NULL,
    subscription_end_date = NULL,
    subscription_cancel_at = NULL,
    trial_end_date = NULL,
    updated_at = NOW()
WHERE stripe_customer_id IS NOT NULL;

-- Show how many users were updated
SELECT
    COUNT(*) as users_downgraded_to_free,
    'All Stripe data cleared' as status
FROM users
WHERE tier = 'free';

-- 2. Delete all payment events (optional - keeps history if you comment this out)
-- DELETE FROM payment_events;

-- 3. Show final state
SELECT
    tier,
    COUNT(*) as user_count,
    COUNT(DISTINCT stripe_customer_id) as stripe_customers
FROM users
GROUP BY tier
ORDER BY tier;

COMMIT;

-- ============================================
-- Verification queries (run these after to verify cleanup)
-- ============================================

-- Should show 0 users with Stripe data
SELECT COUNT(*) as users_with_stripe_data
FROM users
WHERE stripe_customer_id IS NOT NULL
   OR stripe_subscription_id IS NOT NULL;

-- Should show all users as free tier
SELECT tier, COUNT(*) as count
FROM users
GROUP BY tier;

-- Show all users (to verify emails are still there)
SELECT
    extension_user_id,
    email,
    tier,
    stripe_customer_id,
    subscription_status,
    created_at
FROM users
ORDER BY created_at DESC
LIMIT 20;
