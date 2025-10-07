// Authentication Middleware
const { verifyToken } = require('../config/jwt');

// Admin authentication middleware
const requireAdmin = (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    const decoded = verifyToken(token);

    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    req.admin = decoded;
    next();
  } catch (error) {
    console.error('Auth error:', error);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// Extension authentication middleware (optional - for future use)
const requireExtension = (req, res, next) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const extensionId = req.headers['x-extension-id'];

    // For now, just verify extension ID matches
    if (extensionId !== process.env.EXTENSION_ID) {
      return res.status(403).json({ error: 'Invalid extension' });
    }

    next();
  } catch (error) {
    console.error('Extension auth error:', error);
    return res.status(401).json({ error: 'Authentication failed' });
  }
};

module.exports = {
  requireAdmin,
  requireExtension
};
