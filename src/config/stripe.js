// Stripe Configuration for YouTube Summarizer Pro v8.0
// Handles all Stripe-related configuration and price mappings

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Stripe Price IDs (Customer Portal - Separate Products)
const STRIPE_PRICES = {
  // Free Plan
  free_plan: process.env.STRIPE_PRICE_FREE_PLAN || 'price_1SFtGuSEC06Y8mAjEPUHZIkd',

  // BYOK Prices
  byok_premium_yearly: process.env.STRIPE_PRICE_BYOK_PREMIUM || 'price_1SFqZbSEC06Y8mAj7VrCPBaZ',
  byok_unlimited_yearly: process.env.STRIPE_PRICE_BYOK_UNLIMITED || 'price_1SFqaFSEC06Y8mAjeMdV3v9X',
  byok_lifetime: process.env.STRIPE_PRICE_BYOK_LIFETIME || 'price_1SFqamSEC06Y8mAjmE94GJMI',

  // Managed Prices
  managed_monthly: process.env.STRIPE_PRICE_MANAGED_MONTHLY || 'price_1SFqbRSEC06Y8mAjmdQa5KuI',
  managed_annual: process.env.STRIPE_PRICE_MANAGED_ANNUAL || 'price_1SFqbwSEC06Y8mAjBVToL29F',

  // Student Prices
  student_premium_byok: process.env.STRIPE_PRICE_STUDENT_PREMIUM || 'price_1SFqcRSEC06Y8mAjWiOxN2L4',
  student_unlimited_byok: process.env.STRIPE_PRICE_STUDENT_UNLIMITED || 'price_1SFqcvSEC06Y8mAj2iYzz9O9',
  student_monthly_managed: process.env.STRIPE_PRICE_STUDENT_MONTHLY || 'price_1SFqdRSEC06Y8mAjDmaVPtyN',
  student_annual_managed: process.env.STRIPE_PRICE_STUDENT_ANNUAL || 'price_1SFqe2SEC06Y8mAjIsvrQ1G1'
};

// Price to tier mapping (for updating user tier after payment)
const PRICE_TO_TIER = {
  [STRIPE_PRICES.free_plan]: 'free',
  [STRIPE_PRICES.byok_premium_yearly]: 'premium',
  [STRIPE_PRICES.byok_unlimited_yearly]: 'unlimited',
  [STRIPE_PRICES.byok_lifetime]: 'unlimited',
  [STRIPE_PRICES.managed_monthly]: 'managed',
  [STRIPE_PRICES.managed_annual]: 'managed',
  [STRIPE_PRICES.student_premium_byok]: 'premium',
  [STRIPE_PRICES.student_unlimited_byok]: 'unlimited',
  [STRIPE_PRICES.student_monthly_managed]: 'managed',
  [STRIPE_PRICES.student_annual_managed]: 'managed'
};

// Price to plan name mapping (for user table)
const PRICE_TO_PLAN_NAME = {
  [STRIPE_PRICES.free_plan]: 'Free Plan',
  [STRIPE_PRICES.byok_premium_yearly]: 'Premium - BYOK (Annual)',
  [STRIPE_PRICES.byok_unlimited_yearly]: 'Unlimited - BYOK (Annual)',
  [STRIPE_PRICES.byok_lifetime]: 'Lifetime - BYOK',
  [STRIPE_PRICES.managed_monthly]: 'Monthly - Managed',
  [STRIPE_PRICES.managed_annual]: 'Annual - Managed',
  [STRIPE_PRICES.student_premium_byok]: 'Student Premium - BYOK',
  [STRIPE_PRICES.student_unlimited_byok]: 'Student Unlimited - BYOK',
  [STRIPE_PRICES.student_monthly_managed]: 'Student Monthly - Managed',
  [STRIPE_PRICES.student_annual_managed]: 'Student Annual - Managed'
};

// Check if a price ID is BYOK (user needs own API key)
function isBYOKPlan(priceId) {
  return [
    STRIPE_PRICES.byok_premium_yearly,
    STRIPE_PRICES.byok_unlimited_yearly,
    STRIPE_PRICES.byok_lifetime,
    STRIPE_PRICES.student_premium_byok,
    STRIPE_PRICES.student_unlimited_byok
  ].includes(priceId);
}

// Check if a price ID is Managed (we provide API access)
function isManagedPlan(priceId) {
  return [
    STRIPE_PRICES.managed_monthly,
    STRIPE_PRICES.managed_annual,
    STRIPE_PRICES.student_monthly_managed,
    STRIPE_PRICES.student_annual_managed
  ].includes(priceId);
}

// Check if a price ID is a student plan
function isStudentPlan(priceId) {
  return [
    STRIPE_PRICES.student_premium_byok,
    STRIPE_PRICES.student_unlimited_byok,
    STRIPE_PRICES.student_monthly_managed,
    STRIPE_PRICES.student_annual_managed
  ].includes(priceId);
}

// Check if price is one-time payment (lifetime)
function isLifetimePlan(priceId) {
  return priceId === STRIPE_PRICES.byok_lifetime;
}

// Get trial configuration for managed monthly plan
function getTrialConfig(priceId) {
  // Only managed monthly gets $1 trial
  if (priceId === STRIPE_PRICES.managed_monthly) {
    return {
      hasTrial: true,
      trialPeriodDays: 14,
      trialAmount: 100 // $1 in cents
    };
  }
  return {
    hasTrial: false,
    trialPeriodDays: 0,
    trialAmount: 0
  };
}

module.exports = {
  stripe,
  STRIPE_PRICES,
  PRICE_TO_TIER,
  PRICE_TO_PLAN_NAME,
  isBYOKPlan,
  isManagedPlan,
  isStudentPlan,
  isLifetimePlan,
  getTrialConfig
};
