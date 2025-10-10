// Stripe Webhook Handler for YouTube Summarizer Pro v8.0
// Handles all Stripe webhook events

const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const {
  stripe,
  PRICE_TO_TIER,
  PRICE_TO_PLAN_NAME,
  isLifetimePlan
} = require('../config/stripe');

// ============================================
// WEBHOOK ENDPOINT
// ============================================
// This endpoint must use raw body for signature verification
router.post('/stripe', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠️ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('✅ Webhook received:', event.type);

  // Handle different event types
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;

      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'customer.subscription.trial_will_end':
        await handleTrialWillEnd(event.data.object);
        break;

      case 'customer.deleted':
        await handleCustomerDeleted(event.data.object);
        break;

      default:
        console.log(`Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================
// EVENT HANDLERS
// ============================================

async function handleCheckoutCompleted(session) {
  console.log('💳 Processing checkout.session.completed');

  const extensionUserId = session.metadata.extension_user_id;
  const customerId = session.customer;

  if (!extensionUserId) {
    console.error('No extension_user_id in session metadata');
    return;
  }

  try {
    // For one-time payments (lifetime plan)
    if (session.mode === 'payment') {
      const priceId = session.metadata.price_id;
      const tier = PRICE_TO_TIER[priceId];
      const planName = PRICE_TO_PLAN_NAME[priceId];
      const previousSubscriptionId = session.metadata.previous_subscription_id;

      // If this was an upgrade from an existing subscription, cancel it now
      if (previousSubscriptionId) {
        try {
          console.log(`🔄 Canceling previous subscription ${previousSubscriptionId} after Lifetime payment`);

          const subscription = await stripe.subscriptions.retrieve(previousSubscriptionId);

          if (subscription.status === 'active' || subscription.status === 'trialing') {
            // Cancel with proration to issue refund
            await stripe.subscriptions.cancel(previousSubscriptionId, {
              prorate: true,
              invoice_now: true
            });

            console.log(`✅ Canceled previous subscription ${previousSubscriptionId} with prorated refund`);
          } else {
            console.log(`⚠️ Previous subscription ${previousSubscriptionId} status is ${subscription.status}, skipping cancellation`);
          }
        } catch (cancelError) {
          console.error(`❌ Error canceling previous subscription ${previousSubscriptionId}:`, cancelError);
          // Continue with Lifetime activation even if cancellation fails
        }
      }

      // Activate Lifetime plan
      await pool.query(
        `UPDATE users
         SET tier = $1,
             plan_name = $2,
             stripe_customer_id = $3,
             stripe_price_id = $4,
             stripe_subscription_id = NULL,
             subscription_status = 'active',
             subscription_start_date = NOW(),
             subscription_end_date = NULL,
             updated_at = NOW()
         WHERE extension_user_id = $5`,
        [tier, planName, customerId, priceId, extensionUserId]
      );

      console.log(`✅ Lifetime plan activated for user ${extensionUserId}`);
    }

    // For subscriptions, we'll handle in subscription.created event
  } catch (error) {
    console.error('Error in handleCheckoutCompleted:', error);
    throw error;
  }
}

async function handleSubscriptionCreated(subscription) {
  console.log('🔔 Processing customer.subscription.created');

  const extensionUserId = subscription.metadata.extension_user_id;
  const customerId = subscription.customer;
  const priceId = subscription.items.data[0].price.id;

  if (!extensionUserId) {
    console.error('No extension_user_id in subscription metadata');
    return;
  }

  try {
    const tier = PRICE_TO_TIER[priceId];
    const planName = PRICE_TO_PLAN_NAME[priceId];
    const trialEnd = subscription.trial_end ? new Date(subscription.trial_end * 1000) : null;

    await pool.query(
      `UPDATE users
       SET tier = $1,
           plan_name = $2,
           stripe_customer_id = $3,
           stripe_subscription_id = $4,
           stripe_price_id = $5,
           subscription_status = $6,
           subscription_start_date = $7,
           trial_end_date = $8,
           updated_at = NOW()
       WHERE extension_user_id = $9`,
      [
        tier,
        planName,
        customerId,
        subscription.id,
        priceId,
        subscription.status,
        new Date(subscription.current_period_start * 1000),
        trialEnd,
        extensionUserId
      ]
    );

    console.log(`✅ Subscription created for user ${extensionUserId}, status: ${subscription.status}`);
  } catch (error) {
    console.error('Error in handleSubscriptionCreated:', error);
    throw error;
  }
}

async function handleSubscriptionUpdated(subscription) {
  console.log('🔄 Processing customer.subscription.updated');

  let extensionUserId = subscription.metadata.extension_user_id;

  if (!extensionUserId) {
    // Try to find user by subscription ID
    const userResult = await pool.query(
      'SELECT extension_user_id FROM users WHERE stripe_subscription_id = $1',
      [subscription.id]
    );

    if (userResult.rows.length === 0) {
      console.error('Could not find user for subscription:', subscription.id);
      return;
    }

    extensionUserId = userResult.rows[0].extension_user_id;
  }

  try {
    const priceId = subscription.items.data[0].price.id;
    const tier = PRICE_TO_TIER[priceId];
    const planName = PRICE_TO_PLAN_NAME[priceId];

    // Check if subscription is being canceled
    const cancelAt = subscription.cancel_at ? new Date(subscription.cancel_at * 1000) : null;

    await pool.query(
      `UPDATE users
       SET tier = $1,
           plan_name = $2,
           stripe_price_id = $3,
           subscription_status = $4,
           subscription_cancel_at = $5,
           updated_at = NOW()
       WHERE extension_user_id = $6`,
      [tier, planName, priceId, subscription.status, cancelAt, extensionUserId]
    );

    console.log(`✅ Subscription updated for user ${extensionUserId}, status: ${subscription.status}`);
  } catch (error) {
    console.error('Error in handleSubscriptionUpdated:', error);
    throw error;
  }
}

async function handleSubscriptionDeleted(subscription) {
  console.log('❌ Processing customer.subscription.deleted');

  try {
    // Find user by subscription ID
    const userResult = await pool.query(
      'SELECT extension_user_id FROM users WHERE stripe_subscription_id = $1',
      [subscription.id]
    );

    if (userResult.rows.length === 0) {
      console.error('Could not find user for deleted subscription:', subscription.id);
      return;
    }

    const extensionUserId = userResult.rows[0].extension_user_id;

    // Downgrade to free tier
    await pool.query(
      `UPDATE users
       SET tier = 'free',
           plan_name = NULL,
           subscription_status = 'canceled',
           subscription_end_date = NOW(),
           updated_at = NOW()
       WHERE extension_user_id = $1`,
      [extensionUserId]
    );

    console.log(`✅ User ${extensionUserId} downgraded to free tier`);
  } catch (error) {
    console.error('Error in handleSubscriptionDeleted:', error);
    throw error;
  }
}

async function handlePaymentSucceeded(invoice) {
  console.log('💰 Processing invoice.payment_succeeded');

  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  try {
    // Update subscription status to active
    if (subscriptionId) {
      await pool.query(
        `UPDATE users
         SET subscription_status = 'active', updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [subscriptionId]
      );

      console.log(`✅ Payment succeeded for subscription ${subscriptionId}`);
    }

    // Log payment event
    const userResult = await pool.query(
      'SELECT extension_user_id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );

    if (userResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO payment_events (extension_user_id, amount, currency, status, extpay_data)
         VALUES ($1, $2, $3, 'succeeded', $4)`,
        [
          userResult.rows[0].extension_user_id,
          invoice.amount_paid,
          invoice.currency,
          JSON.stringify({
            invoice_id: invoice.id,
            subscription_id: subscriptionId,
            payment_intent: invoice.payment_intent
          })
        ]
      );
    }
  } catch (error) {
    console.error('Error in handlePaymentSucceeded:', error);
    throw error;
  }
}

async function handlePaymentFailed(invoice) {
  console.log('⚠️ Processing invoice.payment_failed');

  const subscriptionId = invoice.subscription;
  const customerId = invoice.customer;

  try {
    // Update subscription status to past_due
    if (subscriptionId) {
      await pool.query(
        `UPDATE users
         SET subscription_status = 'past_due', updated_at = NOW()
         WHERE stripe_subscription_id = $1`,
        [subscriptionId]
      );

      console.log(`⚠️ Payment failed for subscription ${subscriptionId}, status set to past_due`);
    }

    // Log failed payment
    const userResult = await pool.query(
      'SELECT extension_user_id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );

    if (userResult.rows.length > 0) {
      await pool.query(
        `INSERT INTO payment_events (extension_user_id, amount, currency, status, extpay_data)
         VALUES ($1, $2, $3, 'failed', $4)`,
        [
          userResult.rows[0].extension_user_id,
          invoice.amount_due,
          invoice.currency,
          JSON.stringify({
            invoice_id: invoice.id,
            subscription_id: subscriptionId,
            attempt_count: invoice.attempt_count
          })
        ]
      );
    }
  } catch (error) {
    console.error('Error in handlePaymentFailed:', error);
    throw error;
  }
}

async function handleTrialWillEnd(subscription) {
  console.log('⏰ Processing customer.subscription.trial_will_end');

  try {
    const userResult = await pool.query(
      'SELECT extension_user_id, email FROM users WHERE stripe_subscription_id = $1',
      [subscription.id]
    );

    if (userResult.rows.length > 0) {
      const user = userResult.rows[0];
      console.log(`⏰ Trial ending soon for user ${user.extension_user_id} (${user.email})`);

      // You could send an email notification here
      // For now, just log it
    }
  } catch (error) {
    console.error('Error in handleTrialWillEnd:', error);
    throw error;
  }
}

async function handleCustomerDeleted(customer) {
  console.log('🗑️ Processing customer.deleted');

  const customerId = customer.id;

  try {
    // Find user by Stripe customer ID
    const userResult = await pool.query(
      'SELECT extension_user_id, email, tier FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );

    if (userResult.rows.length === 0) {
      console.log(`⚠️ No user found with Stripe customer ID: ${customerId}`);
      return;
    }

    const user = userResult.rows[0];

    // Clear all Stripe-related data and downgrade to free tier
    await pool.query(
      `UPDATE users
       SET stripe_customer_id = NULL,
           stripe_subscription_id = NULL,
           stripe_price_id = NULL,
           tier = 'free',
           plan_name = NULL,
           subscription_status = 'canceled',
           subscription_end_date = NOW(),
           subscription_cancel_at = NULL,
           trial_end_date = NULL,
           updated_at = NOW()
       WHERE extension_user_id = $1`,
      [user.extension_user_id]
    );

    console.log(`✅ Customer ${customerId} deleted from Stripe. User ${user.extension_user_id} (${user.email}) downgraded to free tier and Stripe data cleared.`);
  } catch (error) {
    console.error('Error in handleCustomerDeleted:', error);
    throw error;
  }
}

module.exports = router;
