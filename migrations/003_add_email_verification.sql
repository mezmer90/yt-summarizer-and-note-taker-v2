-- Migration: Add email verification table
-- Created: 2025-01-08

CREATE TABLE IF NOT EXISTS email_verifications (
  id SERIAL PRIMARY KEY,
  extension_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  verification_code VARCHAR(6) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  verified BOOLEAN DEFAULT FALSE,
  attempts INT DEFAULT 0,
  UNIQUE(extension_user_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_email_verifications_user_id ON email_verifications(extension_user_id);
CREATE INDEX IF NOT EXISTS idx_email_verifications_email ON email_verifications(email);
CREATE INDEX IF NOT EXISTS idx_email_verifications_code ON email_verifications(verification_code);

-- Clean up expired codes automatically
CREATE INDEX IF NOT EXISTS idx_email_verifications_expires ON email_verifications(expires_at);
