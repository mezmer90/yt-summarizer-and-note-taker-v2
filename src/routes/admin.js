// Admin Routes
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimiter');
const {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  getSystemSettings,
  updateSystemSetting,
  getAdminLogs,
  getUsageAnalytics,
  createFirstAdmin
} = require('../controllers/adminController');
const {
  getAllModels,
  updateModelForTier,
  getModelByTier
} = require('../controllers/modelController');
const { sendEmail } = require('../services/emailService');

// Public routes
router.post('/admin/login', loginLimiter, adminLogin);
router.post('/admin/setup', createFirstAdmin); // Only works if no admins exist

// Protected routes (require admin authentication)
router.get('/admin/stats', requireAdmin, getDashboardStats);
router.get('/admin/users', requireAdmin, getAllUsers);
router.get('/admin/settings', requireAdmin, getSystemSettings);
router.put('/admin/settings/:settingKey', requireAdmin, updateSystemSetting);
router.get('/admin/logs', requireAdmin, getAdminLogs);
router.get('/admin/analytics', requireAdmin, getUsageAnalytics);

// Model management routes
router.get('/admin/models', requireAdmin, getAllModels);
router.get('/admin/models/:tier', requireAdmin, getModelByTier);
router.put('/admin/models/:tier', requireAdmin, updateModelForTier);

// Test email endpoint
router.post('/admin/test-email', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email address is required'
      });
    }

    // Send test email
    const subject = '✅ Email Service Test - YouTube Summarizer Pro';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">✅ Email Test Successful!</h1>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2>Your Email Service is Working!</h2>

          <p>This is a test email from the YouTube Summarizer Pro admin dashboard.</p>

          <div style="background: #e8f5e9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
            <strong>✓ Configuration Status:</strong>
            <ul style="margin: 10px 0;">
              <li>SMTP connection: ✅ Working</li>
              <li>Email sending: ✅ Working</li>
              <li>Email delivery: ✅ Working</li>
            </ul>
          </div>

          <p><strong>What this means:</strong></p>
          <ul>
            <li>Student verification emails will work</li>
            <li>Approval notification emails will work</li>
            <li>Your email service is configured correctly</li>
          </ul>

          <p style="margin-top: 30px; color: #666; font-size: 14px;">
            This test was initiated from the admin dashboard by: ${req.admin.email}
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #666; font-size: 12px;">
          <p>YouTube Summarizer Pro - Admin Dashboard</p>
        </div>
      </div>
    `;

    const result = await sendEmail({ to: email, subject, html });

    if (result.success) {
      res.json({
        success: true,
        message: 'Test email sent successfully',
        from: process.env.EMAIL_USER,
        messageId: result.messageId
      });
    } else {
      res.status(500).json({
        success: false,
        message: result.error || 'Failed to send test email'
      });
    }

  } catch (error) {
    console.error('Error sending test email:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to send test email'
    });
  }
});

module.exports = router;
