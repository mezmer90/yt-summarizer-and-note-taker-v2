# Railway Deployment Guide

Step-by-step guide to deploy the backend to Railway.

## Prerequisites

- GitHub account
- Railway account (free tier available)
- Email service (Gmail or SendGrid)

---

## Step 1: Prepare for Deployment

### 1.1 Initialize Git Repository

```bash
cd /Users/sagarmaiti/Downloads/yt-ext/youtube-summarizer-backend

git init
git add .
git commit -m "Initial backend setup"
```

### 1.2 Create GitHub Repository

1. Go to https://github.com/new
2. Name: `youtube-summarizer-backend`
3. Create repository (don't initialize with README)
4. Push code:

```bash
git remote add origin https://github.com/YOUR_USERNAME/youtube-summarizer-backend.git
git branch -M main
git push -u origin main
```

---

## Step 2: Create Railway Project

### 2.1 Sign Up for Railway

1. Go to https://railway.app
2. Click "Login" → "Login with GitHub"
3. Authorize Railway

### 2.2 Create New Project

1. Click "+ New Project"
2. Select "Deploy from GitHub repo"
3. Select `youtube-summarizer-backend` repository
4. Railway will start deploying automatically

### 2.3 Add PostgreSQL Database

1. In your project, click "+ New"
2. Select "Database" → "Add PostgreSQL"
3. Railway provisions database automatically
4. Note: `DATABASE_URL` is automatically added to your service

---

## Step 3: Configure Environment Variables

### 3.1 Generate JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Copy the output.

### 3.2 Generate Admin Password Hash

```bash
node -e "console.log(require('bcryptjs').hashSync('YOUR_ADMIN_PASSWORD', 10))"
```

Copy the hash.

### 3.3 Set Variables in Railway

1. Click on your Node.js service
2. Go to "Variables" tab
3. Click "+ New Variable"
4. Add each variable:

```
NODE_ENV=production
PORT=3000 (Railway auto-provides this, but add anyway)

# JWT (from Step 3.1)
JWT_SECRET=your_generated_secret_here

# Admin (from Step 3.2)
ADMIN_EMAIL=admin@yourdomain.com
ADMIN_PASSWORD_HASH=your_generated_hash_here

# Email Service (Gmail example)
EMAIL_SERVICE=gmail
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-gmail-app-password
FROM_EMAIL_NAME=YouTube Summarizer Pro
SUPPORT_EMAIL=support@yourdomain.com

# Extension
EXTENSION_ID=youtube-video-summarizer-pro

# Rate Limiting
MAX_VERIFICATION_ATTEMPTS=3
VERIFICATION_COOLDOWN_HOURS=24
MAX_REQUESTS_PER_MINUTE=60

# URLs (Update after deployment)
BACKEND_URL=https://your-app.railway.app
ALLOWED_ORIGINS=chrome-extension://your-extension-id,http://localhost:3000
```

### 3.4 Get Railway URLs

After deployment:
1. Click on your service
2. Go to "Settings" → "Domains"
3. Railway provides: `https://[app-name].railway.app`
4. Update `BACKEND_URL` variable with this URL

---

## Step 4: Setup Database

### Option A: Via Railway Dashboard (Recommended)

1. Go to PostgreSQL service
2. Click "Data" tab
3. Click "Query"
4. Copy entire content of `src/models/schema.sql`
5. Paste and click "Run"
6. Verify tables created in "Tables" tab

### Option B: Via Command Line

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# Run setup script
railway run npm run setup-db
```

---

## Step 5: Create Admin User

### 5.1 Get Your Railway URL

Your app should be at: `https://[your-app-name].railway.app`

### 5.2 Create First Admin

```bash
curl -X POST https://your-app-name.railway.app/api/admin/setup \
  -H "Content-Type": "application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "your-secure-password",
    "name": "Admin"
  }'
```

**Response (success):**
```json
{
  "success": true,
  "admin": {
    "id": 1,
    "email": "admin@yourdomain.com",
    "name": "Admin",
    "role": "admin"
  }
}
```

---

## Step 6: Test Deployment

### 6.1 Health Check

```bash
curl https://your-app-name.railway.app/health
```

**Expected:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-06T...",
  "environment": "production"
}
```

### 6.2 Admin Login

1. Go to `https://your-app-name.railway.app/admin`
2. Login with admin credentials
3. Verify dashboard loads

### 6.3 Test API Endpoints

```bash
# Login to get token
curl -X POST https://your-app-name.railway.app/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@yourdomain.com","password":"your-password"}'

# Use token for protected routes
curl https://your-app-name.railway.app/api/admin/stats \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Step 7: Configure Email Service

### Gmail App Password (Recommended for Development)

1. Go to Google Account → Security
2. Enable 2-Step Verification
3. Go to "App passwords"
4. Select "Mail" and your device
5. Copy generated password
6. Add to Railway variables:
   ```
   EMAIL_SERVICE=gmail
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASSWORD=generated-app-password
   ```

### SendGrid (Recommended for Production)

1. Sign up at https://sendgrid.com
2. Create API key (Settings → API Keys)
3. Verify sender email
4. Add to Railway variables:
   ```
   EMAIL_SERVICE=sendgrid
   SENDGRID_API_KEY=your-api-key
   SENDGRID_FROM_EMAIL=noreply@yourdomain.com
   ```

---

## Step 8: Update Extension

### 8.1 Update Extension Config

In `youtube-summarizer-v7.0/background.js` or config file:

```javascript
// Add your Railway URL
const BACKEND_URL = 'https://your-app-name.railway.app';
```

### 8.2 Add Backend Calls

Example - Get user's model:

```javascript
async function getUserModel(userId) {
  const response = await fetch(`${BACKEND_URL}/api/user/${userId}/model`);
  const data = await response.json();
  return data.model;
}
```

---

## Step 9: Monitor & Manage

### 9.1 View Logs

Railway Dashboard:
1. Click on your service
2. Go to "Deployments" tab
3. Click latest deployment
4. View logs in real-time

Or via CLI:
```bash
railway logs
```

### 9.2 Admin Dashboard

Access: `https://your-app-name.railway.app/admin`

**Features:**
- View user statistics
- Change AI models for tiers
- Update system settings
- Monitor usage and costs
- View admin action logs

### 9.3 Database Management

Railway Dashboard:
1. Click PostgreSQL service
2. "Data" tab to view/query data
3. "Metrics" tab for performance
4. "Settings" for backups

---

## Step 10: Custom Domain (Optional)

### 10.1 Add Custom Domain

1. In Railway service settings
2. Go to "Domains" → "Custom Domain"
3. Add: `api.yourdomain.com`
4. Railway provides CNAME record
5. Add to your DNS provider:
   ```
   Type: CNAME
   Name: api
   Value: [railway-provided-url]
   ```

### 10.2 Update Variables

Update in Railway:
```
BACKEND_URL=https://api.yourdomain.com
```

---

## Troubleshooting

### Database Connection Error

**Problem:** "Connection refused" or "Database error"

**Solution:**
1. Verify PostgreSQL service is running
2. Check `DATABASE_URL` is set correctly
3. Restart Node.js service

### Admin Can't Login

**Problem:** "Invalid credentials"

**Solution:**
1. Verify admin user created: Query `SELECT * FROM admin_users`
2. Check password hash is correct
3. Verify JWT_SECRET is set

### CORS Errors

**Problem:** Extension can't call API

**Solution:**
1. Update `ALLOWED_ORIGINS` with chrome-extension://your-id
2. Restart service
3. Check CORS middleware in `src/app.js`

### Email Not Sending

**Problem:** Emails not received

**Solution:**
1. Check email service credentials
2. Verify Gmail app password (not regular password)
3. Check SendGrid API key and sender verification
4. View logs for email errors

---

## Costs

**Railway Pricing:**
- Free tier: $5 credit/month
- Typical usage:
  - Node.js service: ~$5/month
  - PostgreSQL: ~$5/month
- **Total: ~$10/month** (first $5 free)

**Email Service:**
- Gmail: Free (limits: 500/day)
- SendGrid: Free tier (100 emails/day)

---

## Security Checklist

✅ Environment variables set (not in code)
✅ JWT secret is random and secure
✅ Admin password is hashed
✅ CORS configured for extension only
✅ Rate limiting enabled
✅ HTTPS enforced (Railway auto-provides)
✅ SQL injection protected (parameterized queries)
✅ XSS protection (Helmet.js)

---

## Next Steps

1. ✅ Deploy backend to Railway
2. ✅ Setup database and admin user
3. ⏳ Update extension to use backend API
4. ⏳ Test complete flow
5. ⏳ Monitor usage and costs
6. ⏳ Add more features as needed

---

**Support:**
- Railway Docs: https://docs.railway.app
- Railway Discord: https://discord.gg/railway
- Project Issues: GitHub Issues

**Status:** Ready to Deploy! 🚀
