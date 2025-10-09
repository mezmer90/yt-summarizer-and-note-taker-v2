const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const { sendStudentApprovalEmail } = require('../services/emailService');

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map(); // { email: { otp: '123456', expiresAt: timestamp, verified: false } }

// Import email service functions
const { generateVerificationCode, sendEmail } = require('../services/emailService');

// Send OTP to email (matching login/registration logic)
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    // Generate 6-digit OTP using shared function
    const otp = generateVerificationCode();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP
    otpStore.set(email, { otp, expiresAt, verified: false });

    // Send OTP email using the same template as login/registration
    const subject = `Student Verification Code: ${otp}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0;">🎓 YouTube Summarizer Pro</h1>
          <p style="margin: 10px 0 0 0;">Student Verification</p>
        </div>

        <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
          <h2>Verify Your Student Email</h2>
          <p>Thanks for submitting your student verification request. Please verify your email address to continue.</p>

          <div style="background: white; border: 3px solid #667eea; border-radius: 10px; padding: 20px; text-align: center; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #666;">Your verification code is:</p>
            <div style="font-size: 32px; font-weight: bold; color: #667eea; letter-spacing: 5px; margin-top: 10px;">${otp}</div>
          </div>

          <p><strong>This code will expire in 10 minutes.</strong></p>

          <p>If you didn't request this code, you can safely ignore this email.</p>

          <p>Best regards,<br>
          The YouTube Summarizer Pro Team</p>
        </div>
      </div>
    `;

    await sendEmail({ to: email, subject, html });

    console.log(`✅ OTP sent to ${email}: ${otp}`);

    res.json({
      success: true,
      message: 'OTP sent to your email. Please check your inbox.',
      expiresIn: 600 // 10 minutes in seconds
    });

  } catch (error) {
    console.error('Error sending OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send OTP. Please try again.'
    });
  }
});

// Verify OTP
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    if (!email || !otp) {
      return res.status(400).json({
        success: false,
        message: 'Email and OTP are required'
      });
    }

    const stored = otpStore.get(email);

    if (!stored) {
      return res.status(400).json({
        success: false,
        message: 'No OTP found for this email. Please request a new one.'
      });
    }

    if (Date.now() > stored.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({
        success: false,
        message: 'OTP has expired. Please request a new one.'
      });
    }

    if (stored.otp !== otp) {
      return res.status(400).json({
        success: false,
        message: 'Invalid OTP. Please try again.'
      });
    }

    // Mark as verified
    stored.verified = true;
    otpStore.set(email, stored);

    console.log(`✅ Email verified for ${email}`);

    res.json({
      success: true,
      message: 'Email verified successfully!'
    });

  } catch (error) {
    console.error('Error verifying OTP:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to verify OTP. Please try again.'
    });
  }
});

// Submit student verification request
router.post('/verify', async (req, res) => {
  try {
    const {
      extension_user_id,
      email,
      student_name,
      university_name,
      graduation_year,
      student_id_front_url,
      student_id_back_url
    } = req.body;

    // Get IP address (works with proxies/Railway)
    const ipAddress = req.headers['x-forwarded-for']?.split(',')[0].trim() ||
                      req.headers['x-real-ip'] ||
                      req.connection.remoteAddress ||
                      req.socket.remoteAddress;

    console.log(`📝 Student verification request from IP: ${ipAddress}`);

    // Rate limiting: Check if this IP submitted in the last 10 minutes
    const rateLimitCheck = await pool.query(
      `SELECT * FROM student_verification_rate_limit
       WHERE ip_address = $1
       AND last_submission_at > NOW() - INTERVAL '10 minutes'`,
      [ipAddress]
    );

    if (rateLimitCheck.rows.length > 0) {
      const lastSubmission = new Date(rateLimitCheck.rows[0].last_submission_at);
      const now = new Date();
      const minutesRemaining = Math.ceil(10 - (now - lastSubmission) / 60000);

      console.log(`⚠️  Rate limit exceeded for IP: ${ipAddress}`);
      return res.status(429).json({
        success: false,
        message: `Too many requests. Please wait ${minutesRemaining} minute(s) before submitting again.`,
        minutesRemaining
      });
    }

    if (!extension_user_id || !email) {
      return res.status(400).json({
        success: false,
        message: 'Extension user ID and email are required'
      });
    }

    if (!student_name) {
      return res.status(400).json({
        success: false,
        message: 'Student name is required'
      });
    }

    if (!student_id_front_url || !student_id_back_url) {
      return res.status(400).json({
        success: false,
        message: 'Both front and back images of student ID are required'
      });
    }

    // Check if email is verified via OTP
    const otpData = otpStore.get(email);
    if (!otpData || !otpData.verified) {
      return res.status(400).json({
        success: false,
        message: 'Please verify your email with OTP before submitting'
      });
    }

    // Check if user already has a pending or approved request
    const existingRequest = await pool.query(
      'SELECT * FROM student_verifications WHERE extension_user_id = $1 AND status IN ($2, $3)',
      [extension_user_id, 'pending', 'approved']
    );

    if (existingRequest.rows.length > 0) {
      const status = existingRequest.rows[0].status;
      console.log(`⚠️  User ${extension_user_id} already has ${status} verification`);
      return res.status(400).json({
        success: false,
        message: status === 'approved'
          ? 'You already have an approved student verification'
          : 'You already have a pending verification request',
        existingStatus: status
      });
    }

    // Insert new verification request with pending status (email already verified via OTP)
    const result = await pool.query(
      `INSERT INTO student_verifications
       (extension_user_id, email, student_name, university_name, graduation_year,
        student_id_front_url, student_id_back_url,
        status, email_verified)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [extension_user_id, email, student_name, university_name, graduation_year,
       student_id_front_url, student_id_back_url,
       'pending', true]
    );

    // Clear OTP after successful submission
    otpStore.delete(email);

    // Update rate limit tracking
    await pool.query(
      `INSERT INTO student_verification_rate_limit (ip_address, last_submission_at, submission_count)
       VALUES ($1, NOW(), 1)
       ON CONFLICT (ip_address) DO UPDATE
       SET last_submission_at = NOW(), submission_count = student_verification_rate_limit.submission_count + 1`,
      [ipAddress]
    );

    console.log(`✅ Student verification submitted by ${extension_user_id} (${email})`);

    res.json({
      success: true,
      message: 'Student verification submitted successfully! An admin will review your request within 24 hours.',
      verification: {
        id: result.rows[0].id,
        email: result.rows[0].email,
        status: result.rows[0].status
      }
    });

  } catch (error) {
    console.error('Error submitting student verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to submit verification request'
    });
  }
});

// Old link-based verification endpoint removed - now using OTP verification

// Check verification status (by extension_user_id or email)
router.get('/status/:extension_user_id', async (req, res) => {
  try {
    const { extension_user_id } = req.params;

    // First check user's verification status in users table (tied to email)
    const userResult = await pool.query(
      `SELECT email, student_verified, student_verified_at, student_verification_expires_at
       FROM users
       WHERE extension_user_id = $1`,
      [extension_user_id]
    );

    if (userResult.rows.length === 0) {
      return res.json({
        success: true,
        verified: false,
        message: 'User not found'
      });
    }

    const user = userResult.rows[0];
    const now = new Date();
    const expiresAt = user.student_verification_expires_at ? new Date(user.student_verification_expires_at) : null;
    const isExpired = expiresAt && expiresAt < now;
    const daysRemaining = expiresAt ? Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24)) : 0;

    // If verification expired, automatically set student_verified to false
    if (isExpired && user.student_verified) {
      await pool.query(
        `UPDATE users SET student_verified = false, updated_at = NOW() WHERE extension_user_id = $1`,
        [extension_user_id]
      );
      console.log(`⚠️  Student verification expired for ${user.email}`);
    }

    const verified = user.student_verified && !isExpired;

    // Also get latest verification request details
    const verificationResult = await pool.query(
      `SELECT id, status, requested_at, reviewed_at, rejection_reason, expires_at
       FROM student_verifications
       WHERE extension_user_id = $1 OR email = $2
       ORDER BY requested_at DESC
       LIMIT 1`,
      [extension_user_id, user.email]
    );

    const verificationRequest = verificationResult.rows[0] || null;

    res.json({
      success: true,
      verified,
      student_verified_at: user.student_verified_at,
      expires_at: user.student_verification_expires_at,
      days_remaining: daysRemaining,
      needs_reverification: isExpired,
      latest_request: verificationRequest ? {
        status: verificationRequest.status,
        requested_at: verificationRequest.requested_at,
        reviewed_at: verificationRequest.reviewed_at,
        rejection_reason: verificationRequest.rejection_reason
      } : null
    });

  } catch (error) {
    console.error('Error checking verification status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check verification status'
    });
  }
});

// Admin: Get all pending verifications
router.get('/admin/pending', requireAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT sv.*, u.email as user_email, u.tier, u.plan_name
       FROM student_verifications sv
       LEFT JOIN users u ON sv.extension_user_id = u.extension_user_id
       WHERE sv.status = 'pending'
       ORDER BY sv.requested_at ASC`
    );

    res.json({
      success: true,
      verifications: result.rows
    });

  } catch (error) {
    console.error('Error fetching pending verifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch pending verifications'
    });
  }
});

// Admin: Get all verifications (with filters)
router.get('/admin/all', requireAdmin, async (req, res) => {
  try {
    const { status, limit = 50 } = req.query;

    let query = `
      SELECT sv.*, u.email as user_email, u.tier, u.plan_name
      FROM student_verifications sv
      LEFT JOIN users u ON sv.extension_user_id = u.extension_user_id
    `;

    const params = [];
    if (status) {
      query += ` WHERE sv.status = $1`;
      params.push(status);
    }

    query += ` ORDER BY sv.requested_at DESC LIMIT $${params.length + 1}`;
    params.push(limit);

    const result = await pool.query(query, params);

    res.json({
      success: true,
      verifications: result.rows
    });

  } catch (error) {
    console.error('Error fetching verifications:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch verifications'
    });
  }
});

// Admin: Approve verification
router.post('/admin/approve/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminEmail = req.admin.email;

    // Set expiration to 1 year from now (365 days)
    const now = new Date();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 365);

    // Get verification details first
    const verificationData = await pool.query(
      'SELECT * FROM student_verifications WHERE id = $1',
      [id]
    );

    if (verificationData.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

    const verification = verificationData.rows[0];

    // Update student verification status
    const result = await pool.query(
      `UPDATE student_verifications
       SET status = 'approved',
           reviewed_by = $1,
           reviewed_at = NOW(),
           expires_at = $2
       WHERE id = $3
       RETURNING *`,
      [adminEmail, expiresAt, id]
    );

    // Update user's student verification status
    // Find user by email (email is tied to student verification)
    await pool.query(
      `UPDATE users
       SET student_verified = true,
           student_verified_at = NOW(),
           student_verification_expires_at = $1,
           updated_at = NOW()
       WHERE email = $2`,
      [expiresAt, verification.email]
    );

    console.log(`✅ Student verification approved for ${verification.email}, expires: ${expiresAt.toISOString()}`);

    // Send approval email
    try {
      await sendStudentApprovalEmail(result.rows[0].email, expiresAt);
      console.log(`✅ Approval email sent to ${result.rows[0].email}`);
    } catch (emailError) {
      console.error('❌ Error sending approval email:', emailError);
      // Continue even if email fails
    }

    // Log admin action
    await pool.query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminEmail, 'approve_student_verification', 'student_verifications', id, JSON.stringify(result.rows[0])]
    );

    res.json({
      success: true,
      message: 'Student verification approved and notification email sent. User status updated.',
      verification: result.rows[0]
    });

  } catch (error) {
    console.error('Error approving verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to approve verification'
    });
  }
});

// Admin: Reject verification
router.post('/admin/reject/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { reason } = req.body;
    const adminEmail = req.admin.email;

    if (!reason) {
      return res.status(400).json({
        success: false,
        message: 'Rejection reason is required'
      });
    }

    const result = await pool.query(
      `UPDATE student_verifications
       SET status = 'rejected',
           reviewed_by = $1,
           reviewed_at = NOW(),
           rejection_reason = $2
       WHERE id = $3
       RETURNING *`,
      [adminEmail, reason, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

    // Log admin action
    await pool.query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminEmail, 'reject_student_verification', 'student_verifications', id, JSON.stringify({ reason, ...result.rows[0] })]
    );

    res.json({
      success: true,
      message: 'Student verification rejected',
      verification: result.rows[0]
    });

  } catch (error) {
    console.error('Error rejecting verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reject verification'
    });
  }
});

// Admin: Delete verification
router.delete('/admin/delete/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminEmail = req.admin.email;

    // Get verification details before deleting
    const verification = await pool.query(
      'SELECT * FROM student_verifications WHERE id = $1',
      [id]
    );

    if (verification.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

    // Delete the verification
    await pool.query(
      'DELETE FROM student_verifications WHERE id = $1',
      [id]
    );

    // Log admin action
    await pool.query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminEmail, 'delete_student_verification', 'student_verifications', id, JSON.stringify(verification.rows[0])]
    );

    res.json({
      success: true,
      message: 'Student verification deleted'
    });

  } catch (error) {
    console.error('Error deleting verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete verification'
    });
  }
});

module.exports = router;
