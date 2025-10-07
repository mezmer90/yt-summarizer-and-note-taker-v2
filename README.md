# YouTube Video Summarizer Pro - Backend API

Backend API for admin control, model management, and user tracking.

## Features

- ✅ **Model Configuration** - Admin can change AI models for any tier
- ✅ **User Management** - Track all users and their usage
- ✅ **Usage Analytics** - Monitor videos processed, tokens used, costs
- ✅ **Admin Dashboard** - Full web-based control panel
- ✅ **API Key Management** - Control who needs BYOK vs managed
- ✅ **System Settings** - Configure all extension behavior

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Edit `.env` with your values:
- `DATABASE_URL` - Railway PostgreSQL connection (auto-provided)
- `JWT_SECRET` - Generate with: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`
- `EMAIL_USER` and `EMAIL_PASSWORD` - Gmail app password
- Other settings as needed

### 3. Setup Database

```bash
npm run setup-db
```

This will:
- Create all tables
- Insert default model configurations
- Set up system settings

### 4. Create First Admin User

```bash
curl -X POST http://localhost:3000/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "your-secure-password",
    "name": "Admin"
  }'
```

### 5. Start Server

```bash
# Development
npm run dev

# Production
npm start
```

## API Endpoints

### User Endpoints (Public)

```
POST   /api/user                      # Get or create user
POST   /api/user/tier                 # Update user tier
GET    /api/user/:userId/model        # Get assigned model for user
POST   /api/user/usage                # Track usage
GET    /api/user/:userId/stats        # Get user statistics
```

### Admin Endpoints (Protected)

```
POST   /api/admin/login               # Admin login
POST   /api/admin/setup               # Create first admin (one-time)

GET    /api/admin/stats               # Dashboard statistics
GET    /api/admin/users               # List all users
GET    /api/admin/settings            # Get system settings
PUT    /api/admin/settings/:key       # Update setting
GET    /api/admin/logs                # Admin action logs
GET    /api/admin/analytics           # Usage analytics

GET    /api/admin/models              # Get all model configs
GET    /api/admin/models/:tier        # Get model for tier
PUT    /api/admin/models/:tier        # Update model for tier
```

## Admin Dashboard

Access at: `http://localhost:3000/admin`

**Features:**
- 📊 Real-time statistics
- 🎯 Model configuration per tier
- 👥 User management
- ⚙️ System settings
- 📝 Action logs

## Model Configuration

Admin can change which AI model is used for each tier:

**Default Models:**
- Free: Gemini Flash 1.5 8B
- Premium: Claude 3.5 Sonnet
- Unlimited: Claude 3 Opus
- Managed: Gemini Flash 1.5 8B

**Available Models:**
- `google/gemini-flash-1.5-8b` - Cheapest ($0.04/$0.15 per 1M)
- `anthropic/claude-3-haiku` - Fast ($0.25/$1.25 per 1M)
- `anthropic/claude-3.5-sonnet` - Best balance ($3/$15 per 1M)
- `anthropic/claude-3-opus` - Best quality ($15/$75 per 1M)

## System Settings

Control extension behavior:

- `require_api_key_for_free` - true/false
- `require_api_key_for_premium` - true/false
- `require_api_key_for_unlimited` - true/false
- `require_api_key_for_managed` - true/false (should be false)
- `default_max_video_length_*` - Max video length in minutes per tier
- `managed_plan_openrouter_key` - OpenRouter API key for managed users

## Railway Deployment

### 1. Install Railway CLI

```bash
npm install -g @railway/cli
railway login
```

### 2. Create Project

1. Go to https://railway.app
2. Click "New Project"
3. Select "Provision PostgreSQL"
4. Click "+ New" → "Empty Service"

### 3. Deploy

```bash
# In this directory
railway link
railway up
```

### 4. Set Environment Variables

In Railway dashboard:
1. Go to your service
2. Click "Variables"
3. Add all variables from `.env.example`
4. Railway auto-provides `DATABASE_URL`

### 5. Run Database Setup

In Railway dashboard:
1. Go to PostgreSQL service
2. Click "Query"
3. Paste contents of `src/models/schema.sql`
4. Run query

### 6. Create Admin User

```bash
# Get your Railway URL
curl -X POST https://your-app.railway.app/api/admin/setup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@yourdomain.com",
    "password": "your-secure-password",
    "name": "Admin"
  }'
```

## Usage

### Extension Integration

Update extension to call backend APIs:

```javascript
// Get user's model
const response = await fetch('https://your-api.railway.app/api/user/USER_ID/model');
const { model, requiresApiKey } = await response.json();

// Track usage
await fetch('https://your-api.railway.app/api/user/usage', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    extensionUserId: userId,
    videosProcessed: 1,
    tokensUsed: 1500,
    costIncurred: 0.05
  })
});
```

## Security

- JWT tokens for admin authentication
- Rate limiting on all endpoints
- CORS protection (chrome-extension:// origins allowed)
- SQL injection protection (parameterized queries)
- XSS protection with Helmet.js

## Development

```bash
# Run with hot reload
npm run dev

# Setup database
npm run setup-db

# View logs
tail -f logs/app.log
```

## Troubleshooting

**Database connection fails:**
- Check `DATABASE_URL` in environment
- Verify Railway PostgreSQL is running
- Check network connectivity

**Admin login fails:**
- Ensure admin user is created
- Check JWT_SECRET is set
- Verify password hash is correct

**CORS errors:**
- Add chrome-extension://your-id to ALLOWED_ORIGINS
- Restart server after env changes

## Support

For issues or questions:
- Check logs: `railway logs`
- View Railway dashboard for errors
- Check database connection

---

**Built with:** Node.js, Express, PostgreSQL, JWT, Nodemailer
**Deployed on:** Railway
