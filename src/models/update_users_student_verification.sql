-- Add student verification columns to users table
-- Tracks if user is verified as student and expiration date (yearly reverification)

ALTER TABLE users
ADD COLUMN IF NOT EXISTS student_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS student_verified_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS student_verification_expires_at TIMESTAMP;
