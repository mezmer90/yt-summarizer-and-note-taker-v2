const { Pool } = require('pg');

const pool = new Pool({
  connectionString: 'postgresql://postgres:tACvkVvYTtyCqkDevADBNxlwNEhKuykY@trolley.proxy.rlwy.net:42508/railway',
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  try {
    console.log('Running email verification migration...');

    await pool.query(`
      CREATE TABLE IF NOT EXISTS email_verifications (
        id SERIAL PRIMARY KEY,
        extension_user_id VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        verification_code VARCHAR(6) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at TIMESTAMP NOT NULL,
        verified BOOLEAN DEFAULT FALSE,
        attempts INT DEFAULT 0,
        UNIQUE(extension_user_id)
      );

      CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(extension_user_id);
      CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
      CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(verification_code);
      CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at);
    `);

    console.log('✅ Email verification table created successfully');
    await pool.end();
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
