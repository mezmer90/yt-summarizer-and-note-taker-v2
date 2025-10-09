const express = require('express');
const router = express.Router();
const pool = require('../config/database');
const { requireAdmin } = require('../middleware/auth');

// Store OTPs temporarily (in production, use Redis or database)
const otpStore = new Map(); // { email: { otp: '123456', expiresAt: timestamp, verified: false } }

// Import email service functions
const { generateVerificationCode, sendEmail, sendStudentApprovalEmail } = require('../services/emailService');

// Helper function: Send reupload request email
async function sendReuploadEmail(email, studentName, reuploadSide) {
  const sideText = reuploadSide === 'reupload_front' ? 'front side'
    : reuploadSide === 'reupload_back' ? 'back side'
    : 'both sides';

  const subject = 'Student ID Verification - Reupload Required';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">🎓 YouTube Summarizer Pro</h1>
        <p style="margin: 10px 0 0 0;">Student Verification Update</p>
      </div>

      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2>Hello ${studentName},</h2>
        <p>Thank you for submitting your student ID for verification. Our automated verification system has reviewed your submission.</p>

        <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #856404;"><strong>⚠️ Action Required</strong></p>
          <p style="margin: 10px 0 0 0; color: #856404;">We need you to reupload the <strong>${sideText}</strong> of your student ID.</p>
        </div>

        <p><strong>Common issues:</strong></p>
        <ul>
          <li>Image is blurry or out of focus</li>
          <li>Text is not clearly readable</li>
          <li>Photo is cropped or incomplete</li>
          <li>Lighting is too dark or overexposed</li>
        </ul>

        <p><strong>What to do:</strong></p>
        <ol>
          <li>Take a new, clear photo of your student ID (${sideText})</li>
          <li>Make sure all text and your photo are clearly visible</li>
          <li>Use good lighting and avoid glare</li>
          <li>Visit the verification page to reupload</li>
        </ol>

        <div style="text-align: center; margin: 30px 0;">
          <a href="https://aifreedomclub.com/pricing" style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block;">Reupload Student ID</a>
        </div>

        <p>If you have any questions, please contact our support team.</p>

        <p>Best regards,<br>
        The YouTube Summarizer Pro Team</p>
      </div>
    </div>
  `;

  await sendEmail({ to: email, subject, html });
}

// Helper function: Send rejection email
async function sendRejectionEmail(email, studentName, reason) {
  const subject = 'Student ID Verification - Unable to Verify';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
        <h1 style="margin: 0;">🎓 YouTube Summarizer Pro</h1>
        <p style="margin: 10px 0 0 0;">Student Verification Update</p>
      </div>

      <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
        <h2>Hello ${studentName},</h2>
        <p>Thank you for your interest in our student discount program.</p>

        <div style="background: #f8d7da; border-left: 4px solid #dc3545; padding: 15px; margin: 20px 0;">
          <p style="margin: 0; color: #721c24;"><strong>❌ Verification Unsuccessful</strong></p>
          <p style="margin: 10px 0 0 0; color: #721c24;">${reason}</p>
        </div>

        <p>Unfortunately, we were unable to verify your student status based on the submitted ID.</p>

        <p><strong>What you can do:</strong></p>
        <ul>
          <li>Ensure you are using a valid, current student ID</li>
          <li>Make sure your ID clearly shows your name and institution</li>
          <li>Contact support if you believe this is an error</li>
        </ul>

        <p>If you have questions or need assistance, please don't hesitate to reach out to our support team.</p>

        <p>Best regards,<br>
        The YouTube Summarizer Pro Team</p>
      </div>
    </div>
  `;

  await sendEmail({ to: email, subject, html });
}

// Helper function: Run automatic AI verification
async function runAutoAIVerification(verificationId) {
  try {
    console.log(`🤖 Starting auto AI verification for ID ${verificationId}`);

    // Get verification details
    const verificationData = await pool.query(
      'SELECT * FROM student_verifications WHERE id = $1',
      [verificationId]
    );

    if (verificationData.rows.length === 0) {
      throw new Error('Verification not found');
    }

    const verification = verificationData.rows[0];

    if (!verification.student_id_front_url) {
      throw new Error('Missing ID image');
    }

    // Update status to processing
    await pool.query(
      `UPDATE student_verifications SET ai_status = 'processing' WHERE id = $1`,
      [verificationId]
    );

    // Get AI prompt from system settings
    const promptResult = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'ai_verification_prompt'`
    );
    const aiPrompt = promptResult.rows.length > 0 && promptResult.rows[0].setting_value
      ? promptResult.rows[0].setting_value
      : null;

    if (!aiPrompt) {
      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'manual_review',
             ai_reason = 'AI verification prompt not configured'
         WHERE id = $1`,
        [verificationId]
      );
      return;
    }

    // Get OpenRouter API key
    const apiKeyResult = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'openrouter_api_key'`
    );
    const dbApiKey = (apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].setting_value)
      ? apiKeyResult.rows[0].setting_value
      : '';
    const apiKey = dbApiKey || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'manual_review',
             ai_reason = 'OpenRouter API key not configured'
         WHERE id = $1`,
        [verificationId]
      );
      return;
    }

    // Call OpenRouter API with GPT-4o vision
    const fetch = require('node-fetch');

    const requestBody = {
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: aiPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: verification.student_id_front_url
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      max_tokens: 500
    };

    console.log('🤖 Calling OpenRouter API for auto AI verification...');

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aifreedomclub.com',
        'X-Title': 'YouTube Summarizer Pro - Student Verification'
      },
      body: JSON.stringify(requestBody)
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('❌ OpenRouter API error:', errorText);

      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'failed',
             ai_reason = 'OpenRouter API request failed'
         WHERE id = $1`,
        [verificationId]
      );
      return;
    }

    const aiResponse = await openRouterResponse.json();
    let aiContent = aiResponse.choices[0].message.content;

    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    aiContent = aiContent.replace(/^```(?:json)?\s*\n?/,'').replace(/\n?```\s*$/,'').trim();

    let aiResult;

    try {
      aiResult = JSON.parse(aiContent);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', aiContent);

      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'failed',
             ai_reason = 'Failed to parse AI response'
         WHERE id = $1`,
        [verificationId]
      );
      return;
    }

    // Calculate cost
    const inputTokens = aiResponse.usage?.prompt_tokens || 1000;
    const outputTokens = aiResponse.usage?.completion_tokens || 100;
    const estimatedCost = (inputTokens / 1000000 * 2.5) + (outputTokens / 1000000 * 10);

    // Update verification with AI results
    await pool.query(
      `UPDATE student_verifications
       SET ai_status = $1,
           ai_result = $2,
           ai_confidence = $3,
           ai_reason = $4,
           ai_verified_at = NOW(),
           ai_cost = $5
       WHERE id = $6`,
      [
        aiResult.verification_result,
        JSON.stringify(aiResult),
        aiResult.confidence,
        aiResult.reason,
        estimatedCost,
        verificationId
      ]
    );

    console.log(`🤖 Auto AI Verification result for ID ${verificationId}: ${aiResult.verification_result} (${aiResult.confidence}% confidence)`);

    // Handle result based on AI decision
    const result = aiResult.verification_result;

    if (result === 'approved') {
      // Auto-approve
      console.log(`✅ Auto-approving verification ID ${verificationId}`);

      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 365); // 1 year

      await pool.query(
        `UPDATE student_verifications
         SET status = 'approved',
             reviewed_by = 'AI Auto-Approval',
             reviewed_at = NOW(),
             expires_at = $1
         WHERE id = $2`,
        [expiresAt, verificationId]
      );

      // Update user's student verification status (create if doesn't exist)
      await pool.query(
        `INSERT INTO users (extension_user_id, email, student_verified, student_verified_at, student_verification_expires_at, tier, created_at, updated_at)
         VALUES ($1, $2, true, NOW(), $3, 'free', NOW(), NOW())
         ON CONFLICT (extension_user_id) DO UPDATE
         SET student_verified = true,
             student_verified_at = NOW(),
             student_verification_expires_at = $3,
             updated_at = NOW()`,
        [verification.extension_user_id, verification.email, expiresAt]
      );

      // Send approval email
      try {
        await sendStudentApprovalEmail(verification.email, expiresAt);
        console.log(`✅ Auto-approval email sent to ${verification.email}`);
      } catch (emailError) {
        console.error('❌ Error sending auto-approval email:', emailError);
      }

    } else if (result === 'rejected') {
      // Auto-reject
      console.log(`❌ Auto-rejecting verification ID ${verificationId}`);

      await pool.query(
        `UPDATE student_verifications
         SET status = 'rejected',
             reviewed_by = 'AI Auto-Rejection',
             reviewed_at = NOW(),
             rejection_reason = $1
         WHERE id = $2`,
        [aiResult.reason, verificationId]
      );

      // Send rejection email
      try {
        await sendRejectionEmail(verification.email, verification.student_name, aiResult.reason);
        console.log(`📧 Rejection email sent to ${verification.email}`);
      } catch (emailError) {
        console.error('❌ Error sending rejection email:', emailError);
      }

    } else if (result.startsWith('reupload')) {
      // Send reupload request email
      console.log(`⚠️ Requesting reupload for verification ID ${verificationId}: ${result}`);

      try {
        await sendReuploadEmail(verification.email, verification.student_name, result);
        console.log(`📧 Reupload email sent to ${verification.email}`);
      } catch (emailError) {
        console.error('❌ Error sending reupload email:', emailError);
      }
    }

  } catch (error) {
    console.error(`❌ Error in auto AI verification for ID ${verificationId}:`, error);

    try {
      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'failed',
             ai_reason = $1
         WHERE id = $2`,
        [error.message, verificationId]
      );
    } catch (updateError) {
      console.error('Error updating failed status:', updateError);
    }
  }
}

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

    if (!student_id_front_url) {
      return res.status(400).json({
        success: false,
        message: 'Student ID image is required'
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

    const verificationId = result.rows[0].id;

    // Send response immediately
    res.json({
      success: true,
      message: 'Student verification submitted successfully! An admin will review your request within 24 hours. You will receive an email notification once approved.',
      verification: {
        id: verificationId,
        email: result.rows[0].email,
        status: result.rows[0].status
      }
    });

    // AI verification disabled for launch - will be enabled later
    // console.log(`🤖 Triggering automatic AI verification for ID ${verificationId}`);
    // runAutoAIVerification(verificationId).catch(err => {
    //   console.error(`❌ Auto AI verification failed for ID ${verificationId}:`, err);
    // });

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

    // Also get latest verification request details with AI info
    const verificationResult = await pool.query(
      `SELECT id, status, requested_at, reviewed_at, rejection_reason, expires_at,
              ai_status, ai_reason, ai_confidence
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
        id: verificationRequest.id,
        status: verificationRequest.status,
        requested_at: verificationRequest.requested_at,
        reviewed_at: verificationRequest.reviewed_at,
        rejection_reason: verificationRequest.rejection_reason,
        ai_status: verificationRequest.ai_status,
        ai_reason: verificationRequest.ai_reason,
        ai_confidence: verificationRequest.ai_confidence,
        can_reupload: verificationRequest.status === 'rejected' || (verificationRequest.ai_status && verificationRequest.ai_status.startsWith('reupload'))
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

// Delete rejected verification (allows student to reupload)
router.delete('/delete-rejected/:extension_user_id', async (req, res) => {
  try {
    const { extension_user_id } = req.params;

    // Only allow deletion of rejected verifications
    const result = await pool.query(
      `DELETE FROM student_verifications
       WHERE extension_user_id = $1
       AND status = 'rejected'
       RETURNING *`,
      [extension_user_id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'No rejected verification found to delete'
      });
    }

    console.log(`✅ Deleted rejected verification for ${extension_user_id}`);

    res.json({
      success: true,
      message: 'Rejected verification deleted. You can now submit a new verification.'
    });

  } catch (error) {
    console.error('Error deleting rejected verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete rejected verification'
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
    // Find user by email OR extension_user_id, create if doesn't exist
    const userUpdateResult = await pool.query(
      `INSERT INTO users (extension_user_id, email, student_verified, student_verified_at, student_verification_expires_at, tier, created_at, updated_at)
       VALUES ($1, $2, true, NOW(), $3, 'free', NOW(), NOW())
       ON CONFLICT (extension_user_id) DO UPDATE
       SET student_verified = true,
           student_verified_at = NOW(),
           student_verification_expires_at = $3,
           updated_at = NOW()`,
      [verification.extension_user_id, verification.email, expiresAt]
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

    const verificationData = verification.rows[0];

    console.log(`🗑️ Deleting verification for user: ${verificationData.extension_user_id}, email: ${verificationData.email}`);

    // Reset user's student verification status in users table
    const updateResult = await pool.query(
      `UPDATE users
       SET student_verified = false,
           student_verified_at = NULL,
           student_verification_expires_at = NULL,
           updated_at = NOW()
       WHERE extension_user_id = $1 OR email = $2
       RETURNING extension_user_id, email, student_verified`,
      [verificationData.extension_user_id, verificationData.email]
    );

    if (updateResult.rows.length > 0) {
      console.log(`✅ Reset student verification status for user:`, updateResult.rows[0]);
    } else {
      console.warn(`⚠️ No user found to update with extension_user_id: ${verificationData.extension_user_id} or email: ${verificationData.email}`);
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
      [adminEmail, 'delete_student_verification', 'student_verifications', id, JSON.stringify(verificationData)]
    );

    res.json({
      success: true,
      message: 'Student verification deleted and user status reset'
    });

  } catch (error) {
    console.error('Error deleting verification:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete verification'
    });
  }
});

// Admin: Debug - Get user and verification data by email
router.get('/admin/debug-user/:email', requireAdmin, async (req, res) => {
  try {
    const { email } = req.params;

    // Get user data
    const userData = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    // Get verification data
    const verificationData = await pool.query(
      'SELECT * FROM student_verifications WHERE email = $1 ORDER BY requested_at DESC LIMIT 1',
      [email]
    );

    res.json({
      success: true,
      user: userData.rows[0] || null,
      verification: verificationData.rows[0] || null,
      user_count: userData.rows.length,
      verification_count: verificationData.rows.length
    });

  } catch (error) {
    console.error('Error debugging user:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to debug user data'
    });
  }
});

// Admin: Manually reset user's student verification status by email
router.post('/admin/reset-user-status', requireAdmin, async (req, res) => {
  try {
    const { email } = req.body;
    const adminEmail = req.admin.email;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required'
      });
    }

    console.log(`🔄 Manually resetting student verification for email: ${email}`);

    // Reset user's student verification status
    const updateResult = await pool.query(
      `UPDATE users
       SET student_verified = false,
           student_verified_at = NULL,
           student_verification_expires_at = NULL,
           updated_at = NOW()
       WHERE email = $1
       RETURNING extension_user_id, email, student_verified`,
      [email]
    );

    if (updateResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        message: `No user found with email: ${email}`
      });
    }

    console.log(`✅ Reset student verification for:`, updateResult.rows[0]);

    // Log admin action (optional - don't fail if this doesn't work)
    try {
      await pool.query(
        `INSERT INTO admin_actions (admin_email, action, target_entity, target_id, details)
         VALUES ($1, $2, $3, $4, $5)`,
        [adminEmail, 'reset_user_student_status', 'users', updateResult.rows[0].extension_user_id, JSON.stringify({ email, reset_by: adminEmail })]
      );
    } catch (logError) {
      console.warn('Could not log admin action:', logError.message);
    }

    res.json({
      success: true,
      message: 'User student verification status reset successfully',
      user: updateResult.rows[0]
    });

  } catch (error) {
    console.error('Error resetting user status:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to reset user status'
    });
  }
});

// Admin: AI Verify Student ID
router.post('/admin/ai-verify/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const adminEmail = req.admin.email;

    // Get verification details
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

    if (!verification.student_id_front_url) {
      return res.status(400).json({
        success: false,
        message: 'Student ID image is required for AI verification'
      });
    }

    // Update status to processing
    await pool.query(
      `UPDATE student_verifications SET ai_status = 'processing' WHERE id = $1`,
      [id]
    );

    // Get AI prompt from system settings
    const promptResult = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'ai_verification_prompt'`
    );
    const aiPrompt = promptResult.rows.length > 0 && promptResult.rows[0].setting_value
      ? promptResult.rows[0].setting_value
      : null;

    if (!aiPrompt) {
      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'manual_review',
             ai_reason = 'AI verification prompt not configured'
         WHERE id = $1`,
        [id]
      );

      return res.status(500).json({
        success: false,
        message: 'AI verification prompt not configured in admin settings.'
      });
    }

    // Get OpenRouter API key (from system settings override, or Railway env variable)
    const apiKeyResult = await pool.query(
      `SELECT setting_value FROM system_settings WHERE setting_key = 'openrouter_api_key'`
    );
    const dbApiKey = (apiKeyResult.rows.length > 0 && apiKeyResult.rows[0].setting_value)
      ? apiKeyResult.rows[0].setting_value
      : '';
    const apiKey = dbApiKey || process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      // Update status to failed
      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'manual_review',
             ai_reason = 'OpenRouter API key not configured'
         WHERE id = $1`,
        [id]
      );

      return res.status(500).json({
        success: false,
        message: 'OpenRouter API key not configured. Please add it to Railway environment variables or admin settings.'
      });
    }

    // Call OpenRouter API with GPT-4o vision
    const fetch = require('node-fetch');

    const requestBody = {
      model: 'openai/gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: aiPrompt
            },
            {
              type: 'image_url',
              image_url: {
                url: verification.student_id_front_url
              }
            }
          ]
        }
      ],
      temperature: 0.1, // Low temperature for consistent results
      max_tokens: 500
    };

    console.log('🤖 Calling OpenRouter API for AI verification...');

    const openRouterResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://aifreedomclub.com',
        'X-Title': 'YouTube Summarizer Pro - Student Verification'
      },
      body: JSON.stringify(requestBody)
    });

    if (!openRouterResponse.ok) {
      const errorText = await openRouterResponse.text();
      console.error('❌ OpenRouter API error:', errorText);

      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'failed',
             ai_reason = 'OpenRouter API request failed'
         WHERE id = $1`,
        [id]
      );

      return res.status(500).json({
        success: false,
        message: 'AI verification failed. OpenRouter API error.',
        error: errorText
      });
    }

    const aiResponse = await openRouterResponse.json();
    console.log('✅ OpenRouter API response received');

    // Extract the AI's response
    let aiContent = aiResponse.choices[0].message.content;

    // Strip markdown code blocks if present (```json ... ``` or ``` ... ```)
    aiContent = aiContent.replace(/^```(?:json)?\s*\n?/,'').replace(/\n?```\s*$/,'').trim();

    let aiResult;

    try {
      // Parse the JSON response from AI
      aiResult = JSON.parse(aiContent);
    } catch (parseError) {
      console.error('❌ Failed to parse AI response:', aiContent);

      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'failed',
             ai_reason = 'Failed to parse AI response'
         WHERE id = $1`,
        [id]
      );

      return res.status(500).json({
        success: false,
        message: 'AI verification failed. Could not parse AI response.',
        aiContent
      });
    }

    // Calculate cost (GPT-4o vision: ~$2.50 per 1M input tokens, ~$10 per 1M output tokens)
    // Rough estimate: ~1000 tokens for 2 images + prompt, ~100 tokens output
    const inputTokens = aiResponse.usage?.prompt_tokens || 1000;
    const outputTokens = aiResponse.usage?.completion_tokens || 100;
    const estimatedCost = (inputTokens / 1000000 * 2.5) + (outputTokens / 1000000 * 10);

    // Update verification with AI results
    await pool.query(
      `UPDATE student_verifications
       SET ai_status = $1,
           ai_result = $2,
           ai_confidence = $3,
           ai_reason = $4,
           ai_verified_at = NOW(),
           ai_cost = $5
       WHERE id = $6`,
      [
        aiResult.verification_result,
        JSON.stringify(aiResult),
        aiResult.confidence,
        aiResult.reason,
        estimatedCost,
        id
      ]
    );

    console.log(`🤖 AI Verification result for ID ${id}: ${aiResult.verification_result} (${aiResult.confidence}% confidence)`);

    // Log admin action
    await pool.query(
      `INSERT INTO admin_actions (admin_email, action, target_entity, target_id, details)
       VALUES ($1, $2, $3, $4, $5)`,
      [adminEmail, 'ai_verify_student', 'student_verifications', id, JSON.stringify(aiResult)]
    );

    res.json({
      success: true,
      message: 'AI verification completed',
      ai_result: aiResult,
      cost: estimatedCost
    });

  } catch (error) {
    console.error('Error in AI verification:', error);

    // Update status to failed
    try {
      await pool.query(
        `UPDATE student_verifications
         SET ai_status = 'failed',
             ai_reason = $1
         WHERE id = $2`,
        [error.message, req.params.id]
      );
    } catch (updateError) {
      console.error('Error updating failed status:', updateError);
    }

    res.status(500).json({
      success: false,
      message: 'Failed to run AI verification',
      error: error.message
    });
  }
});

module.exports = router;
