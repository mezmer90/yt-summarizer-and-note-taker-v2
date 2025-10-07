-- Add email verification fields to student_verifications table

ALTER TABLE student_verifications
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS verification_token VARCHAR(255) UNIQUE,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;

-- Create index for faster token lookups
CREATE INDEX IF NOT EXISTS idx_verification_token ON student_verifications(verification_token);

-- Update status column to include 'email_pending' status
-- Status flow: email_pending → pending → approved/rejected
COMMENT ON COLUMN student_verifications.status IS 'email_pending: waiting for email verification, pending: email verified waiting for admin approval, approved: admin approved, rejected: admin rejected';
