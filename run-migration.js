// Run database migration
const { Pool } = require('pg');
const fs = require('fs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function runMigration() {
  try {
    const migrationFile = process.argv[2] || './update-dashboard-stats.sql';

    console.log(`📝 Reading migration file: ${migrationFile}...`);
    const sql = fs.readFileSync(migrationFile, 'utf8');

    console.log('🔄 Running migration...');
    await pool.query(sql);

    console.log('✅ Migration completed successfully!');

    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
