// Run database cleanup to remove all Stripe customer data
require('dotenv').config();
const pool = require('./src/config/database');

async function cleanupAllCustomers() {
  console.log('🧹 Starting database cleanup...\n');

  try {
    // Count users with Stripe data before cleanup
    const beforeResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE stripe_customer_id IS NOT NULL'
    );
    const beforeCount = parseInt(beforeResult.rows[0].count);

    console.log(`📊 Found ${beforeCount} users with Stripe data\n`);

    if (beforeCount === 0) {
      console.log('✅ Database is already clean - no Stripe data found!');
      process.exit(0);
    }

    // Clear all Stripe-related data
    console.log('🔄 Clearing all Stripe customer data...');

    const updateResult = await pool.query(`
      UPDATE users
      SET stripe_customer_id = NULL,
          stripe_subscription_id = NULL,
          stripe_price_id = NULL,
          tier = 'free',
          plan_name = NULL,
          subscription_status = NULL,
          subscription_start_date = NULL,
          subscription_end_date = NULL,
          subscription_cancel_at = NULL,
          trial_end_date = NULL,
          updated_at = NOW()
      WHERE stripe_customer_id IS NOT NULL
      RETURNING extension_user_id, email, tier
    `);

    console.log(`✅ Updated ${updateResult.rowCount} users\n`);

    // Show updated users
    if (updateResult.rows.length > 0) {
      console.log('📋 Users downgraded to free tier:');
      updateResult.rows.forEach(user => {
        console.log(`   - ${user.email} (${user.extension_user_id})`);
      });
      console.log('');
    }

    // Verify cleanup
    const afterResult = await pool.query(
      'SELECT COUNT(*) as count FROM users WHERE stripe_customer_id IS NOT NULL'
    );
    const afterCount = parseInt(afterResult.rows[0].count);

    console.log('✅ Cleanup complete!\n');
    console.log('📊 Final verification:');
    console.log(`   - Users with Stripe data: ${afterCount}`);

    // Show tier distribution
    const tierResult = await pool.query(`
      SELECT tier, COUNT(*) as count
      FROM users
      GROUP BY tier
      ORDER BY tier
    `);

    console.log('\n📊 User tier distribution:');
    tierResult.rows.forEach(row => {
      console.log(`   - ${row.tier}: ${row.count} users`);
    });

    console.log('\n✅ All done! Database is clean and ready for fresh testing.\n');

  } catch (error) {
    console.error('❌ Error during cleanup:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run cleanup
cleanupAllCustomers();
