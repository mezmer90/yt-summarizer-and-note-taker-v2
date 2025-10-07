// Email Configuration - Nodemailer
console.log('🔄 Loading email configuration...');
console.log('   EMAIL_SERVICE:', process.env.EMAIL_SERVICE);
console.log('   EMAIL_USER:', process.env.EMAIL_USER ? '✓ Set' : '✗ Not set');
console.log('   EMAIL_PASSWORD:', process.env.EMAIL_PASSWORD ? '✓ Set (length: ' + process.env.EMAIL_PASSWORD.length + ')' : '✗ Not set');

let nodemailer;
try {
  nodemailer = require('nodemailer');
  console.log('   Nodemailer type:', typeof nodemailer);
  console.log('   Has createTransporter?', typeof nodemailer.createTransporter);

  // Handle different module formats
  if (nodemailer.default && typeof nodemailer.default.createTransporter === 'function') {
    console.log('   Using nodemailer.default');
    nodemailer = nodemailer.default;
  }
} catch (requireError) {
  console.error('❌ Failed to require nodemailer:', requireError.message);
  throw requireError;
}

let transporter;

try {
  // Initialize email transporter based on service
  if (process.env.EMAIL_SERVICE === 'gmail') {
    // Gmail configuration
    console.log('📧 Configuring Gmail transporter...');

    if (typeof nodemailer.createTransporter !== 'function') {
      throw new Error('nodemailer.createTransporter is not a function. Type: ' + typeof nodemailer.createTransporter);
    }

    transporter = nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    console.log('✅ Gmail transporter created successfully');
  } else if (process.env.EMAIL_SERVICE === 'sendgrid') {
    // SendGrid configuration
    transporter = nodemailer.createTransporter({
      host: 'smtp.sendgrid.net',
      port: 587,
      auth: {
        user: 'apikey',
        pass: process.env.SENDGRID_API_KEY
      }
    });
    console.log('📧 Email service configured: SendGrid');
  } else {
    // Default SMTP configuration
    transporter = nodemailer.createTransporter({
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: process.env.SMTP_PORT || 587,
      secure: false,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD
      }
    });
    console.log('📧 Email service configured: Default SMTP');
  }

  // Verify email configuration on startup
  transporter.verify((error, success) => {
    if (error) {
      console.error('❌ Email service configuration error:', error.message);
      console.error('   Check your EMAIL_USER and EMAIL_PASSWORD in Railway variables');
    } else {
      console.log('✅ Email service ready to send messages');
    }
  });

} catch (error) {
  console.error('❌ Failed to initialize email service:', error.message);
  console.error('⚠️  Emails will not be sent. Please check:');
  console.error('   1. nodemailer is installed: npm install nodemailer');
  console.error('   2. EMAIL_SERVICE, EMAIL_USER, EMAIL_PASSWORD are set in Railway');

  // Create a stub transporter that logs errors
  transporter = {
    sendMail: async () => {
      throw new Error('Email service not configured properly. Check server logs.');
    },
    verify: (callback) => {
      callback(new Error('Email service not configured'), false);
    }
  };
}

module.exports = transporter;
