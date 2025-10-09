// Initialize Admin User from Environment Variables
// This runs on server startup to ensure admin user exists

const bcrypt = require('bcryptjs');
const { pool } = require('../config/database');

async function initializeAdminUser() {
  try {
    const adminEmail = process.env.ADMIN_EMAIL;
    const adminPassword = process.env.ADMIN_PASSWORD;
    const adminName = process.env.ADMIN_NAME || 'Administrator';

    if (!adminEmail || !adminPassword) {
      console.log('⚠️  No ADMIN_EMAIL or ADMIN_PASSWORD set in environment variables');
      console.log('   Admin user will not be auto-created');
      return;
    }

    // Check if admin user already exists
    const existingAdmin = await pool.query(
      'SELECT id, email FROM admin_users WHERE email = $1',
      [adminEmail]
    );

    if (existingAdmin.rows.length > 0) {
      console.log('✅ Admin user already exists:', adminEmail);
      return;
    }

    // Create admin user
    const passwordHash = await bcrypt.hash(adminPassword, 10);

    const result = await pool.query(
      `INSERT INTO admin_users (email, password_hash, name, role, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, email, name, role`,
      [adminEmail, passwordHash, adminName, 'admin', true]
    );

    console.log('✅ Admin user created successfully:');
    console.log('   Email:', result.rows[0].email);
    console.log('   Name:', result.rows[0].name);
    console.log('   Role:', result.rows[0].role);

  } catch (error) {
    console.error('❌ Error initializing admin user:', error.message);
  }
}

module.exports = { initializeAdminUser };
