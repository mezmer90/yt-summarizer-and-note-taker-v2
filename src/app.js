// Express App Configuration
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');

const { apiLimiter } = require('./middleware/rateLimiter');
const userRoutes = require('./routes/user');
const adminRoutes = require('./routes/admin');
const studentRoutes = require('./routes/students');
const stripeRoutes = require('./routes/stripe');
const webhookRoutes = require('./routes/webhook');
const feedbackRoutes = require('./routes/feedback');

const app = express();

// Trust proxy - required for Railway deployment
// This allows Express to properly handle X-Forwarded-* headers from Railway's proxy
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet());

// CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000'];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    // Allow chrome-extension:// origins
    if (origin && origin.startsWith('chrome-extension://')) {
      return callback(null, true);
    }

    // Allow YouTube origins (for content script requests)
    if (origin && origin.includes('youtube.com')) {
      return callback(null, true);
    }

    // Check if origin is in allowed list
    if (origin && allowedOrigins.indexOf(origin) !== -1) {
      return callback(null, true);
    }

    // For development/testing - allow Railway domain
    if (origin && origin.includes('railway.app')) {
      return callback(null, true);
    }

    // Log rejected origins for debugging
    console.log('❌ CORS rejected origin:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// Webhook route MUST come before body parsing (needs raw body)
app.use('/api/webhook', webhookRoutes);

// Body parsing - increase limit to 10MB for screenshot uploads (base64 encoded)
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
if (process.env.NODE_ENV !== 'production') {
  app.use(morgan('dev'));
} else {
  app.use(morgan('combined'));
}

// Rate limiting
app.use('/api', apiLimiter);

// Static files for admin dashboard and payment pages
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));
app.use('/success', express.static(path.join(__dirname, '../public/success')));
app.use(express.static(path.join(__dirname, '../public')));

// Health check
app.get('/health', (req, res) => {
  console.log('Health check requested from:', req.ip);

  // Check email service status
  let emailStatus = 'unknown';
  try {
    const transporter = require('./config/email');
    if (transporter && typeof transporter.sendMail === 'function') {
      emailStatus = 'configured';
    } else {
      emailStatus = 'not_configured';
    }
  } catch (error) {
    emailStatus = 'error: ' + error.message;
  }

  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development',
    emailService: emailStatus,
    uptime: process.uptime()
  });
});

// API Routes
app.use('/api', userRoutes);
app.use('/api', adminRoutes);
app.use('/api/students', studentRoutes);
app.use('/api/stripe', stripeRoutes);
app.use('/api', feedbackRoutes);

// Root route
app.get('/', (req, res) => {
  res.json({
    message: 'YouTube Video Summarizer Pro - Backend API',
    version: '1.0.0',
    endpoints: {
      health: '/health',
      admin: '/admin',
      api: '/api/*'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not Found',
    path: req.path
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS policy violation' });
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

module.exports = app;
