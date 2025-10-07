// JWT Configuration
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d'; // Token expires in 7 days

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN
  });
};

// Verify JWT token
const verifyToken = (token) => {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

// Generate admin token
const generateAdminToken = (email) => {
  return generateToken({
    email,
    role: 'admin',
    type: 'admin_session'
  });
};

// Generate verification token (for email links)
const generateVerificationToken = () => {
  const crypto = require('crypto');
  return crypto.randomBytes(32).toString('hex');
};

module.exports = {
  generateToken,
  verifyToken,
  generateAdminToken,
  generateVerificationToken,
  JWT_SECRET
};
