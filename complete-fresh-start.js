// COMPLETE FRESH START - Delete EVERYTHING
// WARNING: This will delete ALL users and data!
require('dotenv').config();
const pool = require('./src/config/database');

async function completeFreshStart() {
  console.log('⚠️  WARNING: COMPLETE FRESH START');
  console.log('   This will DELETE:');
  console.log('   - ALL users');
  console.log('   - ALL usage history');
  console.log('   - ALL payment events');
  console.log('   - ALL email verifications');
  console.log('   - ALL student verifications');
  console.log('');
  console.log('   This KEEPS:');
  console.log('   - Admin users');
  console.log('   - System settings');
  console.log('   - Model configs');
  console.log('');

  try {
    // Show current state
    const beforeUsers = await pool.query('SELECT COUNT(*) as count FROM users');
    console.log(`📊 Current state: ${beforeUsers.rows[0].count} users\n`);

    // Delete all related data first (foreign key constraints)
    console.log('🗑️  Step 1: Deleting email verifications...');
    const emailResult = await pool.query('DELETE FROM email_verifications RETURNING *');
    console.log(`   ✅ Deleted ${emailResult.rowCount} email verification records\n`);

    console.log('🗑️  Step 2: Deleting student verifications...');
    const studentResult = await pool.query('DELETE FROM student_verifications RETURNING *');
    console.log(`   ✅ Deleted ${studentResult.rowCount} student verification records\n`);

    console.log('🗑️  Step 3: Deleting user usage history...');
    const usageResult = await pool.query('DELETE FROM user_usage RETURNING *');
    console.log(`   ✅ Deleted ${usageResult.rowCount} usage records\n`);

    console.log('🗑️  Step 4: Deleting payment events...');
    const paymentResult = await pool.query('DELETE FROM payment_events RETURNING *');
    console.log(`   ✅ Deleted ${paymentResult.rowCount} payment events\n`);

    console.log('🗑️  Step 5: Deleting ALL users...');
    const userResult = await pool.query('DELETE FROM users RETURNING extension_user_id, email');
    console.log(`   ✅ Deleted ${userResult.rowCount} users:\n`);

    userResult.rows.forEach(user => {
      console.log(`      - ${user.email} (${user.extension_user_id})`);
    });
    console.log('');

    // Verify everything is clean
    const afterUsers = await pool.query('SELECT COUNT(*) as count FROM users');
    const afterUsage = await pool.query('SELECT COUNT(*) as count FROM user_usage');
    const afterPayments = await pool.query('SELECT COUNT(*) as count FROM payment_events');
    const afterEmails = await pool.query('SELECT COUNT(*) as count FROM email_verifications');

    console.log('✅ COMPLETE FRESH START DONE!\n');
    console.log('📊 Final state:');
    console.log(`   - Users: ${afterUsers.rows[0].count}`);
    console.log(`   - Usage records: ${afterUsage.rows[0].count}`);
    console.log(`   - Payment events: ${afterPayments.rows[0].count}`);
    console.log(`   - Email verifications: ${afterEmails.rows[0].count}`);
    console.log('');
    console.log('🎉 Database is completely empty and ready for fresh testing!');
    console.log('');

  } catch (error) {
    console.error('❌ Error during fresh start:', error.message);
    console.error(error);
    process.exit(1);
  }
}

completeFreshStart();
