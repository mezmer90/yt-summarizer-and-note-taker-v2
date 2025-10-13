-- Feedback Table for User Feedback Submissions
CREATE TABLE IF NOT EXISTS feedback (
  id SERIAL PRIMARY KEY,
  extension_user_id VARCHAR(255) NOT NULL,
  user_email VARCHAR(255),
  type VARCHAR(50) NOT NULL,
  message TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'new',
  replied_at TIMESTAMP,
  reply_message TEXT,
  replied_by VARCHAR(255),
  submitted_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for Performance
CREATE INDEX IF NOT EXISTS idx_feedback_extension_id ON feedback(extension_user_id);
CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);
CREATE INDEX IF NOT EXISTS idx_feedback_type ON feedback(type);
CREATE INDEX IF NOT EXISTS idx_feedback_submitted_at ON feedback(submitted_at);

-- Comments
COMMENT ON TABLE feedback IS 'User feedback submissions from Chrome extension';
COMMENT ON COLUMN feedback.type IS 'Feedback type: bug, feature, improvement, compliment, other';
COMMENT ON COLUMN feedback.status IS 'Status: new, read, replied';
