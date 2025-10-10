// Run database migration to update admin_dashboard_stats view
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  try {
    console.log('📝 Reading migration SQL...');
    const sql = fs.readFileSync('./update-dashboard-stats.sql', 'utf8');

    console.log('🔄 Running migration...');
    await pool.query(sql);

    console.log('✅ Migration completed successfully!');
    console.log('📊 admin_dashboard_stats view updated with total_videos and total_cost columns');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
