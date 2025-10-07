// Admin Controller - Admin Dashboard & Management
const { query } = require('../config/database');
const bcrypt = require('bcryptjs');
const { generateAdminToken } = require('../config/jwt');

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

    if (value === undefined) {
      return res.status(400).json({ error: 'Setting value is required' });
    }

    const result = await query(
      `UPDATE system_settings
       SET setting_value = $1, updated_by = $2, updated_at = NOW()
       WHERE setting_key = $3
       RETURNING *`,
      [value, req.admin?.email || 'system', settingKey]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Setting not found' });
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

    console.log(`✅ Setting updated: ${settingKey} =`, value);
    res.json({ success: true, setting: result.rows[0] });
  } catch (error) {
    console.error('Error in updateSystemSetting:', error);
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

module.exports = {
  adminLogin,
  getDashboardStats,
  getAllUsers,
  getSystemSettings,
  updateSystemSetting,
  getAdminLogs,
  getUsageAnalytics,
  createFirstAdmin
};
