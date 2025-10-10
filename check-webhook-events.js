// Check which events are enabled in Stripe webhook
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

async function checkWebhookEvents() {
  try {
    console.log('🔍 Fetching Stripe webhook endpoints...\n');

    const webhooks = await stripe.webhookEndpoints.list();

    if (webhooks.data.length === 0) {
      console.log('❌ No webhooks found in Stripe.');
      return;
    }

    webhooks.data.forEach((webhook, index) => {
      console.log(`\n📡 Webhook ${index + 1}:`);
      console.log(`   URL: ${webhook.url}`);
      console.log(`   Status: ${webhook.status}`);
      console.log(`   Enabled Events (${webhook.enabled_events.length}):`);

      // Events that should be enabled
      const requiredEvents = [
        'checkout.session.completed',
        'customer.subscription.created',
        'customer.subscription.updated',
        'customer.subscription.deleted',
        'invoice.payment_succeeded',
        'invoice.payment_failed',
        'customer.subscription.trial_will_end',
        'customer.deleted'
      ];

      console.log('\n   ✅ Enabled:');
      requiredEvents.forEach(event => {
        if (webhook.enabled_events.includes(event)) {
          console.log(`      ✓ ${event}`);
        }
      });

      console.log('\n   ❌ Missing (but recommended):');
      requiredEvents.forEach(event => {
        if (!webhook.enabled_events.includes(event)) {
          console.log(`      ✗ ${event}`);
        }
      });

      console.log('\n   📋 All enabled events:');
      webhook.enabled_events.forEach(event => {
        console.log(`      - ${event}`);
      });
    });

  } catch (error) {
    console.error('❌ Error fetching webhooks:', error.message);
  }
}

checkWebhookEvents();
