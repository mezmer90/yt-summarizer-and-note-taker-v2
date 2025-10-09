// Rate Limiting Middleware
const rateLimit = require('express-rate-limit');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: parseInt(process.env.MAX_REQUESTS_PER_MINUTE) || 60,
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  // Skip validation errors in production (Railway proxy is trusted)
  validate: process.env.NODE_ENV === 'production' ? false : { xForwardedForHeader: false }
});

// Strict limiter for sensitive endpoints
const strictLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many attempts, please try again later',
  standardHeaders: true,
  legacyHeaders: false,
  validate: process.env.NODE_ENV === 'production' ? false : { xForwardedForHeader: false }
});

// Admin login limiter
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  message: 'Too many login attempts, please try again after 15 minutes',
  standardHeaders: true,
  legacyHeaders: false,
  validate: process.env.NODE_ENV === 'production' ? false : { xForwardedForHeader: false }
});

module.exports = {
  apiLimiter,
  strictLimiter,
  loginLimiter
};
