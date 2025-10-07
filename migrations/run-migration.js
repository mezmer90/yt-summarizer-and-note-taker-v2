// Migration script to create student_verifications table
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  try {
    console.log('🔄 Running migration: Create student_verifications table...');

    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS student_verifications (
        id SERIAL PRIMARY KEY,
        extension_user_id VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        student_id_url TEXT,
        university_name VARCHAR(255),
        graduation_year INTEGER,
        status VARCHAR(50) DEFAULT 'pending',
        requested_at TIMESTAMP DEFAULT NOW(),
        reviewed_by VARCHAR(255),
        reviewed_at TIMESTAMP,
        rejection_reason TEXT,
        expires_at TIMESTAMP
      );
    `);
    console.log('✅ Table student_verifications created');

    // Create indexes
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_verifications_extension_id
      ON student_verifications(extension_user_id);
    `);
    console.log('✅ Index idx_student_verifications_extension_id created');

    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_student_verifications_status
      ON student_verifications(status);
    `);
    console.log('✅ Index idx_student_verifications_status created');

    // Verify
    const result = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_name = 'student_verifications';
    `);

    if (result.rows.length > 0) {
      console.log('✅ Migration successful! Table exists in database.');
    } else {
      console.log('❌ Migration failed - table not found');
    }

  } catch (error) {
    console.error('❌ Migration error:', error.message);
  } finally {
    await pool.end();
  }
}

runMigration();
