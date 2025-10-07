// Database Setup Script
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { pool } = require('../config/database');

async function setupDatabase() {
  try {
    console.log('🔧 Setting up database...\n');

    // Read schema file
    const schemaPath = path.join(__dirname, '../models/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf8');

    // Execute schema
    console.log('📝 Executing schema...');
    await pool.query(schema);
    console.log('✅ Schema executed successfully\n');

    // Verify tables
    const tablesResult = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    console.log('📋 Tables created:');
    tablesResult.rows.forEach(row => {
      console.log(`  ✓ ${row.table_name}`);
    });

    console.log('\n✅ Database setup complete!');
    console.log('\n📊 Default model configurations:');

    const modelsResult = await pool.query('SELECT tier, model_name FROM model_configs ORDER BY tier');
    modelsResult.rows.forEach(row => {
      console.log(`  ${row.tier}: ${row.model_name}`);
    });

    console.log('\n📝 Next steps:');
    console.log('  1. Create first admin user: POST /api/admin/setup');
    console.log('  2. Start the server: npm start');
    console.log('  3. Access admin dashboard: http://localhost:3000/admin');

    process.exit(0);
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

setupDatabase();
