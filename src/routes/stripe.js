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

const {
  generateVerificationCode,
  sendEmailVerificationCode
} = require('../services/emailService');

// ============================================
// ENDPOINT 1: Send Verification Code
// ============================================
router.post('/send-verification-code', async (req, res) => {
  try {
    const { extensionUserId, email } = req.body;

    if (!extensionUserId || !email) {
      return res.status(400).json({
        success: false,
        error: 'Extension user ID and email are required'
      });
    }

    // Validate email format
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }

    // Check if user already has a subscription
    const existingUser = await pool.query(
      'SELECT id, stripe_subscription_id FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    if (existingUser.rows.length > 0 && existingUser.rows[0].stripe_subscription_id) {
      return res.json({
        success: true,
        message: 'User already registered',
        alreadyRegistered: true
      });
    }

    // Generate 6-digit code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete any existing verification for this user
    await pool.query(
      'DELETE FROM email_verifications WHERE extension_user_id = $1',
      [extensionUserId]
    );

    // Store verification code
    await pool.query(
      `INSERT INTO email_verifications (extension_user_id, email, verification_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [extensionUserId, email, verificationCode, expiresAt]
    );

    // Send email
    const emailResult = await sendEmailVerificationCode(email, verificationCode);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send verification email. Please try again.'
      });
    }

    console.log(`✅ Verification code sent to ${email}: ${verificationCode}`);

    res.json({
      success: true,
      message: 'Verification code sent to your email',
      expiresIn: 600 // 10 minutes in seconds
    });

  } catch (error) {
    console.error('Send verification code error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// ENDPOINT 2: Verify Code and Register
// ============================================
router.post('/verify-code', async (req, res) => {
  try {
    const { extensionUserId, code } = req.body;

    if (!extensionUserId || !code) {
      return res.status(400).json({
        success: false,
        error: 'Extension user ID and verification code are required'
      });
    }

    // Get verification record
    const verification = await pool.query(
      `SELECT * FROM email_verifications
       WHERE extension_user_id = $1 AND verified = FALSE`,
      [extensionUserId]
    );

    if (verification.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No verification request found. Please request a new code.'
      });
    }

    const record = verification.rows[0];

    // Check if expired
    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({
        success: false,
        error: 'Verification code expired. Please request a new code.'
      });
    }

    // Check attempts
    if (record.attempts >= 5) {
      return res.status(400).json({
        success: false,
        error: 'Too many failed attempts. Please request a new code.'
      });
    }

    // Verify code
    if (record.verification_code !== code) {
      // Increment attempts
      await pool.query(
        'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1',
        [record.id]
      );

      return res.status(400).json({
        success: false,
        error: 'Invalid verification code. Please try again.',
        attemptsLeft: 5 - (record.attempts + 1)
      });
    }

    // Code is correct! Mark as verified
    await pool.query(
      'UPDATE email_verifications SET verified = TRUE WHERE id = $1',
      [record.id]
    );

    // Now create the Free Plan subscription
    const email = record.email;

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT id, stripe_customer_id FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    let customerId = existingUser.rows[0]?.stripe_customer_id;

    // Verify customer exists in Stripe, create new one if not
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (error) {
        // Customer doesn't exist in Stripe anymore, create new one
        console.log(`Customer ${customerId} not found in Stripe, creating new customer`);
        customerId = null;
      }
    }

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
             email = $5,
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

    console.log(`✅ User registered with Free Plan after verification: ${extensionUserId}`);

    res.json({
      success: true,
      message: 'Email verified! Free Plan activated.',
      subscription: {
        id: subscription.id,
        status: subscription.status
      }
    });

  } catch (error) {
    console.error('Verification error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// ============================================
// PRICE IDs ENDPOINT (for frontend)
// ============================================
router.get('/price-ids', async (req, res) => {
  try {
    res.json({
      success: true,
      prices: {
        free_plan: STRIPE_PRICES.free_plan,
        byok_premium_yearly: STRIPE_PRICES.byok_premium_yearly,
        byok_unlimited_yearly: STRIPE_PRICES.byok_unlimited_yearly,
        byok_lifetime: STRIPE_PRICES.byok_lifetime,
        managed_monthly: STRIPE_PRICES.managed_monthly,
        managed_annual: STRIPE_PRICES.managed_annual,
        student_premium_byok: STRIPE_PRICES.student_premium_byok,
        student_unlimited_byok: STRIPE_PRICES.student_unlimited_byok,
        student_monthly_managed: STRIPE_PRICES.student_monthly_managed,
        student_annual_managed: STRIPE_PRICES.student_annual_managed
      }
    });
  } catch (error) {
    console.error('Get price IDs error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================
// LOGIN ENDPOINTS (for existing customers)
// ============================================

// Send login verification code
router.post('/send-login-code', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        error: 'Email is required'
      });
    }

    // Check if user exists by email
    const existingUser = await pool.query(
      'SELECT extension_user_id, email FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No account found with this email. Please sign up first.'
      });
    }

    const extensionUserId = existingUser.rows[0].extension_user_id;

    // Generate 6-digit code
    const verificationCode = generateVerificationCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    // Delete existing verification for this user
    await pool.query(
      'DELETE FROM email_verifications WHERE extension_user_id = $1',
      [extensionUserId]
    );

    // Store verification code
    await pool.query(
      `INSERT INTO email_verifications (extension_user_id, email, verification_code, expires_at)
       VALUES ($1, $2, $3, $4)`,
      [extensionUserId, email, verificationCode, expiresAt]
    );

    // Send email
    const emailResult = await sendEmailVerificationCode(email, verificationCode);

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        error: 'Failed to send login code. Please try again.'
      });
    }

    res.json({
      success: true,
      message: 'Login code sent to your email',
      expiresIn: 600
    });

  } catch (error) {
    console.error('Send login code error:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Verify login code and restore account
router.post('/verify-login-code', async (req, res) => {
  try {
    const { email, code } = req.body;

    // Get verification record by email
    const verification = await pool.query(
      `SELECT * FROM email_verifications
       WHERE email = $1 AND verified = FALSE`,
      [email]
    );

    if (verification.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'No login request found. Please request a new code.'
      });
    }

    const record = verification.rows[0];

    // Check expiration
    if (new Date() > new Date(record.expires_at)) {
      return res.status(400).json({
        success: false,
        error: 'Login code expired. Please request a new code.'
      });
    }

    // Check attempts (max 5)
    if (record.attempts >= 5) {
      return res.status(400).json({
        success: false,
        error: 'Too many failed attempts. Please request a new code.'
      });
    }

    // Verify code
    if (record.verification_code !== code) {
      await pool.query(
        'UPDATE email_verifications SET attempts = attempts + 1 WHERE id = $1',
        [record.id]
      );

      return res.status(400).json({
        success: false,
        error: 'Invalid login code. Please try again.',
        attemptsLeft: 5 - (record.attempts + 1)
      });
    }

    // Code correct! Mark as verified
    await pool.query(
      'UPDATE email_verifications SET verified = TRUE WHERE id = $1',
      [record.id]
    );

    // Get user's subscription data
    const user = await pool.query(
      `SELECT extension_user_id, email, stripe_customer_id, stripe_subscription_id,
              tier, plan_name, subscription_status, subscription_start_date
       FROM users
       WHERE extension_user_id = $1`,
      [record.extension_user_id]
    );

    if (user.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'User account not found'
      });
    }

    const userData = user.rows[0];

    res.json({
      success: true,
      message: 'Login successful! Account restored.',
      user: {
        extensionUserId: userData.extension_user_id,
        email: userData.email,
        tier: userData.tier,
        planName: userData.plan_name,
        subscriptionStatus: userData.subscription_status
      }
    });

  } catch (error) {
    console.error('Verify login code error:', error);
    res.status(500).json({ success: false, error: error.message });
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

    // Add subscription metadata for all subscription modes
    if (sessionParams.mode === 'subscription') {
      sessionParams.subscription_data = {
        metadata: {
          extension_user_id: extensionUserId,
          price_id: priceId
        }
      };
    }

    // Add trial configuration for managed monthly
    if (trialConfig.hasTrial && sessionParams.mode === 'subscription') {
      // For $1 trial: Create subscription with trial period
      sessionParams.subscription_data.trial_period_days = trialConfig.trialPeriodDays;
      sessionParams.subscription_data.metadata.has_trial = 'true';

      // Add $1 trial fee as a one-time line item
      // Note: invoice_creation is NOT allowed for subscription mode - Stripe creates invoices automatically
      sessionParams.line_items.push({
        price_data: {
          currency: 'usd',
          product_data: {
            name: 'Trial Period',
            description: '14-day trial access for $1'
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
// ENDPOINT: Preview Subscription Change (get proration amount)
// ============================================
router.post('/preview-subscription-change', async (req, res) => {
  try {
    const { extensionUserId, newPriceId } = req.body;

    if (!extensionUserId || !newPriceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
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
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Preview the upcoming invoice with the new price
    const upcomingInvoice = await stripe.invoices.upcoming({
      customer: userResult.rows[0].stripe_customer_id,
      subscription: subscriptionId,
      subscription_items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId
        }
      ],
      subscription_proration_behavior: 'create_prorations'
    });

    // Calculate immediate charge (prorated amount)
    const immediateCharge = upcomingInvoice.amount_due;
    const currency = upcomingInvoice.currency;

    res.json({
      success: true,
      immediateCharge: immediateCharge / 100, // Convert from cents to dollars
      currency: currency.toUpperCase(),
      formattedAmount: `${currency.toUpperCase()} $${(immediateCharge / 100).toFixed(2)}`
    });

  } catch (error) {
    console.error('Preview subscription change error:', error);
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
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);

    // Update subscription with new price (with proration)
    const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
      items: [
        {
          id: subscription.items.data[0].id,
          price: newPriceId
        }
      ],
      proration_behavior: 'create_prorations',
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

      // Calculate cancel date - use trial_end if in trial, otherwise current_period_end
      const cancelDate = canceledSubscription.trial_end
        ? new Date(canceledSubscription.trial_end * 1000)
        : canceledSubscription.current_period_end
        ? new Date(canceledSubscription.current_period_end * 1000)
        : null;

      // Update database
      if (cancelDate) {
        await pool.query(
          `UPDATE users
           SET subscription_cancel_at = $1, updated_at = NOW()
           WHERE extension_user_id = $2`,
          [cancelDate, extensionUserId]
        );
      } else {
        console.error('⚠️ Could not determine cancel date for subscription:', subscriptionId);
      }
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
  // IMPORTANT: Disable caching to always fetch fresh subscription data from Stripe
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, private',
    'Pragma': 'no-cache',
    'Expires': '0'
  });

  try {
    const { extensionUserId } = req.params;

    const result = await pool.query(
      `SELECT
        extension_user_id, email, tier, plan_name, subscription_status,
        stripe_subscription_id, stripe_price_id, stripe_customer_id,
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
    let customerId = user.stripe_customer_id;

    // If we have an email, search for the LATEST customer in Stripe by email
    if (user.email) {
      try {
        const customers = await stripe.customers.list({
          email: user.email,
          limit: 1
        });

        if (customers.data.length > 0) {
          const latestCustomer = customers.data[0];
          customerId = latestCustomer.id;

          // Update database if customer ID changed (user was deleted and recreated in Stripe)
          if (user.stripe_customer_id !== customerId) {
            await pool.query(
              `UPDATE users SET stripe_customer_id = $1, updated_at = NOW() WHERE extension_user_id = $2`,
              [customerId, extensionUserId]
            );
            console.log(`✅ Updated customer ID for ${user.email}: ${customerId}`);
          }
        }
      } catch (customerError) {
        console.error('Error fetching customer by email:', customerError);
      }
    }

    // If they have a customer ID, fetch ALL active subscriptions from Stripe
    if (customerId) {
      try {
        // List all subscriptions for this customer
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          status: 'active',
          limit: 10
        });

        // Find the first active non-free subscription
        const activeSubscription = subscriptions.data.find(sub => {
          const priceId = sub.items.data[0].price.id;
          return priceId !== STRIPE_PRICES.free_plan && sub.status === 'active';
        });

        if (activeSubscription) {
          const priceId = activeSubscription.items.data[0].price.id;
          const tier = PRICE_TO_TIER[priceId] || user.tier;
          const planName = PRICE_TO_PLAN_NAME[priceId] || user.plan_name;

          // Update database if it's out of sync
          if (user.stripe_subscription_id !== activeSubscription.id || user.tier !== tier || user.stripe_customer_id !== customerId) {
            await pool.query(
              `UPDATE users
               SET stripe_subscription_id = $1, stripe_price_id = $2, tier = $3, plan_name = $4,
                   subscription_status = $5, stripe_customer_id = $6, updated_at = NOW()
               WHERE extension_user_id = $7`,
              [activeSubscription.id, priceId, tier, planName, activeSubscription.status, customerId, extensionUserId]
            );
            console.log(`✅ Synced database for user ${extensionUserId}: ${planName}`);
          }

          return res.json({
            success: true,
            tier: tier,
            planName: planName,
            subscription: {
              id: activeSubscription.id,
              status: activeSubscription.status,
              currentPeriodEnd: new Date(activeSubscription.current_period_end * 1000),
              cancelAtPeriodEnd: activeSubscription.cancel_at_period_end,
              trialEnd: activeSubscription.trial_end ? new Date(activeSubscription.trial_end * 1000) : null,
              priceId: priceId
            }
          });
        }
      } catch (stripeError) {
        console.error('Error fetching subscriptions from Stripe:', stripeError);
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
// ENDPOINT: Check Session Activation Status
// ============================================
router.get('/check-session/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;

    // Retrieve session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (!session) {
      return res.status(404).json({
        success: false,
        error: 'Session not found'
      });
    }

    // Check if payment is complete
    const activated = session.payment_status === 'paid';

    res.json({
      success: true,
      activated,
      paymentStatus: session.payment_status,
      extensionUserId: session.metadata?.extension_user_id
    });

  } catch (error) {
    console.error('Check session error:', error);
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
    let previousSubscriptionId = null;

    // If user has active subscription, calculate proration (but DON'T cancel yet)
    if (user.stripe_subscription_id) {
      try {
        // Retrieve subscription to calculate proration
        const subscription = await stripe.subscriptions.retrieve(user.stripe_subscription_id);

        console.log('Retrieved subscription:', {
          id: subscription.id,
          status: subscription.status,
          current_period_start: subscription.current_period_start,
          current_period_end: subscription.current_period_end,
          priceAmount: subscription.items.data[0]?.price?.unit_amount
        });

        if (subscription.status === 'active' || subscription.status === 'trialing') {
          // Store subscription ID to cancel AFTER payment succeeds
          previousSubscriptionId = user.stripe_subscription_id;

          // Calculate prorated refund amount
          const now = Math.floor(Date.now() / 1000);
          const periodEnd = subscription.current_period_end;
          const periodStart = subscription.current_period_start;

          // Validate period values exist
          if (!periodEnd || !periodStart) {
            console.error('Missing period values from subscription:', { periodStart, periodEnd });
            throw new Error('Subscription period data incomplete');
          }

          const totalPeriod = periodEnd - periodStart;
          const remainingTime = Math.max(0, periodEnd - now); // Ensure non-negative

          // Get the price amount from the subscription
          const priceAmount = subscription.items.data[0].price.unit_amount; // in cents

          // Calculate prorated credit only if there's remaining time
          if (remainingTime > 0 && totalPeriod > 0 && priceAmount > 0) {
            proratedCredit = Math.floor((priceAmount * remainingTime) / totalPeriod);
          }

          console.log('Proration calculation (will apply AFTER payment):', {
            priceAmount,
            totalPeriod,
            remainingTime,
            proratedCredit,
            remainingDays: (remainingTime / 86400).toFixed(1)
          });

          console.log(`ℹ️ Subscription ${user.stripe_subscription_id} will be canceled AFTER Lifetime payment succeeds`);
        } else {
          console.log(`⚠️ Subscription status is ${subscription.status}, no proration needed`);
        }
      } catch (subError) {
        console.error('❌ Error retrieving subscription:', subError);
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
        upgraded_from_subscription: previousSubscriptionId ? 'true' : 'false',
        previous_subscription_id: previousSubscriptionId || '',
        prorated_credit: proratedCredit.toString()
      }
    };

    // If there's a prorated credit, apply it as a discount
    if (proratedCredit > 0 && !isNaN(proratedCredit)) {
      try {
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

        console.log(`✅ Created coupon ${coupon.id} for $${(proratedCredit / 100).toFixed(2)} credit`);
      } catch (couponError) {
        console.error('❌ Error creating coupon:', couponError);
        // Continue without coupon - user will still get refund
      }
    } else {
      console.log(`ℹ️ No coupon created - proratedCredit: $${(proratedCredit / 100).toFixed(2)}`);
    }

    // Create checkout session
    const session = await stripe.checkout.sessions.create(sessionParams);

    res.json({
      success: true,
      sessionId: session.id,
      url: session.url,
      proratedCredit: proratedCredit,
      hasPreviousSubscription: !!previousSubscriptionId,
      message: proratedCredit > 0
        ? `After successful payment, your current subscription will be canceled and you'll receive a $${(proratedCredit / 100).toFixed(2)} refund to your card. A $${(proratedCredit / 100).toFixed(2)} discount has been applied to your Lifetime purchase.`
        : previousSubscriptionId
        ? 'After successful payment, your current subscription will be canceled automatically.'
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
