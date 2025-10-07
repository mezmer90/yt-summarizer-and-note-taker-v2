// User Routes
const express = require('express');
const router = express.Router();
const {
  getOrCreateUser,
  updateUserTier,
  getUserModel,
  trackUsage,
  getUserStats
} = require('../controllers/userController');

// Public routes (called by extension)
router.post('/user', getOrCreateUser);
router.post('/user/tier', updateUserTier);
router.get('/user/:extensionUserId/model', getUserModel);
router.post('/user/usage', trackUsage);
router.get('/user/:extensionUserId/stats', getUserStats);

module.exports = router;
