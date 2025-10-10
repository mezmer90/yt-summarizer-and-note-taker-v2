#!/bin/bash

# ============================================
# CLEANUP DATABASE - Remove all customer data
# ============================================

echo "⚠️  WARNING: This will clear all Stripe customer data from the database!"
echo "   - All users will be downgraded to FREE tier"
echo "   - All Stripe customer IDs will be cleared"
echo "   - All subscription data will be removed"
echo ""
echo "Make sure you have already deleted all customers in Stripe dashboard first!"
echo ""
read -p "Are you sure you want to continue? (yes/no): " confirm

if [ "$confirm" != "yes" ]; then
    echo "❌ Cleanup cancelled"
    exit 1
fi

echo ""
echo "🔄 Starting database cleanup..."
echo ""

# Run the SQL cleanup script via Railway
railway run bash -c 'psql $DATABASE_URL -f cleanup-all-customers.sql'

echo ""
echo "✅ Database cleanup complete!"
echo ""
echo "📊 Next steps:"
echo "   1. Verify all customers are deleted in Stripe dashboard"
echo "   2. Test fresh user registration"
echo "   3. Test subscription flow"
echo ""
