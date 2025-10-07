const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('Running email verification migration...');

    // Add email verification columns
    await pool.query(`
      ALTER TABLE student_verifications
      ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP
    `);

    console.log('✅ Added email verification columns');

    // Create index
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_verification_token
      ON student_verifications(verification_token)
    `);

    console.log('✅ Created index on verification_token');

    // Verify columns were added
    const result = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'student_verifications'
      ORDER BY ordinal_position
    `);

    console.log('\n📋 Current table schema:');
    result.rows.forEach(row => {
      console.log(`  - ${row.column_name}: ${row.data_type} (nullable: ${row.is_nullable})`);
    });

    console.log('\n✅ Email verification migration completed successfully!');

  } catch (error) {
    console.error('❌ Migration error:', error);
  } finally {
    await pool.end();
  }
}

runMigration();
