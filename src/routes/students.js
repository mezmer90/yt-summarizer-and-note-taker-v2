const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');
const crypto = require('crypto');
const { sendStudentVerificationEmail, sendStudentApprovalEmail } = require('../services/emailService');

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

    // Check if user already has a pending or approved request
    const existingRequest = await pool.query(
      'SELECT * FROM student_verifications WHERE extension_user_id = $1 AND status IN ($2, $3, $4)',
      [extension_user_id, 'email_pending', 'pending', 'approved']
    );

    if (existingRequest.rows.length > 0) {
      const status = existingRequest.rows[0].status;
      return res.status(400).json({
        success: false,
        message: status === 'approved'
          ? 'You already have an approved student verification'
          : status === 'email_pending'
          ? 'Please check your email and click the verification link'
          : 'You already have a pending verification request'
      });
    }

    // Generate verification token
    const verificationToken = crypto.randomBytes(32).toString('hex');
    const tokenExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Insert new verification request with email_pending status
    const result = await pool.query(
      `INSERT INTO student_verifications
       (extension_user_id, email, student_name, university_name, graduation_year,
        student_id_front_url, student_id_back_url,
        status, email_verified, verification_token, token_expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [extension_user_id, email, student_name, university_name, graduation_year,
       student_id_front_url, student_id_back_url,
       'email_pending', false, verificationToken, tokenExpiresAt]
    );

    // Send verification email
    try {
      await sendStudentVerificationEmail(email, verificationToken);
      console.log(`✅ Verification email sent to ${email}`);
    } catch (emailError) {
      console.error('❌ Error sending verification email:', emailError);
      // Continue even if email fails - user can contact support
    }

    res.json({
      success: true,
      message: 'Verification email sent! Please check your inbox and click the link to verify your email.',
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

// Verify email via token (user clicks link in email)
router.get('/verify-email/:token', async (req, res) => {
  try {
    const { token } = req.params;

    // Find verification by token
    const result = await pool.query(
      `SELECT * FROM student_verifications
       WHERE verification_token = $1`,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(404).send(`
        <html>
          <head><title>Invalid Link</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>❌ Invalid Verification Link</h1>
            <p>This verification link is invalid or has already been used.</p>
          </body>
        </html>
      `);
    }

    const verification = result.rows[0];

    // Check if token expired
    if (new Date() > new Date(verification.token_expires_at)) {
      return res.status(400).send(`
        <html>
          <head><title>Link Expired</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>⏰ Verification Link Expired</h1>
            <p>This verification link has expired. Please submit a new verification request.</p>
          </body>
        </html>
      `);
    }

    // Check if already verified
    if (verification.email_verified) {
      return res.send(`
        <html>
          <head><title>Already Verified</title></head>
          <body style="font-family: Arial; text-align: center; padding: 50px;">
            <h1>✓ Email Already Verified</h1>
            <p>Your email has already been verified. An admin will review your request soon.</p>
          </body>
        </html>
      `);
    }

    // Mark as verified and change status to pending (ready for admin review)
    await pool.query(
      `UPDATE student_verifications
       SET email_verified = true,
           status = 'pending',
           verification_token = NULL
       WHERE id = $1`,
      [verification.id]
    );

    res.send(`
      <html>
        <head>
          <title>Email Verified!</title>
          <style>
            body {
              font-family: Arial, sans-serif;
              text-align: center;
              padding: 50px;
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
            }
            .container {
              background: white;
              color: #333;
              padding: 40px;
              border-radius: 10px;
              max-width: 500px;
              margin: 0 auto;
              box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            }
            h1 { color: #10b981; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>✓ Email Verified!</h1>
            <p><strong>Success!</strong> Your email has been verified.</p>
            <p>An admin will review your student verification request and approve it within 24 hours.</p>
            <p>You'll receive an email once approved.</p>
            <p style="margin-top: 30px; color: #666; font-size: 14px;">You can close this window now.</p>
          </div>
        </body>
      </html>
    `);

    console.log(`✅ Email verified for: ${verification.email}`);

  } catch (error) {
    console.error('Error verifying email:', error);
    res.status(500).send('Error verifying email');
  }
});

// Check verification status
router.get('/status/:extension_user_id', async (req, res) => {
  try {
    const { extension_user_id } = req.params;

    const result = await pool.query(
      `SELECT id, status, requested_at, reviewed_at, rejection_reason, expires_at
       FROM student_verifications
       WHERE extension_user_id = $1
       ORDER BY requested_at DESC
       LIMIT 1`,
      [extension_user_id]
    );

    if (result.rows.length === 0) {
      return res.json({
        success: true,
        verified: false,
        message: 'No verification request found'
      });
    }

    const verification = result.rows[0];
    const verified = verification.status === 'approved' &&
                    (!verification.expires_at || new Date(verification.expires_at) > new Date());

    res.json({
      success: true,
      verified,
      status: verification.status,
      requested_at: verification.requested_at,
      reviewed_at: verification.reviewed_at,
      rejection_reason: verification.rejection_reason,
      expires_at: verification.expires_at
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

    // Set expiration to 1 year from now
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

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

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Verification request not found'
      });
    }

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
      message: 'Student verification approved and notification email sent',
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
