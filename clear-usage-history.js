// Clear all usage history and stats for fresh testing
require('dotenv').config();
const pool = require('./src/config/database');

async function clearUsageHistory() {
  console.log('🧹 Clearing usage history and stats...\n');

  try {
    // Show current stats
    const beforeStats = await pool.query('SELECT * FROM admin_dashboard_stats');
    console.log('📊 Current stats:');
    console.log(`   - Videos today: ${beforeStats.rows[0].videos_today}`);
    console.log(`   - Cost today: $${beforeStats.rows[0].cost_today}`);
    console.log(`   - Videos 30d: ${beforeStats.rows[0].videos_30d}`);
    console.log(`   - Cost 30d: $${beforeStats.rows[0].cost_30d}`);
    console.log('');

    // Clear user_usage table
    console.log('🔄 Clearing user_usage table...');
    const usageResult = await pool.query('DELETE FROM user_usage RETURNING *');
    console.log(`✅ Deleted ${usageResult.rowCount} usage records`);
    console.log('');

    // Clear payment_events table (optional)
    console.log('🔄 Clearing payment_events table...');
    const paymentResult = await pool.query('DELETE FROM payment_events RETURNING *');
    console.log(`✅ Deleted ${paymentResult.rowCount} payment event records`);
    console.log('');

    // Show final stats
    const afterStats = await pool.query('SELECT * FROM admin_dashboard_stats');
    console.log('📊 Updated stats:');
    console.log(`   - Videos today: ${afterStats.rows[0].videos_today}`);
    console.log(`   - Cost today: $${afterStats.rows[0].cost_today}`);
    console.log(`   - Videos 30d: ${afterStats.rows[0].videos_30d}`);
    console.log(`   - Cost 30d: $${afterStats.rows[0].cost_30d}`);
    console.log('');

    console.log('✅ All usage history cleared! Admin dashboard will show fresh stats.\n');

  } catch (error) {
    console.error('❌ Error clearing usage history:', error.message);
    console.error(error);
    process.exit(1);
  }
}

clearUsageHistory();
