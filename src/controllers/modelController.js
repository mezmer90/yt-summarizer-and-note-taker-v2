// Model Controller - Model Configuration Management
const { query } = require('../config/database');

// Get all model configurations
const getAllModels = async (req, res) => {
  try {
    const result = await query(
      `SELECT * FROM model_configs ORDER BY
       CASE tier
         WHEN 'free' THEN 1
         WHEN 'trial' THEN 2
         WHEN 'premium' THEN 3
         WHEN 'unlimited' THEN 4
         WHEN 'managed' THEN 5
         ELSE 6
       END`
    );

    res.json({ success: true, models: result.rows });
  } catch (error) {
    console.error('Error in getAllModels:', error);
    res.status(500).json({ error: 'Failed to get model configurations' });
  }
};

// Update model for a tier (Admin only)
const updateModelForTier = async (req, res) => {
  try {
    const { tier } = req.params;
    const { modelId, modelName, maxOutputTokens, costPer1MInput, costPer1MOutput, contextWindow } = req.body;

    if (!modelId || !modelName) {
      return res.status(400).json({ error: 'Model ID and name are required' });
    }

    const result = await query(
      `UPDATE model_configs
       SET model_id = $1, model_name = $2, max_output_tokens = $3,
           cost_per_1m_input = $4, cost_per_1m_output = $5, context_window = $6,
           updated_by = $7, updated_at = NOW()
       WHERE tier = $8
       RETURNING *`,
      [modelId, modelName, maxOutputTokens, costPer1MInput, costPer1MOutput, contextWindow, req.admin?.email || 'system', tier]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Tier not found' });
    }

    // Log admin action
    await query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, details)
       VALUES ($1, $2, $3, $4)`,
      [
        req.admin?.email || 'system',
        'UPDATE_MODEL',
        'model_configs',
        JSON.stringify({ tier, modelId, modelName })
      ]
    );

    console.log(`✅ Model updated for ${tier} tier:`, modelName);
    res.json({ success: true, model: result.rows[0] });
  } catch (error) {
    console.error('Error in updateModelForTier:', error);
    res.status(500).json({ error: 'Failed to update model' });
  }
};

// Get model for specific tier
const getModelByTier = async (req, res) => {
  try {
    const { tier } = req.params;

    const result = await query(
      'SELECT * FROM model_configs WHERE tier = $1',
      [tier]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Model configuration not found for this tier' });
    }

    res.json({ success: true, model: result.rows[0] });
  } catch (error) {
    console.error('Error in getModelByTier:', error);
    res.status(500).json({ error: 'Failed to get model configuration' });
  }
};

module.exports = {
  getAllModels,
  updateModelForTier,
  getModelByTier
};
