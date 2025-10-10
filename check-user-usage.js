// Check user usage
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

async function checkUsage() {
  try {
    const email = process.argv[2] || 'souravsen8282@gmail.com';

    console.log(`\n📊 Checking usage for: ${email}\n`);

    // Get user info
    const userQuery = await pool.query(
      `SELECT id, email, tier, plan_name, extension_user_id, created_at
       FROM users WHERE email = $1`,
      [email]
    );

    if (userQuery.rows.length === 0) {
      console.log('❌ User not found!');
      process.exit(1);
    }

    const user = userQuery.rows[0];
    console.log('👤 User Info:');
    console.log(`   Email: ${user.email}`);
    console.log(`   Tier: ${user.tier}`);
    console.log(`   Plan: ${user.plan_name}`);
    console.log(`   Extension User ID: ${user.extension_user_id}`);
    console.log(`   Created: ${user.created_at}`);

    // Get usage data
    const usageQuery = await pool.query(
      `SELECT date, videos_processed, tokens_used, api_calls, cost_incurred, created_at
       FROM user_usage
       WHERE user_id = $1
       ORDER BY date DESC`,
      [user.id]
    );

    console.log(`\n📈 Usage Records (${usageQuery.rows.length} total):\n`);

    if (usageQuery.rows.length === 0) {
      console.log('   ⚠️  No usage records found!');
      console.log('   This means the user has NOT processed any videos yet.');
    } else {
      console.log('   Date       | Videos | Tokens  | API Calls | Cost      ');
      console.log('   -----------|--------|---------|-----------|----------');

      usageQuery.rows.forEach(row => {
        const date = row.date.toISOString().split('T')[0];
        const videos = String(row.videos_processed).padEnd(6);
        const tokens = String(row.tokens_used).padEnd(7);
        const calls = String(row.api_calls).padEnd(9);
        const cost = `$${parseFloat(row.cost_incurred).toFixed(4)}`.padEnd(10);
        console.log(`   ${date} | ${videos} | ${tokens} | ${calls} | ${cost}`);
      });

      // Total
      const totalVideos = usageQuery.rows.reduce((sum, row) => sum + row.videos_processed, 0);
      const totalTokens = usageQuery.rows.reduce((sum, row) => sum + row.tokens_used, 0);
      const totalCost = usageQuery.rows.reduce((sum, row) => sum + parseFloat(row.cost_incurred), 0);

      console.log('   -----------|--------|---------|-----------|----------');
      console.log(`   TOTAL      | ${String(totalVideos).padEnd(6)} | ${String(totalTokens).padEnd(7)} | -         | $${totalCost.toFixed(4)}`);
    }

    console.log('\n✅ Query complete!\n');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUsage();
