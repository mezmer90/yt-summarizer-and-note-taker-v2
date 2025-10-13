// Feedback Routes
const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');
const { sendEmail, sendFeedbackReply } = require('../services/emailService');

// Submit feedback
router.post('/feedback/submit', async (req, res) => {
  try {
    const { extensionUserId, userEmail, type, message, timestamp } = req.body;

    // Validate required fields
    if (!type || !message) {
      return res.status(400).json({
        success: false,
        error: 'Type and message are required'
      });
    }

    // Validate feedback type
    const validTypes = ['bug', 'feature', 'improvement', 'compliment', 'other'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid feedback type'
      });
    }

    // Insert feedback into database
    const result = await pool.query(
      `INSERT INTO feedback (extension_user_id, user_email, type, message, status, submitted_at)
       VALUES ($1, $2, $3, $4, 'new', $5)
       RETURNING id, submitted_at`,
      [
        extensionUserId || 'anonymous',
        userEmail || 'Not provided',
        type,
        message,
        timestamp || new Date().toISOString()
      ]
    );

    console.log('✅ Feedback submitted:', {
      id: result.rows[0].id,
      type,
      extensionUserId,
      userEmail
    });

    // Send notification to admin (optional)
    try {
      const typeEmojis = {
        bug: '🐛',
        feature: '💡',
        improvement: '⚡',
        compliment: '💜',
        other: '💬'
      };

      await sendEmail({
        to: 'support@aifreedomclub.com',
        subject: `${typeEmojis[type]} New Feedback: ${type}`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
              <h1 style="margin: 0;">${typeEmojis[type]} New Feedback Received</h1>
              <p style="margin: 10px 0 0 0;">YouTube Summarizer Pro</p>
            </div>

            <div style="background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px;">
              <h2>Feedback Details</h2>

              <div style="background: white; border-left: 4px solid #667eea; padding: 15px; margin: 20px 0;">
                <p style="margin: 5px 0;"><strong>Type:</strong> ${type.toUpperCase()}</p>
                <p style="margin: 5px 0;"><strong>From:</strong> ${userEmail}</p>
                <p style="margin: 5px 0;"><strong>User ID:</strong> ${extensionUserId}</p>
                <p style="margin: 5px 0;"><strong>Feedback ID:</strong> #${result.rows[0].id}</p>
                <p style="margin: 5px 0;"><strong>Submitted:</strong> ${new Date(result.rows[0].submitted_at).toLocaleString()}</p>
              </div>

              <div style="background: #f0f0f0; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <p style="margin: 0; font-weight: bold;">Message:</p>
                <p style="margin: 10px 0 0 0; white-space: pre-wrap;">${message}</p>
              </div>

              <div style="text-align: center; margin: 30px 0;">
                <a href="https://yt-summarizer-and-note-taker-v2-production.up.railway.app/admin"
                   style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  View in Admin Panel
                </a>
              </div>
            </div>
          </div>
        `
      });
    } catch (emailError) {
      console.error('⚠️ Failed to send admin notification email:', emailError);
      // Don't fail the request if email fails
    }

    res.json({
      success: true,
      feedbackId: result.rows[0].id,
      message: 'Feedback submitted successfully'
    });

  } catch (error) {
    console.error('❌ Error submitting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit feedback'
    });
  }
});

// Get all feedback (admin only)
router.get('/feedback/all', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT
        id,
        extension_user_id,
        user_email,
        type,
        message,
        status,
        replied_at,
        reply_message,
        replied_by,
        submitted_at
      FROM feedback
      ORDER BY submitted_at DESC`
    );

    res.json({
      success: true,
      feedback: result.rows,
      count: result.rows.length
    });

  } catch (error) {
    console.error('❌ Error fetching feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch feedback'
    });
  }
});

// Update feedback status (mark as read)
router.post('/feedback/:id/mark-read', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query(
      `UPDATE feedback
       SET status = 'read'
       WHERE id = $1`,
      [id]
    );

    res.json({
      success: true,
      message: 'Feedback marked as read'
    });

  } catch (error) {
    console.error('❌ Error marking feedback as read:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update feedback status'
    });
  }
});

// Reply to feedback
router.post('/feedback/:id/reply', async (req, res) => {
  try {
    const { id } = req.params;
    const { replyMessage, repliedBy } = req.body;

    if (!replyMessage) {
      return res.status(400).json({
        success: false,
        error: 'Reply message is required'
      });
    }

    // Get feedback details
    const feedbackResult = await pool.query(
      'SELECT * FROM feedback WHERE id = $1',
      [id]
    );

    if (feedbackResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Feedback not found'
      });
    }

    const feedback = feedbackResult.rows[0];

    // Update feedback with reply
    await pool.query(
      `UPDATE feedback
       SET status = 'replied',
           reply_message = $1,
           replied_by = $2,
           replied_at = NOW()
       WHERE id = $3`,
      [replyMessage, repliedBy || 'Admin', id]
    );

    // Send reply email to user using Resend with feedback@aifreedomclub.com
    if (feedback.user_email && feedback.user_email !== 'Not provided') {
      try {
        await sendFeedbackReply(
          feedback.user_email,
          feedback.type,
          feedback.message,
          replyMessage,
          repliedBy
        );

        console.log('✅ Reply email sent to:', feedback.user_email);

      } catch (emailError) {
        console.error('⚠️ Failed to send reply email:', emailError);
        // Don't fail the request if email fails
      }
    }

    res.json({
      success: true,
      message: 'Reply sent successfully'
    });

  } catch (error) {
    console.error('❌ Error sending reply:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to send reply'
    });
  }
});

// Delete feedback
router.delete('/feedback/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.query('DELETE FROM feedback WHERE id = $1', [id]);

    res.json({
      success: true,
      message: 'Feedback deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting feedback:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete feedback'
    });
  }
});

module.exports = router;
