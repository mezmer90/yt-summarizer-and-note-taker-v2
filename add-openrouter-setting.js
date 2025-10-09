// Add openrouter_api_key setting to system_settings table
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function addOpenRouterSetting() {
  try {
    console.log('🔵 Checking if openrouter_api_key setting exists...');

    // Check if setting exists
    const checkResult = await pool.query(
      `SELECT * FROM system_settings WHERE setting_key = 'openrouter_api_key'`
    );

    if (checkResult.rows.length > 0) {
      console.log('✅ openrouter_api_key setting already exists:');
      console.log('   Value:', checkResult.rows[0].setting_value || '(empty)');
      console.log('   Description:', checkResult.rows[0].description);
      return;
    }

    console.log('⚠️  openrouter_api_key setting does not exist. Creating it...');

    // Insert the setting
    const insertResult = await pool.query(
      `INSERT INTO system_settings (setting_key, setting_value, description)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [
        'openrouter_api_key',
        '',
        'OpenRouter API key for managed users and AI verification (uses Railway environment variable as fallback if empty)'
      ]
    );

    console.log('✅ openrouter_api_key setting created successfully!');
    console.log('   Setting Key:', insertResult.rows[0].setting_key);
    console.log('   Description:', insertResult.rows[0].description);
    console.log('\n💡 You can now set the API key in the Admin Panel Settings tab.');

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
  } finally {
    await pool.end();
  }
}

addOpenRouterSetting();
