// Setup Model Configurations in Database
// Run with: railway run node setup-model-configs.js

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function setupModelConfigs() {
  try {
    console.log('🔧 Setting up model configurations...\n');

    // Check current model_configs
    console.log('📋 Current model_configs:');
    const currentConfigs = await pool.query('SELECT tier, model_id, model_name FROM model_configs ORDER BY tier;');

    if (currentConfigs.rows.length === 0) {
      console.log('   (empty - no models configured yet)\n');
    } else {
      currentConfigs.rows.forEach(row => {
        console.log(`   ${row.tier}: ${row.model_name} (${row.model_id})`);
      });
      console.log('');
    }

    // Insert/Update model configurations for all tiers
    // Using correct OpenRouter model IDs (verified from https://openrouter.ai/models)
    const modelConfigs = [
      {
        tier: 'free',
        model_id: 'google/gemini-2.5-flash-lite-preview-09-2025',
        model_name: 'Gemini 2.5 Flash Lite',
        max_output_tokens: 8192,
        cost_per_1m_input: 0.10,
        cost_per_1m_output: 0.40,
        context_window: 1048576
      },
      {
        tier: 'premium',
        model_id: 'google/gemini-2.5-flash-preview-09-2025',
        model_name: 'Gemini 2.5 Flash',
        max_output_tokens: 8192,
        cost_per_1m_input: 0.30,
        cost_per_1m_output: 2.50,
        context_window: 1048576
      },
      {
        tier: 'unlimited',
        model_id: 'anthropic/claude-sonnet-4.5',
        model_name: 'Claude Sonnet 4.5',
        max_output_tokens: 8192,
        cost_per_1m_input: 3.00,
        cost_per_1m_output: 15.00,
        context_window: 1000000
      },
      {
        tier: 'managed',
        model_id: 'anthropic/claude-sonnet-4.5',
        model_name: 'Claude Sonnet 4.5',
        max_output_tokens: 8192,
        cost_per_1m_input: 3.00,
        cost_per_1m_output: 15.00,
        context_window: 1000000
      },
      {
        tier: 'trial',
        model_id: 'google/gemini-2.5-flash-lite-preview-09-2025',
        model_name: 'Gemini 2.5 Flash Lite',
        max_output_tokens: 8192,
        cost_per_1m_input: 0.10,
        cost_per_1m_output: 0.40,
        context_window: 1048576
      }
    ];

    console.log('💾 Inserting/updating model configurations...\n');

    for (const config of modelConfigs) {
      const result = await pool.query(
        `INSERT INTO model_configs (tier, model_id, model_name, max_output_tokens, cost_per_1m_input, cost_per_1m_output, context_window)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tier)
         DO UPDATE SET
           model_id = EXCLUDED.model_id,
           model_name = EXCLUDED.model_name,
           max_output_tokens = EXCLUDED.max_output_tokens,
           cost_per_1m_input = EXCLUDED.cost_per_1m_input,
           cost_per_1m_output = EXCLUDED.cost_per_1m_output,
           context_window = EXCLUDED.context_window,
           updated_at = NOW()
         RETURNING tier, model_name;`,
        [
          config.tier,
          config.model_id,
          config.model_name,
          config.max_output_tokens,
          config.cost_per_1m_input,
          config.cost_per_1m_output,
          config.context_window
        ]
      );

      console.log(`   ✅ ${result.rows[0].tier}: ${result.rows[0].model_name}`);
    }

    console.log('\n📋 Updated model_configs:');
    const updatedConfigs = await pool.query('SELECT tier, model_id, model_name, max_output_tokens FROM model_configs ORDER BY tier;');
    updatedConfigs.rows.forEach(row => {
      console.log(`   ${row.tier}: ${row.model_name} (${row.model_id}) - ${row.max_output_tokens} tokens`);
    });

    console.log('\n✅ Model configurations setup complete!\n');

  } catch (error) {
    console.error('❌ Error setting up model configs:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

// Run the setup
setupModelConfigs()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(error => {
    console.error('Setup failed:', error);
    process.exit(1);
  });
