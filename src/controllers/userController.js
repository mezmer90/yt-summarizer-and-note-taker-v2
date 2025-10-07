// User Controller - User Management
const { query } = require('../config/database');

// Get or create user
const getOrCreateUser = async (req, res) => {
  try {
    const { extensionUserId, email, tier, planName } = req.body;

    if (!extensionUserId) {
      return res.status(400).json({ error: 'Extension user ID is required' });
    }

    // Check if user exists
    let result = await query(
      'SELECT * FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    let user;
    if (result.rows.length === 0) {
      // Create new user
      result = await query(
        `INSERT INTO users (extension_user_id, email, tier, plan_name)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [extensionUserId, email || null, tier || 'free', planName || null]
      );
      user = result.rows[0];
      console.log('✅ New user created:', extensionUserId);
    } else {
      user = result.rows[0];
    }

    res.json({ success: true, user });
  } catch (error) {
    console.error('Error in getOrCreateUser:', error);
    res.status(500).json({ error: 'Failed to get or create user' });
  }
};

// Update user tier (called when user upgrades)
const updateUserTier = async (req, res) => {
  try {
    const { extensionUserId, tier, planName, email } = req.body;

    if (!extensionUserId || !tier) {
      return res.status(400).json({ error: 'Extension user ID and tier are required' });
    }

    const result = await query(
      `UPDATE users
       SET tier = $1, plan_name = $2, email = COALESCE($3, email), updated_at = NOW()
       WHERE extension_user_id = $4
       RETURNING *`,
      [tier, planName, email, extensionUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    console.log('✅ User tier updated:', extensionUserId, '->', tier);
    res.json({ success: true, user: result.rows[0] });
  } catch (error) {
    console.error('Error in updateUserTier:', error);
    res.status(500).json({ error: 'Failed to update user tier' });
  }
};

// Get user's assigned model
const getUserModel = async (req, res) => {
  try {
    const { extensionUserId } = req.params;

    if (!extensionUserId) {
      return res.status(400).json({ error: 'Extension user ID is required' });
    }

    // Get user and their model configuration
    const result = await query(
      `SELECT u.*, mc.model_id, mc.model_name, mc.max_output_tokens,
              mc.cost_per_1m_input, mc.cost_per_1m_output, mc.context_window
       FROM users u
       LEFT JOIN model_configs mc ON u.tier = mc.tier
       WHERE u.extension_user_id = $1`,
      [extensionUserId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];

    // Check if user needs to provide their own API key
    const settingResult = await query(
      `SELECT setting_value FROM system_settings
       WHERE setting_key = $1`,
      [`require_api_key_for_${user.tier}`]
    );

    const requiresApiKey = settingResult.rows.length > 0
      ? settingResult.rows[0].setting_value === 'true'
      : true;

    res.json({
      success: true,
      user: {
        extensionUserId: user.extension_user_id,
        tier: user.tier,
        planName: user.plan_name
      },
      model: {
        modelId: user.model_id,
        modelName: user.model_name,
        maxOutputTokens: user.max_output_tokens,
        costPer1MInput: parseFloat(user.cost_per_1m_input),
        costPer1MOutput: parseFloat(user.cost_per_1m_output),
        contextWindow: user.context_window
      },
      requiresApiKey
    });
  } catch (error) {
    console.error('Error in getUserModel:', error);
    res.status(500).json({ error: 'Failed to get user model' });
  }
};

// Track user usage
const trackUsage = async (req, res) => {
  try {
    const { extensionUserId, videosProcessed, tokensUsed, costIncurred } = req.body;

    if (!extensionUserId) {
      return res.status(400).json({ error: 'Extension user ID is required' });
    }

    // Get user ID
    const userResult = await query(
      'SELECT id FROM users WHERE extension_user_id = $1',
      [extensionUserId]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userId = userResult.rows[0].id;

    // Insert or update usage for today
    await query(
      `INSERT INTO user_usage (user_id, extension_user_id, date, videos_processed, tokens_used, api_calls, cost_incurred)
       VALUES ($1, $2, CURRENT_DATE, $3, $4, 1, $5)
       ON CONFLICT (user_id, date)
       DO UPDATE SET
         videos_processed = user_usage.videos_processed + $3,
         tokens_used = user_usage.tokens_used + $4,
         api_calls = user_usage.api_calls + 1,
         cost_incurred = user_usage.cost_incurred + $5`,
      [userId, extensionUserId, videosProcessed || 1, tokensUsed || 0, costIncurred || 0]
    );

    res.json({ success: true, message: 'Usage tracked' });
  } catch (error) {
    console.error('Error in trackUsage:', error);
    res.status(500).json({ error: 'Failed to track usage' });
  }
};

// Get user statistics
const getUserStats = async (req, res) => {
  try {
    const { extensionUserId } = req.params;

    const result = await query(
      `SELECT
         COALESCE(SUM(videos_processed), 0) as total_videos,
         COALESCE(SUM(tokens_used), 0) as total_tokens,
         COALESCE(SUM(cost_incurred), 0) as total_cost,
         COALESCE(SUM(CASE WHEN date = CURRENT_DATE THEN videos_processed ELSE 0 END), 0) as videos_today,
         COALESCE(SUM(CASE WHEN date > CURRENT_DATE - INTERVAL '7 days' THEN videos_processed ELSE 0 END), 0) as videos_7d,
         COALESCE(SUM(CASE WHEN date > CURRENT_DATE - INTERVAL '30 days' THEN videos_processed ELSE 0 END), 0) as videos_30d
       FROM user_usage
       WHERE extension_user_id = $1`,
      [extensionUserId]
    );

    res.json({ success: true, stats: result.rows[0] });
  } catch (error) {
    console.error('Error in getUserStats:', error);
    res.status(500).json({ error: 'Failed to get user stats' });
  }
};

module.exports = {
  getOrCreateUser,
  updateUserTier,
  getUserModel,
  trackUsage,
  getUserStats
};
