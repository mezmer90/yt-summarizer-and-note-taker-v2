# Quick Reference - Stripe Integration v8.0

## API Endpoints

| Endpoint | Method | Purpose | Body |
|----------|--------|---------|------|
| `/stripe/create-checkout` | POST | New subscription/purchase | `priceId, extensionUserId, email` |
| `/stripe/change-subscription` | POST | Switch recurring plans | `extensionUserId, newPriceId` |
| `/stripe/cancel-subscription` | POST | Cancel subscription | `extensionUserId, immediate` |
| `/stripe/subscription-status/:id` | GET | Get current status | URL param: `extensionUserId` |
| `/stripe/create-portal-session` | POST | Open Customer Portal | `extensionUserId, returnUrl` |
| `/stripe/upgrade-to-lifetime` | POST | **Lifetime with refund** | `extensionUserId, email` |
| `/webhooks/stripe` | POST | Stripe events | Stripe signature required |

---

## Price IDs

```javascript
// BYOK Plans
byok_premium_yearly:     'price_1SFqZbSEC06Y8mAj7VrCPBaZ'  // $67/yr
byok_unlimited_yearly:   'price_1SFqaFSEC06Y8mAjeMdV3v9X'  // $97/yr
byok_lifetime:           'price_1SFqamSEC06Y8mAjmE94GJMI'  // $147 one-time

// Managed Plans
managed_monthly:         'price_1SFqbRSEC06Y8mAjmdQa5KuI'  // $17/mo ($1 trial)
managed_annual:          'price_1SFqbwSEC06Y8mAjBVToL29F'  // $99/yr

// Student Plans
student_premium_byok:    'price_1SFqcRSEC06Y8mAjWiOxN2L4'  // $37/yr
student_unlimited_byok:  'price_1SFqcvSEC06Y8mAj2iYzz9O9'  // $57/yr
student_monthly_managed: 'price_1SFqdRSEC06Y8mAjDmaVPtyN'  // $9/mo
student_annual_managed:  'price_1SFqe2SEC06Y8mAjIsvrQ1G1'  // $47/yr
```

---

## Database Schema

### users table:
```sql
extension_user_id        VARCHAR(255) PRIMARY KEY
email                    VARCHAR(255)
tier                     VARCHAR(50) DEFAULT 'free'
plan_name                VARCHAR(100)
stripe_customer_id       VARCHAR(255)
stripe_subscription_id   VARCHAR(255)
stripe_price_id          VARCHAR(255)
subscription_status      VARCHAR(50)
subscription_start_date  TIMESTAMP
subscription_end_date    TIMESTAMP
subscription_cancel_at   TIMESTAMP
trial_end_date           TIMESTAMP
payment_method_id        VARCHAR(255)
created_at               TIMESTAMP DEFAULT NOW()
updated_at               TIMESTAMP DEFAULT NOW()
```

---

## Webhook Events to Handle

| Event | Action |
|-------|--------|
| `checkout.session.completed` | Set tier, create/update user |
| `customer.subscription.created` | Store subscription ID |
| `customer.subscription.updated` | Update tier/status |
| `customer.subscription.deleted` | Set tier to 'free' |
| `invoice.paid` | Confirm payment |
| `invoice.payment_failed` | Notify user |

---

## Customer Portal Configuration

**URL:** https://dashboard.stripe.com/test/settings/billing/portal

**Settings:**
- ✅ Invoice history: Enabled
- ✅ Update payment method: Enabled
- ✅ Cancel subscription: Enabled (at period end)
- ✅ **Update subscription: Enabled** ← Critical!
- ✅ Products: Add **8 recurring plans** (NOT Lifetime)
- ✅ Proration: "Create prorations"

---

## Common Operations

### Subscribe to a Plan:
```javascript
// Extension code
const response = await fetch('/api/stripe/create-checkout', {
  method: 'POST',
  body: JSON.stringify({
    priceId: 'price_1SFqbRSEC06Y8mAjmdQa5KuI',  // Monthly Managed
    extensionUserId: 'user_123',
    email: 'user@example.com'
  })
});
const { url } = await response.json();
window.location.href = url;  // Redirect to Stripe Checkout
```

### Switch Plans:
```javascript
// Extension code
const response = await fetch('/api/stripe/change-subscription', {
  method: 'POST',
  body: JSON.stringify({
    extensionUserId: 'user_123',
    newPriceId: 'price_1SFqbwSEC06Y8mAjBVToL29F'  // Annual Managed
  })
});
// Proration applied automatically
```

### Upgrade to Lifetime:
```javascript
// Extension code (automatic refund!)
const response = await fetch('/api/stripe/upgrade-to-lifetime', {
  method: 'POST',
  body: JSON.stringify({
    extensionUserId: 'user_123',
    email: 'user@example.com'
  })
});
const { url, proratedCredit } = await response.json();
// User sees: $147 - $proratedCredit at checkout
// User gets: Refund to card in 5-10 days
window.location.href = url;
```

### Open Customer Portal:
```javascript
// Extension code
const response = await fetch('/api/stripe/create-portal-session', {
  method: 'POST',
  body: JSON.stringify({
    extensionUserId: 'user_123'
  })
});
const { url } = await response.json();
window.location.href = url;  // Redirect to Stripe Portal
```

### Check Subscription Status:
```javascript
// Extension code
const response = await fetch(
  `/api/stripe/subscription-status/${extensionUserId}`
);
const { tier, planName, subscription } = await response.json();
// tier: 'free' | 'premium' | 'unlimited' | 'managed'
// subscription: { status, currentPeriodEnd, cancelAtPeriodEnd, ... }
```

---

## Proration Examples

### Monthly → Annual:
- Paid $17 on Jan 1
- Switch on Jan 15 (halfway)
- Credit: $8.50
- Charge: $99 - $8.50 = $90.50
- Next bill: Jan 1 next year

### Annual → Lifetime:
- Paid $99 on Jan 1
- Upgrade on Jul 1 (6 months)
- Credit: $49.50
- **Refund:** $49.50 to card
- **Checkout:** $147 - $49.50 = $97.50
- **Total:** $49.50 (paid) + $97.50 = $147 ✅

---

## Environment Variables (Production)

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_...  # NOT sk_test_!
STRIPE_WEBHOOK_SECRET=whsec_...

# Price IDs (use LIVE price IDs, not test!)
STRIPE_PRICE_BYOK_PREMIUM=price_...
STRIPE_PRICE_BYOK_UNLIMITED=price_...
STRIPE_PRICE_BYOK_LIFETIME=price_...
STRIPE_PRICE_MANAGED_MONTHLY=price_...
STRIPE_PRICE_MANAGED_ANNUAL=price_...
STRIPE_PRICE_STUDENT_PREMIUM=price_...
STRIPE_PRICE_STUDENT_UNLIMITED=price_...
STRIPE_PRICE_STUDENT_MONTHLY=price_...
STRIPE_PRICE_STUDENT_ANNUAL=price_...

# Database
DATABASE_URL=postgresql://...  # Railway auto-configures

# Frontend
FRONTEND_URL=chrome-extension://your-extension-id
```

---

## Testing with Test Cards

```
Success: 4242 4242 4242 4242
Decline: 4000 0000 0000 0002
Requires authentication: 4000 0025 0000 3155
Insufficient funds: 4000 0000 0000 9995
```

**Expiry:** Any future date
**CVC:** Any 3 digits
**ZIP:** Any 5 digits

---

## Troubleshooting

### Webhook not firing:
1. Check Stripe Dashboard → Developers → Webhooks
2. Verify endpoint URL: `https://your-app.railway.app/webhooks/stripe`
3. Check webhook secret matches `STRIPE_WEBHOOK_SECRET`
4. Review Railway logs for errors

### Subscription not updating:
1. Check `/subscription-status/:id` endpoint
2. Look for webhook events in Stripe Dashboard
3. Query database directly to verify update
4. Check Railway logs for webhook handler errors

### Proration not working:
1. Verify Customer Portal has "Create prorations" enabled
2. Check subscription update includes `proration_behavior: 'create_prorations'`
3. Review Stripe invoice to see proration line items

### Lifetime upgrade refund not showing:
1. Check backend logs for proration calculation
2. Verify coupon was created (Stripe Dashboard → Coupons)
3. Check checkout session has discount applied
4. Refund takes 5-10 business days to process

---

## Support Resources

- **Stripe Docs:** https://stripe.com/docs
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Railway Logs:** `railway logs --project your-project`
- **Backend Files:** `youtube-summarizer-backend-v8-stripe/`
- **Extension Files:** `youtube-summarizer-v8.0-stripe/`

---

## Quick Commands

```bash
# View Railway logs
railway logs

# Restart Railway service
railway restart

# Run database migration
railway run npm run migrate

# Check Stripe webhooks
stripe listen --forward-to localhost:3000/webhooks/stripe

# Test webhook locally
stripe trigger checkout.session.completed
```

---

**Last updated:** 2025-10-08
