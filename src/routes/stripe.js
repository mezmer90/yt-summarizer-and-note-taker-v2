// Stripe Routes for YouTube Summarizer Pro v8.0
// Handles checkout, subscription management, and webhooks

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  stripe,
  STRIPE_PRICES,
  PRICE_TO_TIER,
  PRICE_TO_PLAN_NAME,
  isBYOKPlan,
  isManagedPlan,
  isStudentPlan,
  isLifetimePlan,
  getTrialConfig
} = require('../config/stripe');

// ============================================
// ENDPOINT 1: Register User (Subscribe to Free Plan)
// ============================================
router.post('/register', async (req, res) => {
  try {
    const { extensionUserId, email } = req.body;

    if (!extensionUserId) {
      return res.status(400).json({
        success: false,
        error: 'Extension user ID is required'
      });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id, stripe_customer_id, stripe_subscription_id FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    if (existingUser.rows.length > 0 && existingUser.rows[0].stripe_subscription_id) {
      // User already has a subscription
      return res.json({
        success: true,
        message: 'User already registered',
        alreadyRegistered: true
      });
    }

    let customerId = existingUser.rows[0]?.stripe_customer_id;

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email,
        metadata: {
          extension_user_id: extensionUserId
        }
      });
      customerId = customer.id;
    }

    // Create Free Plan subscription ($0/month)
    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [
        {
          price: STRIPE_PRICES.free_plan
        }
      ],
      metadata: {
        extension_user_id: extensionUserId,
        plan_type: 'free'
      }
    });

    // Create or update user in database
    if (existingUser.rows.length > 0) {
      await pool.query(
        `UPDATE users
         SET stripe_customer_id = $1,
             stripe_subscription_id = $2,
             stripe_price_id = $3,
             tier = 'free',
             plan_name = 'Free Plan',
             subscription_status = $4,
             subscription_start_date = NOW(),
             email = COALESCE($5, email),
             updated_at = NOW()
         WHERE extension_user_id = $6`,
        [customerId, subscription.id, STRIPE_PRICES.free_plan, subscription.status, email, extensionUserId]
      );
    } else {
      await pool.query(
        `INSERT INTO users (
          extension_user_id, email, stripe_customer_id, stripe_subscription_id,
          stripe_price_id, tier, plan_name, subscription_status, subscription_start_date
         )
         VALUES ($1, $2, $3, $4, $5, 'free', 'Free Plan', $6, NOW())`,
        [extensionUserId, email, customerId, subscription.id, STRIPE_PRICES.free_plan, subscription.status]
      );
    }

    console.log(`✅ User registered with Free Plan: ${extensionUserId}`);

    res.json({
      success: true,
      message: 'Successfully registered with Free Plan',
      subscription: {
        id: subscription.id,
        status: subscription.status
      }
    });

  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT 2: Create Checkout Session
// ============================================
router.post('/create-checkout', async (req, res) => {
  try {
    const { priceId, extensionUserId, email, successUrl, cancelUrl } = req.body;

    // Validation
    if (!priceId || !extensionUserId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: priceId and extensionUserId are required'
      });
    }

    // Check if this is a student plan
    if (isStudentPlan(priceId)) {
      // Verify student status
      const studentCheck = await pool.query(
        `SELECT id, status FROM student_verifications
         WHERE extension_user_id = $1 AND status = 'approved'
         AND (expires_at IS NULL OR expires_at > NOW())
         LIMIT 1`,
        [extensionUserId]
      );

      if (studentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Student verification required. Please verify your student status first.'
        });
      }
    }

    // Check if user already has a Stripe customer ID
    const userResult = await pool.query(
      'SELECT id, stripe_customer_id, email FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    let customerId;

    if (userResult.rows.length > 0 && userResult.rows[0].stripe_customer_id) {
      // Use existing customer
      customerId = userResult.rows[0].stripe_customer_id;
    } else {
      // Create new Stripe customer
      const customer = await stripe.customers.create({
        email: email || userResult.rows[0]?.email,
        metadata: {
          extension_user_id: extensionUserId
        }
      });
      customerId = customer.id;

      // Update user with customer ID
      if (userResult.rows.length > 0) {
        await pool.query(
          'UPDATE users SET stripe_customer_id = $1 WHERE extension_user_id = $2',
          [customerId, extensionUserId]
        );
      } else {
        // Create new user
        await pool.query(
          `INSERT INTO users (extension_user_id, email, stripe_customer_id, tier)
           VALUES ($1, $2, $3, 'free')`,
          [extensionUserId, email, customerId]
        );
      }
    }

    // Get trial configuration
    const trialConfig = getTrialConfig(priceId);

    // Build checkout session parameters
    const sessionParams = {
      customer: customerId,
      mode: isLifetimePlan(priceId) ? 'payment' : 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      success_url: successUrl || `${process.env.FRONTEND_URL || 'https://yt-summarizer-and-note-taker-production.up.railway.app'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'https://yt-summarizer-and-note-taker-production.up.railway.app'}/pricing`,
      metadata: {
        extension_user_id: extensionUserId,
        price_id: priceId
      }
    };

    // Add trial configuration for managed monthly
    if (trialConfig.hasTrial && sessionParams.mode === 'subscription') {
      // For $1 trial: Create subscription with trial, add $1 invoice item
      sessionParams.subscription_data = {
        trial_period_days: trialConfig.trialPeriodDays,
        metadata: {
          extension_user_id: extensionUserId,
          has_trial: 'true'
        }
      };

      // Add $1 trial fee as invoice item
      sessionParams.invoice_creation = {
        enabled: true,
        invoice_data: {
          description: '14-day trial for $1'
        }
      };

      sessionParams.line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Trial Period',
            description: '14-day trial access'
          },
          unit_amount: trialConfig.trialAmount // $1 in cents
        },
        quantity: 1
      });
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url
    });

  } catch (error) {
    console.error('Checkout session creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT 2: Change Subscription
// ============================================
router.post('/change-subscription', async (req, res) => {
  try {
    const { extensionUserId, newPriceId } = req.body;

    if (!extensionUserId || !newPriceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: extensionUserId and newPriceId'
      });
    }

    // Check if new price is a student plan
    if (isStudentPlan(newPriceId)) {
      const studentCheck = await pool.query(
        `SELECT id FROM student_verifications
         WHERE extension_user_id = $1 AND status = 'approved'
         AND (expires_at IS NULL OR expires_at > NOW())`,
        [extensionUserId]
      );

      if (studentCheck.rows.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Student verification required for this plan'
        });
      }
    }

    // Get user's current subscription
    const userResult = await pool.query(
      'SELECT stripe_subscription_id, stripe_customer_id FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].stripe_subscription_id) {
      return res.status(404).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    const subscriptionId = userResult.rows[0].stripe_subscription_id;

    // Retrieve the subscription from Stripe
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update subscription with new price (with proration)
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId
        }
      ],
      proration_behavior: 'create_prorations', // Enable proration
      metadata: {
        extension_user_id: extensionUserId,
        changed_at: new Date().toISOString()
      }
    });

    // Update database
    const newTier = PRICE_TO_TIER[newPriceId];
    const newPlanName = PRICE_TO_PLAN_NAME[newPriceId];

    await pool.query(
      `UPDATE users
       SET tier = $1, plan_name = $2, stripe_price_id = $3, updated_at = NOW()
       WHERE extension_user_id = $4`,
      [newTier, newPlanName, newPriceId, extensionUserId]
    );

    res.json({
      success: true,
      subscription: updatedSubscription,
      message: `Successfully changed to ${newPlanName}`
    });

  } catch (error) {
    console.error('Change subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT 3: Cancel Subscription
// ============================================
router.post('/cancel-subscription', async (req, res) => {
  try {
    const { extensionUserId, immediate } = req.body;

    if (!extensionUserId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: extensionUserId'
      });
    }

    // Get user's subscription
    const userResult = await pool.query(
      'SELECT stripe_subscription_id FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].stripe_subscription_id) {
      return res.status(404).json({
        success: false,
        error: 'No active subscription found'
      });
    }

    const subscriptionId = userResult.rows[0].stripe_subscription_id;

    let canceledSubscription;

    if (immediate) {
      // Cancel immediately
      canceledSubscription = await stripe.subscriptions.cancel(subscriptionId);

      // Update database
      await pool.query(
        `UPDATE users
         SET subscription_status = 'canceled',
             tier = 'free',
             subscription_end_date = NOW(),
             updated_at = NOW()
         WHERE extension_user_id = $1`,
        [extensionUserId]
      );
    } else {
      // Cancel at period end (user keeps access until billing period ends)
      canceledSubscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: true
      });

      // Update database
      await pool.query(
        `UPDATE users
         SET subscription_cancel_at = $1, updated_at = NOW()
         WHERE extension_user_id = $2`,
        [new Date(canceledSubscription.current_period_end * 1000), extensionUserId]
      );
    }

    res.json({
      success: true,
      subscription: canceledSubscription,
      message: immediate
        ? 'Subscription canceled immediately'
        : 'Subscription will cancel at the end of the billing period'
    });

  } catch (error) {
    console.error('Cancel subscription error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT 4: Get Subscription Status
// ============================================
router.get('/subscription-status/:extensionUserId', async (req, res) => {
  try {
    const { extensionUserId } = req.params;

    const result = await pool.query(
      `SELECT
        tier, plan_name, subscription_status,
        stripe_subscription_id, stripe_price_id,
        subscription_start_date, subscription_end_date,
        subscription_cancel_at, trial_end_date
       FROM users
       WHERE extension_user_id = $1`,
      [extensionUserId]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        tier: 'free',
        subscription: null
      });
    }

    const user = result.rows[0];

    // If they have a subscription ID, fetch latest from Stripe
    if (user.stripe_subscription_id) {
      try {
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);

        return res.json({
          success: true,
          tier: user.tier,
          planName: user.plan_name,
          subscription: {
            id: subscription.id,
            status: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            trialEnd: subscription.trial_end ? new Date(subscription.trial_end * 1000) : null,
            priceId: user.stripe_price_id
          }
        });
      } catch (stripeError) {
        console.error('Error fetching subscription from Stripe:', stripeError);
        // Fall back to database data
      }
    }

    res.json({
      success: true,
      tier: user.tier,
      planName: user.plan_name,
      subscription: user.stripe_subscription_id ? {
        status: user.subscription_status,
        cancelAt: user.subscription_cancel_at,
        endDate: user.subscription_end_date
      } : null
    });

  } catch (error) {
    console.error('Get subscription status error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT 5: Create Customer Portal Session
// ============================================
router.post('/create-portal-session', async (req, res) => {
  try {
    const { extensionUserId, returnUrl } = req.body;

    if (!extensionUserId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: extensionUserId'
      });
    }

    // Get user's Stripe customer ID
    const userResult = await pool.query(
      'SELECT stripe_customer_id FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    if (userResult.rows.length === 0 || !userResult.rows[0].stripe_customer_id) {
      return res.status(404).json({
        success: false,
        error: 'No customer found. Please subscribe to a plan first.'
      });
    }

    const customerId = userResult.rows[0].stripe_customer_id;

    // Create Stripe Customer Portal session
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: returnUrl || `${process.env.FRONTEND_URL || 'https://yt-summarizer-and-note-taker-production.up.railway.app'}/pricing`
    });

    res.json({
      success: true,
      url: session.url
    });

  } catch (error) {
    console.error('Customer Portal session creation error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT 6: Upgrade to Lifetime (with automatic refund)
// ============================================
router.post('/upgrade-to-lifetime', async (req, res) => {
  try {
    const { extensionUserId, email, successUrl, cancelUrl } = req.body;

    if (!extensionUserId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: extensionUserId'
      });
    }

    // Get user's current subscription and customer info
    const userResult = await pool.query(
      `SELECT id, stripe_customer_id, stripe_subscription_id, email
       FROM users WHERE extension_user_id = $1`,
      [extensionUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    const user = userResult.rows[0];
    let proratedCredit = 0;
    let customerId = user.stripe_customer_id;

    // If user has active subscription, calculate proration and cancel it
    if (user.stripe_subscription_id) {
      try {
        // Retrieve subscription to calculate proration
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);

        if (subscription.status === 'active' || subscription.status === 'trialing') {
          // Calculate prorated refund amount
          const now = Math.floor(Date.now() / 1000);
          const periodEnd = subscription.current_period_end;
          const periodStart = subscription.current_period_start;
          const totalPeriod = periodEnd - periodStart;
          const remainingTime = periodEnd - now;

          // Get the price amount from the subscription
          const priceAmount = subscription.items.data[0].price.unit_amount; // in cents

          // Calculate prorated credit
          proratedCredit = Math.floor((priceAmount * remainingTime) / totalPeriod);

          console.log('Proration calculation:', {
            priceAmount,
            totalPeriod,
            remainingTime,
            proratedCredit
          });

          // Cancel subscription immediately and issue refund
          await stripe.subscriptions.cancel(user.stripe_subscription_id, {
            prorate: true, // This triggers automatic prorated refund
            invoice_now: true
          });

          // Update database - subscription canceled
          await pool.query(
            `UPDATE users
             SET subscription_status = 'canceled',
                 subscription_end_date = NOW(),
                 updated_at = NOW()
             WHERE extension_user_id = $1`,
            [extensionUserId]
          );

          console.log(`Canceled subscription ${user.stripe_subscription_id} with prorated refund: $${(proratedCredit / 100).toFixed(2)}`);
        }
      } catch (subError) {
        console.error('Error canceling subscription:', subError);
        // Continue anyway - we'll still create the lifetime checkout
      }
    }

    // Create Stripe customer if doesn't exist
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: email || user.email,
        metadata: {
          extension_user_id: extensionUserId
        }
      });
      customerId = customer.id;

      await pool.query(
        'UPDATE users SET stripe_customer_id = $1 WHERE extension_user_id = $2',
        [customerId, extensionUserId]
      );
    }

    // Build checkout session for Lifetime plan
    const lifetimePriceId = STRIPE_PRICES.byok_lifetime;
    const sessionParams = {
      customer: customerId,
      mode: 'payment',
      line_items: [
        {
          price: lifetimePriceId,
          quantity: 1
        }
      ],
      success_url: successUrl || `${process.env.FRONTEND_URL || 'https://yt-summarizer-and-note-taker-production.up.railway.app'}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `${process.env.FRONTEND_URL || 'https://yt-summarizer-and-note-taker-production.up.railway.app'}/pricing`,
      metadata: {
        extension_user_id: extensionUserId,
        price_id: lifetimePriceId,
        upgraded_from_subscription: user.stripe_subscription_id ? 'true' : 'false',
        prorated_credit: proratedCredit.toString()
      }
    };

    // If there's a prorated credit, apply it as a discount
    if (proratedCredit > 0) {
      // Create a one-time coupon for this specific purchase
      const coupon = await stripe.coupons.create({
        amount_off: proratedCredit,
        currency: 'usd',
        duration: 'once',
        name: `Prorated Credit from Previous Subscription`,
        metadata: {
          extension_user_id: extensionUserId,
          original_subscription: user.stripe_subscription_id
        }
      });

      sessionParams.discounts = [
        {
          coupon: coupon.id
        }
      ];

      console.log(`Created coupon ${coupon.id} for $${(proratedCredit / 100).toFixed(2)} credit`);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      proratedCredit: proratedCredit,
      message: proratedCredit > 0
        ? `Your previous subscription has been canceled. You'll receive a $${(proratedCredit / 100).toFixed(2)} refund to your card, and a $${(proratedCredit / 100).toFixed(2)} discount has been applied to your Lifetime purchase.`
        : 'Proceeding to Lifetime checkout.'
    });

  } catch (error) {
    console.error('Upgrade to Lifetime error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

module.exports = router;
