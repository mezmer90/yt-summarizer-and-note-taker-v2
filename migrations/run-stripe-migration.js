// Migration script to add Stripe fields to users table
// Run this on Railway after deploying the backend

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

// Use DATABASE_URL from environment (Railway sets this automatically)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  const client = await pool.connect();

  try {
    console.log('🚀 Starting Stripe fields migration...');

    // Read the SQL migration file
    const migrationSQL = fs.readFileSync(
      path.join(__dirname, '002_add_stripe_fields.sql'),
      'utf8'
    );

    // Execute the migration
    await client.query(migrationSQL);

    console.log('✅ Stripe fields migration completed successfully!');

    // Verify the new columns
    const result = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      AND column_name LIKE 'stripe%'
      OR column_name LIKE '%subscription%'
      OR column_name LIKE '%trial%'
      OR column_name = 'payment_method_id'
      ORDER BY column_name;
    `);

    console.log('\n📋 New columns added:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name} (${row.data_type})`);
    });

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration();
