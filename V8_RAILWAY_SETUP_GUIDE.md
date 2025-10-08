# YouTube Summarizer Pro v8.0 - Railway Setup Guide
## Fresh Deployment with Stripe Integration

---

## ✅ What's Complete

- ✅ Backend code pushed to GitHub: https://github.com/mezmer90/yt-summarizer-and-note-taker-v2.git
- ✅ All Stripe integration files added
- ✅ Database migration ready
- ✅ Webhook handler ready
- ✅ 4 API endpoints ready

---

## 🚀 Step-by-Step Railway Deployment

### Step 1: Create New Railway Project

1. Go to https://railway.app/dashboard
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose: `mezmer90/yt-summarizer-and-note-taker-v2`
5. Railway will start building automatically

### Step 2: Add PostgreSQL Database

1. In your project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway will provision a new PostgreSQL database
4. DATABASE_URL will be automatically added to environment variables

### Step 3: Add Environment Variables

Click on your service → **"Variables"** → Add these:

```bash
# Node Environment
NODE_ENV=production

# Stripe API Keys (Get from https://dashboard.stripe.com/test/apikeys)
STRIPE_SECRET_KEY=sk_test_51QkDYU...  # Your Stripe secret key
STRIPE_PUBLISHABLE_KEY=pk_test_51QkDYU...  # Your Stripe publishable key
STRIPE_WEBHOOK_SECRET=  # Leave blank for now, add after Step 5

# Stripe Price IDs (Already created in your Stripe account)
STRIPE_PRICE_BYOK_PREMIUM=price_1SFZLTSEC06Y8mAjjsC1kVhy
STRIPE_PRICE_BYOK_UNLIMITED=price_1SFZNDSEC06Y8mAjjDxBFerr
STRIPE_PRICE_BYOK_LIFETIME=price_1SFZNoSEC06Y8mAj0J29Er1s
STRIPE_PRICE_MANAGED_MONTHLY=price_1SFZRqSEC06Y8mAjSTU6kfWQ
STRIPE_PRICE_MANAGED_ANNUAL=price_1SFZbVSEC06Y8mAjCsaw0FIv
STRIPE_PRICE_STUDENT_PREMIUM=price_1SFZuXSEC06Y8mAjizZbc2sx
STRIPE_PRICE_STUDENT_UNLIMITED=price_1SFZvOSEC06Y8mAjDb9mpn6m
STRIPE_PRICE_STUDENT_MONTHLY=price_1SFZwVSEC06Y8mAjsQCk6H9G
STRIPE_PRICE_STUDENT_ANNUAL=price_1SFZxISEC06Y8mAjOGMLmqCW

# Email Configuration (Gmail example)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password

# JWT Secret (Generate random string)
JWT_SECRET=your_random_jwt_secret_minimum_64_characters_long

# Admin Credentials
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD_HASH=$2a$10$your_bcrypt_hash_here

# URLs - Update with your actual Railway domain
FRONTEND_URL=https://your-app-name.up.railway.app
BACKEND_URL=https://your-app-name.up.railway.app

# Security
ALLOWED_ORIGINS=chrome-extension://your-extension-id
```

**After adding variables, Railway will automatically redeploy.**

### Step 4: Run Database Migration

After deployment completes:

1. In Railway Dashboard → Your Service → Click **"..."** (three dots)
2. Select **"Open Shell"**
3. Run the migration:
   ```bash
   node migrations/run-stripe-migration.js
   ```

**Expected output:**
```
🚀 Starting Stripe fields migration...
✅ Stripe fields migration completed successfully!

📋 New columns added:
  - payment_method_id
  - stripe_customer_id
  - stripe_price_id
  - stripe_subscription_id
  - subscription_cancel_at
  - subscription_end_date
  - subscription_start_date
  - trial_end_date
```

### Step 5: Configure Stripe Webhook

1. **Get your Railway domain:**
   - In Railway → Settings → Copy your domain (e.g., `your-app.up.railway.app`)

2. **Go to Stripe Dashboard:**
   - https://dashboard.stripe.com/test/webhooks
   - Click **"Add endpoint"**

3. **Configure webhook:**
   - **Endpoint URL:** `https://your-app.up.railway.app/api/webhook/stripe`
   - **Description:** "YouTube Summarizer Pro v8.0 Webhooks"
   - **Events to send:**
     - ✅ `checkout.session.completed`
     - ✅ `customer.subscription.created`
     - ✅ `customer.subscription.updated`
     - ✅ `customer.subscription.deleted`
     - ✅ `invoice.payment_succeeded`
     - ✅ `invoice.payment_failed`
     - ✅ `customer.subscription.trial_will_end`
   - Click **"Add endpoint"**

4. **Get webhook secret:**
   - Click on the newly created endpoint
   - Click **"Reveal"** under "Signing secret"
   - Copy the secret (starts with `whsec_...`)

5. **Add to Railway:**
   - Go back to Railway → Variables
   - Add/Update: `STRIPE_WEBHOOK_SECRET=whsec_...`
   - Railway will redeploy

### Step 6: Test the Deployment

#### Test 1: Health Check
```bash
curl https://your-app.up.railway.app/health
```
Expected: `{"status":"ok","timestamp":"...","environment":"production"}`

#### Test 2: Create Checkout Session
```bash
curl -X POST https://your-app.up.railway.app/api/stripe/create-checkout \
  -H "Content-Type: application/json" \
  -d '{
    "priceId": "price_1SFZRqSEC06Y8mAjSTU6kfWQ",
    "extensionUserId": "test-user-123",
    "email": "test@example.com"
  }'
```
Expected: `{"success":true,"sessionId":"cs_test_...","url":"https://checkout.stripe.com/..."}`

#### Test 3: Test Webhook
1. Go to Stripe Dashboard → Webhooks → Your endpoint
2. Click **"Send test webhook"**
3. Select `checkout.session.completed`
4. Click **"Send test webhook"**
5. Check Railway logs (should show webhook received)

---

## 📋 API Endpoints

Your backend will have these endpoints:

### Stripe Endpoints:
- `POST /api/stripe/create-checkout` - Create payment session
- `POST /api/stripe/change-subscription` - Change plan
- `POST /api/stripe/cancel-subscription` - Cancel subscription
- `GET /api/stripe/subscription-status/:userId` - Get status

### Webhook:
- `POST /api/webhook/stripe` - Stripe webhook handler

### Student Verification:
- `POST /api/students/send-verification` - Send verification email
- `GET /api/students/verification-status/:userId` - Check status

### Admin:
- `GET /admin` - Admin dashboard
- `POST /api/admin/login` - Admin login

---

## 🔐 Security Checklist

Before going live:

- [ ] All environment variables set in Railway
- [ ] Stripe webhook secret configured
- [ ] Webhook signature verification working
- [ ] CORS configured for your extension
- [ ] Admin credentials set
- [ ] Email service configured
- [ ] Test checkout flow end-to-end
- [ ] Test subscription changes
- [ ] Test webhook events

---

## 🎯 Next Steps

### 1. Update Extension

In your `youtube-summarizer-v8.0-stripe` extension:

**Update `stripe-pricing.js`:**
```javascript
const BACKEND_API_URL = 'https://YOUR-RAILWAY-DOMAIN.up.railway.app/api';
```

**Update `manifest.json`:**
```json
"host_permissions": [
  "https://YOUR-RAILWAY-DOMAIN.up.railway.app/*"
]
```

### 2. Test Complete Flow

1. Load extension in Chrome
2. Open pricing page
3. Select a plan
4. Complete test payment with card: `4242 4242 4242 4242`
5. Verify redirect to success page
6. Check Railway logs for webhook events
7. Verify database updated with subscription

### 3. Go Live (When Ready)

1. Switch Stripe to live mode:
   - Replace `sk_test_` with `sk_live_`
   - Replace `pk_test_` with `pk_live_`
   - Update webhook to live mode
2. Test with real small payment
3. Monitor Railway logs
4. Set up Stripe email notifications
5. Configure Stripe Radar for fraud prevention

---

## 📝 Important Notes

- **Railway Domain:** Your app will be at `https://YOUR-APP-NAME.up.railway.app`
- **Database:** PostgreSQL automatically provisioned by Railway
- **Auto-Deploy:** Every git push will trigger Railway deployment
- **Logs:** View real-time logs in Railway Dashboard
- **Cost:** Railway free tier includes 500 hours/month

---

## 🐛 Troubleshooting

### Migration fails
- Check DATABASE_URL is set
- Verify PostgreSQL is running
- Check migration file syntax

### Webhook fails
- Verify STRIPE_WEBHOOK_SECRET is correct
- Check webhook URL matches Railway domain
- Verify events are selected in Stripe

### CORS errors
- Add extension ID to ALLOWED_ORIGINS
- Check chrome-extension:// is allowed in app.js

---

## ✅ Success Indicators

You'll know it's working when:

1. ✅ Railway deployment shows "Active"
2. ✅ Migration completes without errors
3. ✅ Health endpoint returns 200
4. ✅ Checkout creates valid Stripe session
5. ✅ Webhooks receive and process events
6. ✅ Database updates with subscription data
7. ✅ Extension can load and make API calls

---

**Repository:** https://github.com/mezmer90/yt-summarizer-and-note-taker-v2
**Version:** 8.0
**Integration:** Direct Stripe (No ExtensionPay)
