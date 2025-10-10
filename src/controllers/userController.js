// User Controller - User Management
const { query } = require('../config/database');

// Simple in-memory cache for performance optimization
const cache = {
  apiKey: { value: null, expiry: 0 },
  userConfigs: new Map() // Map of extensionUserId -> { config, expiry }
};

const CACHE_TTL = {
  API_KEY: 5 * 60 * 1000, // 5 minutes
  USER_CONFIG: 2 * 60 * 1000 // 2 minutes
};

// Helper function to get cached API key
async function getCachedApiKey() {
  const now = Date.now();

  // Return cached value if still valid
  if (cache.apiKey.value && cache.apiKey.expiry > now) {
    console.log('✅ Using cached OpenRouter API key');
    return cache.apiKey.value;
  }

  // Fetch from database
  const apiKeyResult = await query(
    `SELECT setting_value FROM system_settings WHERE setting_key = 'openrouter_api_key'`
  );
  const dbApiKey = (apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].setting_value)
    ? apiKeyResult.rows[0].setting_value
    : '';
  const apiKey = dbApiKey || process.env.OPENROUTER_API_KEY;

  // Cache the result
  cache.apiKey = {
    value: apiKey,
    expiry: now + CACHE_TTL.API_KEY
  };

  console.log('✅ Fetched and cached OpenRouter API key from:', dbApiKey ? 'Admin Panel (Database)' : 'Railway Environment Variable');
  return apiKey;
}

// Helper function to get cached user configuration
async function getCachedUserConfig(extensionUserId) {
  const now = Date.now();

  // Return cached value if still valid
  const cached = cache.userConfigs.get(extensionUserId);
  if (cached && cached.expiry > now) {
    console.log('✅ Using cached user configuration for:', extensionUserId);
    return cached.config;
  }

  // Fetch from database
  const userResult = await query(
    `SELECT u.*, mc.model_id, mc.model_name, mc.max_output_tokens,
            mc.cost_per_1m_input, mc.cost_per_1m_output
     FROM users u
     LEFT JOIN model_configs mc ON u.tier = mc.tier
     WHERE u.extension_user_id = $1`,
    [extensionUserId]
  );

  if (userResult.rows.length === 0) {
    return null;
  }

  const config = userResult.rows[0];

  // Cache the result
  cache.userConfigs.set(extensionUserId, {
    config,
    expiry: now + CACHE_TTL.USER_CONFIG
  });

  console.log('✅ Fetched and cached user configuration for:', extensionUserId);
  return config;
}

// Track processed videos to avoid double-counting
const processedVideosToday = new Map(); // videoId -> date

// Helper function to track usage asynchronously (fire and forget)
// NOTE: This tracks tokens/cost per API call (chunk), not per video
// Only increments video count once per unique videoId per day
async function trackUsageAsync(userId, extensionUserId, totalTokens, totalCost, videoId) {
  try {
    const today = new Date().toISOString().split('T')[0];
    const videoKey = `${userId}_${videoId}_${today}`;

    // Check if we've already counted this video today
    const isFirstTimeToday = !processedVideosToday.has(videoKey);

    if (isFirstTimeToday) {
      // Mark this video as processed today
      processedVideosToday.set(videoKey, Date.now());

      // First time processing this video today - increment video count
      await query(
        `INSERT INTO user_usage (user_id, extension_user_id, date, videos_processed, tokens_used, api_calls, cost_incurred)
         VALUES ($1, $2, CURRENT_DATE, 1, $3, 1, $4)
         ON CONFLICT (user_id, date)
         DO UPDATE SET
           videos_processed = user_usage.videos_processed + 1,
           tokens_used = user_usage.tokens_used + $3,
           api_calls = user_usage.api_calls + 1,
           cost_incurred = user_usage.cost_incurred + $4`,
        [userId, extensionUserId, totalTokens, totalCost]
      );
      console.log('✅ Usage tracked (NEW video) for user:', extensionUserId, '| Video:', videoId);
    } else {
      // Subsequent chunks of same video - only track tokens/cost, not video count
      await query(
        `INSERT INTO user_usage (user_id, extension_user_id, date, videos_processed, tokens_used, api_calls, cost_incurred)
         VALUES ($1, $2, CURRENT_DATE, 0, $3, 1, $4)
         ON CONFLICT (user_id, date)
         DO UPDATE SET
           tokens_used = user_usage.tokens_used + $3,
           api_calls = user_usage.api_calls + 1,
           cost_incurred = user_usage.cost_incurred + $4`,
        [userId, extensionUserId, totalTokens, totalCost]
      );
      console.log('✅ Usage tracked (chunk of existing video) for user:', extensionUserId, '| Video:', videoId);
    }

    // Clean up old entries (older than 2 days) to prevent memory leak
    const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
    for (const [key, timestamp] of processedVideosToday.entries()) {
      if (timestamp < twoDaysAgo) {
        processedVideosToday.delete(key);
      }
    }
  } catch (error) {
    console.error('⚠️ Failed to track usage:', error);
  }
}

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

    // Invalidate user cache when tier is updated
    cache.userConfigs.delete(extensionUserId);
    console.log('🗑️ Cache invalidated for user:', extensionUserId);

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
      modelConfig: {
        modelId: user.model_id,
        modelName: user.model_name,
        maxOutputTokens: user.max_output_tokens || 4096,
        maxTokens: user.max_output_tokens || 4096,
        chunkSize: 4000,
        costPer1MInput: parseFloat(user.cost_per_1m_input || 0),
        costPer1MOutput: parseFloat(user.cost_per_1m_output || 0),
        contextWindow: user.context_window || 128000
      },
      tier: user.tier,
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

// Process video for managed users (backend handles OpenRouter API call)
const processVideo = async (req, res) => {
  const startTime = Date.now();

  try {
    const { extensionUserId } = req.params;
    const { videoId, transcript, prompt, maxTokens, isFirstChunk } = req.body;

    console.log('🔵 Processing video for managed user:', extensionUserId, '| First chunk:', isFirstChunk);

    // Validate inputs
    if (!extensionUserId) {
      return res.status(400).json({ error: 'Extension user ID is required' });
    }

    if (!transcript || !prompt) {
      return res.status(400).json({ error: 'Transcript and prompt are required' });
    }

    // Fetch user config and API key in parallel using cached helpers
    const [user, apiKey] = await Promise.all([
      getCachedUserConfig(extensionUserId),
      getCachedApiKey()
    ]);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Only allow managed/trial users to use this endpoint
    if (user.tier !== 'managed' && user.tier !== 'trial') {
      return res.status(403).json({
        error: 'This endpoint is only for managed and trial users. BYOK users should use their own API key.'
      });
    }

    if (!apiKey) {
      console.error('❌ No OpenRouter API key found in database or environment');
      return res.status(500).json({
        error: 'OpenRouter API key not configured. Please set it in Admin Panel Settings or Railway environment variables.'
      });
    }

    console.log('🤖 Model for', user.tier, 'tier:', user.model_id);

    // Prepare OpenRouter API request
    const modelId = user.model_id || 'google/gemini-2.5-flash-lite-preview-09-2025';
    const maxOutputTokens = Math.min(maxTokens || 4096, user.max_output_tokens || 8192);

    // Call OpenRouter API
    console.log('📡 Calling OpenRouter API...');
    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://youtube-summarizer-pro.com',
        'X-Title': 'YouTube Video Summarizer Pro - Managed Service',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: maxOutputTokens,
        temperature: 0.7
      })
    });

    if (!openRouterResponse.ok) {
      const errorData = await openRouterResponse.json();
      console.error('❌ OpenRouter API error:', errorData);
      return res.status(openRouterResponse.status).json({
        error: errorData.error?.message || 'OpenRouter API request failed',
        details: errorData
      });
    }

    const data = await openRouterResponse.json();
    console.log('✅ OpenRouter API call successful');

    // Extract response content
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      console.error('❌ No content in OpenRouter response:', data);
      return res.status(500).json({ error: 'No content received from OpenRouter API' });
    }

    // Calculate usage and cost
    const inputTokens = data.usage?.prompt_tokens || 0;
    const outputTokens = data.usage?.completion_tokens || 0;
    const totalTokens = data.usage?.total_tokens || (inputTokens + outputTokens);

    const inputCost = (inputTokens / 1000000) * (user.cost_per_1m_input || 0);
    const outputCost = (outputTokens / 1000000) * (user.cost_per_1m_output || 0);
    const totalCost = inputCost + outputCost;

    console.log('💰 Usage:', {
      inputTokens,
      outputTokens,
      totalTokens,
      cost: `$${totalCost.toFixed(4)}`
    });

    // Track usage asynchronously (fire and forget - don't block response)
    // Only increment video count once per unique videoId per day
    trackUsageAsync(user.id, extensionUserId, totalTokens, totalCost, videoId).catch(err => {
      console.error('⚠️ Async usage tracking failed:', err);
    });

    // Calculate and log performance metrics
    const totalTime = Date.now() - startTime;
    console.log(`⚡ Performance: Total processing time: ${totalTime}ms`);

    // Return successful response immediately (without waiting for usage tracking)
    res.json({
      success: true,
      content: content,
      usage: {
        inputTokens,
        outputTokens,
        totalTokens,
        cost: totalCost
      },
      model: modelId,
      tier: user.tier,
      processingTime: totalTime
    });

  } catch (error) {
    console.error('❌ Error in processVideo:', error);
    res.status(500).json({
      error: 'Failed to process video',
      message: error.message
    });
  }
};

module.exports = {
  getOrCreateUser,
  updateUserTier,
  getUserModel,
  trackUsage,
  getUserStats,
  processVideo,
  // Export cache getter for admin controller to invalidate API key cache
  getCache: () => cache
};
