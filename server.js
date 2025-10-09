// Server Entry Point
// Load .env only in development (Railway uses environment variables directly)
if (process.env.NODE_ENV !== 'production') {
  require('dotenv').config();
}

console.log('=================================');
console.log('🔍 Environment Check:');
console.log('- PORT:', process.env.PORT || '(not set, will use 3000)');
console.log('- HOST:', process.env.HOST || '(not set, will use 0.0.0.0)');
console.log('- NODE_ENV:', process.env.NODE_ENV || '(not set)');
console.log('- DATABASE_URL:', process.env.DATABASE_URL ? '✅ SET' : '❌ NOT SET');
console.log('=================================');

const app = require('./src/app');
const { pool } = require('./src/config/database');
const fs = require('fs');
const path = require('path');

// Update database views on startup
async function updateDatabaseViews() {
  try {
    const viewSQL = fs.readFileSync(
      path.join(__dirname, 'src/models/update_user_details_view.sql'),
      'utf8'
    );
    await pool.query(viewSQL);
    console.log('✅ Database views updated successfully');
  } catch (error) {
    console.error('⚠️  Error updating database views:', error.message);
    // Don't crash the server if view update fails
  }
}

// Use Railway's assigned PORT or fallback to 3000
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Update views on startup
updateDatabaseViews();

let isShuttingDown = false;

// Graceful shutdown handler
const shutdown = async (signal) => {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`${signal} signal received: closing HTTP server`);

  server.close(async () => {
    console.log('HTTP server closed');
    try {
      await pool.end();
      console.log('Database pool closed');
      process.exit(0);
    } catch (error) {
      console.error('Error during shutdown:', error);
      process.exit(1);
    }
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    console.error('Could not close connections in time, forcefully shutting down');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Start server - bind to 0.0.0.0 for Railway
const server = app.listen(PORT, HOST, () => {
  console.log('=================================');
  console.log('🚀 Server is running!');
  console.log(`📡 Host: ${HOST}`);
  console.log(`📡 Port: ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🔗 Health check: http://${HOST}:${PORT}/health`);
  console.log(`👨‍💼 Admin dashboard: http://${HOST}:${PORT}/admin`);
  console.log('=================================');
});

// Handle server errors
server.on('error', (error) => {
  console.error('❌ Server error:', error);
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use`);
  }
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
