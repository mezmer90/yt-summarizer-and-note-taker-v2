// Admin Controller - Admin Dashboard & Management
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateAdminToken } = require('../config/jwt');

// Import cache from userController to invalidate when needed
let userControllerCache = null;
try {
  const userController = require('./userController');
  // Access the cache through a getter function we'll add
  userControllerCache = userController.getCache ? userController.getCache() : null;
} catch (err) {
  console.log('⚠️ Could not access userController cache for invalidation');
}

// Admin login
const adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;
    console.log('🔐 Login attempt for:', email);

    if (!email || !password) {
      console.log('❌ Missing email or password');
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Get admin user
    console.log('📝 Querying database for admin user...');
    const result = await query(
      'SELECT * FROM admin_users WHERE email = $1 AND is_active = true',
      [email]
    );

    console.log('📊 Query result:', result.rows.length, 'rows found');

    if (result.rows.length === 0) {
      console.log('❌ No admin user found with email:', email);
      return res.status(401).json({ error: 'Invalid credentials - user not found' });
    }

    const admin = result.rows[0];
    console.log('👤 Admin user found:', admin.email, '| Active:', admin.is_active);

    // Verify password
    console.log('🔑 Verifying password...');
    const validPassword = await bcrypt.compare(password, admin.password_hash);
    console.log('🔑 Password valid:', validPassword);

    if (!validPassword) {
      console.log('❌ Invalid password for:', email);
      return res.status(401).json({ error: 'Invalid credentials - wrong password' });
    }

    // Update last login
    console.log('📝 Updating last login timestamp...');
    await query(
      'UPDATE admin_users SET last_login = NOW() WHERE id = $1',
      [admin.id]
    );

    // Generate JWT token
    console.log('🎫 Generating JWT token...');
    const token = generateAdminToken(admin.email);

    console.log('✅ Admin login successful:', admin.email);
    res.json({
      success: true,
      token,
      admin: {
        email: admin.email,
        name: admin.name,
        role: admin.role
      }
    });
  } catch (error) {
    console.error('💥 Error in adminLogin:', error.message);
    console.error('💥 Full error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  }
};

// Get dashboard statistics
const getDashboardStats = async (req, res) => {
  try {
    const result = await query('SELECT * FROM admin_dashboard_stats');

    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('Error in getDashboardStats:', error);
    res.status(500).json({ error: 'Failed to get dashboard stats' });
  }
};

// Get all users with details
const getAllUsers = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const offset = (page - 1) * limit;

    const result = await query(
      `SELECT * FROM user_details
       ORDER BY created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    const countResult = await query('SELECT COUNT(*) FROM users');
    const totalUsers = parseInt(countResult.rows[0].count);

    res.json({
      success: true,
      users: result.rows,
      pagination: {
        page,
        limit,
        totalUsers,
        totalPages: Math.ceil(totalUsers / limit)
      }
    });
  } catch (error) {
    console.error('Error in getAllUsers:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
};

// Get system settings
const getSystemSettings = async (req, res) => {
  try {
    const result = await query('SELECT * FROM system_settings ORDER BY setting_key');

    // Convert to key-value object
    const settings = {};
    result.rows.forEach(row => {
      settings[row.setting_key] = {
        value: row.setting_value,
        description: row.description,
        updatedBy: row.updated_by,
        updatedAt: row.updated_at
      };
    });

    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error in getSystemSettings:', error);
    res.status(500).json({ error: 'Failed to get system settings' });
  }
};

// Update system setting
const updateSystemSetting = async (req, res) => {
  try {
    const { settingKey } = req.params;
    const { value } = req.body;

    console.log(`📝 Update setting request: ${settingKey}`);
    console.log(`   Value: "${value}"`);
    console.log(`   Value type: ${typeof value}`);
    console.log(`   Admin: ${req.admin?.email || 'system'}`);

    if (value === undefined) {
      console.log('❌ Value is undefined');
      return res.status(400).json({ error: 'Setting value is required' });
    }

    console.log(`🔄 Executing UPDATE query for ${settingKey}...`);
    const result = await query(
      `UPDATE system_settings
       SET setting_value = $1, updated_by = $2, updated_at = NOW()
       WHERE setting_key = $3
       RETURNING *`,
      [value, req.admin?.email || 'system', settingKey]
    );

    console.log(`   Query returned ${result.rows.length} rows`);

    if (result.rows.length === 0) {
      console.log(`❌ Setting "${settingKey}" not found in database!`);
      return res.status(404).json({ error: 'Setting not found' });
    }

    console.log(`✅ Database update successful`);

    // Invalidate API key cache if the OpenRouter API key was updated
    if (settingKey === 'openrouter_api_key' && userControllerCache) {
      userControllerCache.apiKey = { value: null, expiry: 0 };
      console.log('🗑️ OpenRouter API key cache invalidated');
    }

    // Log admin action
    await query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, details)
       VALUES ($1, $2, $3, $4)`,
      [
        req.admin?.email || 'system',
        'UPDATE_SETTING',
        'system_settings',
        JSON.stringify({ settingKey, value })
      ]
    );

    console.log(`✅ Setting updated: ${settingKey} = "${value}"`);
    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    console.error('❌ Error in updateSystemSetting:', error);
    console.error('   Error name:', error.name);
    console.error('   Error message:', error.message);
    res.status(500).json({ error: 'Failed to update setting' });
  }
};

// Get admin action logs
const getAdminLogs = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;

    const result = await query(
      `SELECT * FROM admin_actions
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    res.json({ success: true, logs: result.rows });
  } catch (error) {
    console.error('Error in getAdminLogs:', error);
    res.status(500).json({ error: 'Failed to get admin logs' });
  }
};

// Get usage analytics
const getUsageAnalytics = async (req, res) => {
  try {
    const days = parseInt(req.query.days) || 30;

    const result = await query(
      `SELECT
         date,
         SUM(videos_processed) as videos,
         SUM(tokens_used) as tokens,
         SUM(cost_incurred) as cost,
         COUNT(DISTINCT user_id) as active_users
       FROM user_usage
       WHERE date > CURRENT_DATE - INTERVAL '${days} days'
       GROUP BY date
       ORDER BY date DESC`,
      []
    );

    res.json({ success: true, analytics: result.rows });
  } catch (error) {
    console.error('Error in getUsageAnalytics:', error);
    res.status(500).json({ error: 'Failed to get usage analytics' });
  }
};

// Create first admin user (use only once)
const createFirstAdmin = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Check if any admin exists
    const checkResult = await query('SELECT COUNT(*) FROM admin_users');
    if (parseInt(checkResult.rows[0].count) > 0) {
      return res.status(403).json({ error: 'Admin users already exist' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO admin_users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, role`,
      [email, passwordHash, name]
    );

    console.log('✅ First admin user created:', email);
    res.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    console.error('Error in createFirstAdmin:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
};

// Get all admin users
const getAllAdmins = async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, name, role, is_active, last_login, created_at FROM admin_users ORDER BY created_at DESC'
    );

    res.json({ success: true, admins: result.rows });
  } catch (error) {
    console.error('Error in getAllAdmins:', error);
    res.status(500).json({ error: 'Failed to get admin users' });
  }
};

// Create new admin user
const createAdmin = async (req, res) => {
  try {
    const { email, password, name, role } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Check if admin already exists
    const existing = await query(
      'SELECT id FROM admin_users WHERE email = $1',
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Admin user with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const result = await query(
      `INSERT INTO admin_users (email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role, is_active`,
      [email, passwordHash, name || 'Admin', role || 'admin', true]
    );

    // Log action
    await query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin?.email || 'system', 'CREATE_ADMIN', 'admin_users', result.rows[0].id, JSON.stringify({ email, name, role })]
    );

    console.log('✅ New admin user created:', email);
    res.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    console.error('Error in createAdmin:', error);
    res.status(500).json({ error: 'Failed to create admin user' });
  }
};

// Update admin user
const updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { email, name, role, is_active } = req.body;

    const result = await query(
      `UPDATE admin_users
       SET email = COALESCE($1, email),
           name = COALESCE($2, name),
           role = COALESCE($3, role),
           is_active = COALESCE($4, is_active)
       WHERE id = $5
       RETURNING id, email, name, role, is_active`,
      [email, name, role, is_active, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    // Log action
    await query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [req.admin?.email || 'system', 'UPDATE_ADMIN', 'admin_users', id, JSON.stringify({ email, name, role, is_active })]
    );

    console.log('✅ Admin user updated:', result.rows[0].email);
    res.json({ success: true, admin: result.rows[0] });
  } catch (error) {
    console.error('Error in updateAdmin:', error);
    res.status(500).json({ error: 'Failed to update admin user' });
  }
};

// Request password reset (sends email with code)
const requestPasswordReset = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Check if admin exists
    const adminResult = await query(
      'SELECT id, email, name FROM admin_users WHERE email = $1',
      [email]
    );

    if (adminResult.rows.length === 0) {
      // Don't reveal if email exists or not (security)
      return res.json({ success: true, message: 'If that email exists, a reset code has been sent' });
    }

    const admin = adminResult.rows[0];

    // Generate 6-digit reset code
    const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

    // Store reset code in database (you might want to create a password_resets table)
    await query(
      `INSERT INTO email_verifications (extension_user_id, email, verification_code, expires_at, verified)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (extension_user_id) DO UPDATE
       SET verification_code = $3, expires_at = $4, verified = $5`,
      [`admin_${admin.id}`, email, resetCode, expiresAt, false]
    );

    // Send email with reset code
    const { sendEmail } = require('../services/emailService');
    await sendEmail({
      to: email,
      subject: 'Admin Password Reset - YouTube Summarizer Pro',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2>Password Reset Request</h2>
          <p>Hello ${admin.name},</p>
          <p>You requested to reset your admin password. Use this code:</p>
          <div style="background: #f0f0f0; padding: 20px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 5px; margin: 20px 0;">
            ${resetCode}
          </div>
          <p>This code expires in 15 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
        </div>
      `
    });

    res.json({ success: true, message: 'Reset code sent to your email' });
  } catch (error) {
    console.error('Error in requestPasswordReset:', error);
    res.status(500).json({ error: 'Failed to send reset code' });
  }
};

// Reset password with code
const resetPassword = async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;

    if (!email || !code || !newPassword) {
      return res.status(400).json({ error: 'Email, code, and new password are required' });
    }

    // Get admin user
    const adminResult = await query(
      'SELECT id FROM admin_users WHERE email = $1',
      [email]
    );

    if (adminResult.rows.length === 0) {
      return res.status(404).json({ error: 'Admin user not found' });
    }

    const adminId = adminResult.rows[0].id;

    // Verify reset code
    const verifyResult = await query(
      `SELECT * FROM email_verifications
       WHERE extension_user_id = $1 AND verification_code = $2 AND expires_at > NOW() AND verified = false`,
      [`admin_${adminId}`, code]
    );

    if (verifyResult.rows.length === 0) {
      return res.status(400).json({ error: 'Invalid or expired reset code' });
    }

    // Update password
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await query(
      'UPDATE admin_users SET password_hash = $1 WHERE id = $2',
      [passwordHash, adminId]
    );

    // Mark code as used
    await query(
      'UPDATE email_verifications SET verified = true WHERE extension_user_id = $1',
      [`admin_${adminId}`]
    );

    // Log action
    await query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, details)
       VALUES ($1, $2, $3, $4)`,
      [email, 'PASSWORD_RESET', 'admin_users', JSON.stringify({ email })]
    );

    console.log('✅ Password reset successful for:', email);
    res.json({ success: true, message: 'Password reset successful' });
  } catch (error) {
    console.error('Error in resetPassword:', error);
    res.status(500).json({ error: 'Failed to reset password' });
  }
};

module.exports = {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  getSystemSettings,
  updateSystemSetting,
  getAdminLogs,
  getUsageAnalytics,
  createFirstAdmin,
  getAllAdmins,
  createAdmin,
  updateAdmin,
  requestPasswordReset,
  resetPassword
};
