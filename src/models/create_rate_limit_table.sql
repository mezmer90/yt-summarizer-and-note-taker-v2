-- Rate limiting for student verification submissions
-- Tracks IP addresses to prevent spam (1 submission per 10 minutes)

CREATE TABLE IF NOT EXISTS student_verification_rate_limit (
  id SERIAL PRIMARY KEY,
  ip_address VARCHAR(45) UNIQUE NOT NULL,
  last_submission_at TIMESTAMP DEFAULT NOW(),
  submission_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_ip ON student_verification_rate_limit(ip_address);
CREATE INDEX IF NOT EXISTS idx_rate_limit_timestamp ON student_verification_rate_limit(last_submission_at);

-- Cleanup old entries (older than 1 day)
DELETE FROM student_verification_rate_limit WHERE last_submission_at < NOW() - INTERVAL '1 day';
