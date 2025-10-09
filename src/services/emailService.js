// Email Service
const transporter = require('../config/email');
const { Resend } = require('resend');

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

const sendEmail = async ({ to, subject, html, text }) => {
  try {
    // Use Resend if API key is configured
    console.log('📧 Attempting to send email to:', to);
    console.log('   RESEND_API_KEY configured:', !!process.env.RESEND_API_KEY);

    if (process.env.RESEND_API_KEY) {
      const fromEmail = process.env.FROM_EMAIL || 'noreply@aifreedomclub.com';
      console.log('   Using Resend with FROM_EMAIL:', fromEmail);

      const result = await resend.emails.send({
        from: fromEmail,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, '')
      });

      console.log('✅ Email sent via Resend successfully! Message ID:', result.id);
      return { success: true, messageId: result.id };
    }

    console.warn('⚠️  RESEND_API_KEY not configured, attempting SMTP fallback');

    // Fallback to SMTP if Resend not configured
    if (!transporter || !transporter.sendMail || typeof transporter.sendMail !== 'function') {
      console.error('❌ Email service not available - nodemailer not loaded');
      return {
        success: false,
        error: 'Email service not configured. Please check Railway logs for nodemailer errors.'
      };
    }

    const mailOptions = {
      from: `"${process.env.FROM_EMAIL_NAME || 'YouTube Summarizer Pro'}" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html,
      text: text || html.replace(/<[^>]*>/g, '') // Strip HTML if no text version
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Email sent:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Email send error:', error);
    return { success: false, error: error.message };
  }
};

// Welcome email for new users
const sendWelcomeEmail = async (email, userName) => {
  const subject = 'Welcome to YouTube Summarizer Pro!';
  const html = `
    <h1>Welcome to YouTube Summarizer Pro! 🎉</h1>
    <p>Hi ${userName || 'there'},</p>
    <p>Thank you for installing YouTube Summarizer Pro. You're now ready to transform long YouTube videos into concise, actionable summaries!</p>

    <h3>What's included in your Free plan:</h3>
    <ul>
      <li>✅ All 12 processing modes</li>
      <li>✅ Videos up to 30 minutes</li>
      <li>✅ All 5 AI models (with your OpenRouter API key)</li>
      <li>✅ Basic Notion integration</li>
    </ul>

    <h3>Getting Started:</h3>
    <ol>
      <li>Get your OpenRouter API key from <a href="https://openrouter.ai/keys">openrouter.ai/keys</a></li>
      <li>Open the extension and go to Settings</li>
      <li>Paste your API key and save</li>
      <li>Start summarizing videos!</li>
    </ol>

    <p><strong>Want longer videos and premium features?</strong><br>
    Upgrade to Premium for videos up to 2 hours, or Unlimited for any length!</p>

    <p>Need help? Reply to this email or visit our support center.</p>

    <p>Happy summarizing!<br>
    The YouTube Summarizer Pro Team</p>
  `;

  return sendEmail({ to: email, subject, html });
};

// Upgrade notification email
const sendUpgradeEmail = async (email, userName, planName) => {
  const subject = `🎉 Welcome to ${planName}!`;
  const html = `
    <h1>Congratulations on upgrading! 🚀</h1>
    <p>Hi ${userName || 'there'},</p>
    <p>Your ${planName} subscription is now active!</p>

    <h3>What's new in ${planName}:</h3>
    ${planName.includes('Premium') ? `
    <ul>
      <li>✅ Videos up to 2 hours</li>
      <li>✅ Full Notion integration with smart tags</li>
      <li>✅ Unlimited history</li>
      <li>✅ Claude 3.5 Sonnet AI model</li>
    </ul>
    ` : planName.includes('Unlimited') ? `
    <ul>
      <li>✅ UNLIMITED video length</li>
      <li>✅ Batch processing</li>
      <li>✅ Priority processing</li>
      <li>✅ Claude 3 Opus AI model</li>
    </ul>
    ` : planName.includes('Managed') ? `
    <ul>
      <li>✅ No API key needed - we provide it!</li>
      <li>✅ Unlimited summaries</li>
      <li>✅ Unlimited video length</li>
      <li>✅ Priority support</li>
    </ul>
    ` : ''}

    <p>Start using your new features right away - just open the extension!</p>

    <p>Thank you for supporting YouTube Summarizer Pro!</p>

    <p>Best regards,<br>
    The YouTube Summarizer Pro Team</p>
  `;

  return sendEmail({ to: email, subject, html });
};

// Usage limit warning email
const sendUsageLimitEmail = async (email, userName, tier, limit) => {
  const subject = '⚠️ Usage Limit Warning';
  const html = `
    <h1>Usage Limit Warning</h1>
    <p>Hi ${userName || 'there'},</p>
    <p>You're approaching your daily usage limit for ${tier} tier.</p>

    <p><strong>Current usage:</strong> ${limit}% of daily limit</p>

    <p>Consider upgrading to a higher tier for unlimited usage:</p>
    <ul>
      <li>Premium - Videos up to 2 hours</li>
      <li>Unlimited - No limits at all!</li>
      <li>Managed - We provide the API, no limits</li>
    </ul>

    <p><a href="${process.env.BACKEND_URL || ''}/pricing">View Plans</a></p>

    <p>Best regards,<br>
    The YouTube Summarizer Pro Team</p>
  `;

  return sendEmail({ to: email, subject, html });
};

// Old link-based verification email removed - now using OTP verification in /send-otp endpoint

// Student approval notification
const sendStudentApprovalEmail = async (email, expiresAt) => {
  const subject = '🎉 Student Verification Approved!';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">🎉 Congratulations!</h1>
        <p style="margin: 10px 0 0 0;">Your Student Status is Approved</p>
      </div>

      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2>Welcome to Student Pricing!</h2>

        <p>Great news! Your student verification has been approved.</p>

        <div style="background: #e8f5e9; padding: 15px; border-left: 4px solid #4CAF50; margin: 20px 0;">
          <strong>🎓 You now have access to:</strong>
          <ul>
            <li>50% OFF on all plans</li>
            <li>Student Premium: $37/year (was $67)</li>
            <li>Student Unlimited: $57/year (was $97)</li>
            <li>Student Monthly: $9/month (was $17)</li>
            <li>Student Annual: $47/year (was $97)</li>
          </ul>
        </div>

        <p><strong>Your student status is valid until:</strong> ${new Date(expiresAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>

        <p><strong>How to purchase a student plan:</strong></p>
        <ol>
          <li>Open the YouTube Summarizer Pro extension</li>
          <li>Go to Settings tab</li>
          <li>Click "View Student Plans (50% OFF)"</li>
          <li>Choose your plan and complete purchase</li>
        </ol>

        <p>Start summarizing videos with AI today! 🚀</p>
      </div>
    </div>
  `;

  return sendEmail({ to: email, subject, html });
};

// Generate 6-digit verification code
const generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

// Send email verification code
const sendEmailVerificationCode = async (email, verificationCode) => {
  const subject = `Your Verification Code: ${verificationCode}`;
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">🎬 YouTube Summarizer Pro</h1>
        <p style="margin: 10px 0 0 0;">Verify Your Email</p>
      </div>

      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2>Welcome!</h2>
        <p>Thanks for signing up for YouTube Summarizer Pro. To activate your Free Plan, please verify your email address.</p>

        <div style="background: white; border: 3px solid #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #666;">Your verification code is:</p>
          <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; margin-top: 10px;">${verificationCode}</div>
        </div>

        <p><strong>This code will expire in 10 minutes.</strong></p>

        <p>If you didn't request this code, you can safely ignore this email.</p>

        <div style="text-align: center; margin-top: 30px; color: #666; font-size: 14px;">
          <p>YouTube Summarizer Pro - AI-Powered Video Summaries</p>
          <p style="font-size: 12px;">This is an automated email, please do not reply.</p>
        </div>
      </div>
    </div>
  `;

  const text = `
YouTube Summarizer Pro - Email Verification

Your verification code is: ${verificationCode}

This code will expire in 10 minutes.

If you didn't request this code, you can safely ignore this email.

---
YouTube Summarizer Pro - AI-Powered Video Summaries
  `;

  return sendEmail({ to: email, subject, html, text });
};

// Send notification to admin when new student verification request is submitted
const sendAdminNewVerificationNotification = async (verificationData) => {
  const adminEmail = 'support@aifreedomclub.com';
  const subject = '🎓 New Student Verification Request';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">🎓 New Verification Request</h1>
        <p style="margin: 10px 0 0 0;">Student Discount Application</p>
      </div>

      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2>New Student Verification Submitted</h2>

        <div style="background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
          <p style="margin: 5px 0;"><strong>Student Name:</strong> ${verificationData.student_name}</p>
          <p style="margin: 5px 0;"><strong>Email:</strong> ${verificationData.email}</p>
          <p style="margin: 5px 0;"><strong>University:</strong> ${verificationData.university_name || 'Not provided'}</p>
          <p style="margin: 5px 0;"><strong>Graduation Year:</strong> ${verificationData.graduation_year || 'Not provided'}</p>
          <p style="margin: 5px 0;"><strong>Verification ID:</strong> #${verificationData.id}</p>
          <p style="margin: 5px 0;"><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
        </div>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://yt-summarizer-and-note-taker-v2-production.up.railway.app/admin"
             style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
            Review in Admin Panel
          </a>
        </div>

        <p style="color: #666; font-size: 14px;">
          Please review the student ID image and approve or reject the verification request.
        </p>
      </div>
    </div>
  `;

  return sendEmail({ to: adminEmail, subject, html });
};

module.exports = {
  sendEmail,
  sendWelcomeEmail,
  sendUpgradeEmail,
  sendUsageLimitEmail,
  sendStudentApprovalEmail,
  generateVerificationCode,
  sendEmailVerificationCode,
  sendAdminNewVerificationNotification
};
