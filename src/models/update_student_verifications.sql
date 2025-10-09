-- Add new columns to student_verifications table for enhanced verification
-- Run this migration to add support for student name, separate front/back ID images, and email verification

ALTER TABLE student_verifications
ADD COLUMN IF NOT EXISTS student_name VARCHAR(255),
ADD COLUMN IF NOT EXISTS student_id_front_url TEXT,
ADD COLUMN IF NOT EXISTS student_id_back_url TEXT,
ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS verification_token TEXT,
ADD COLUMN IF NOT EXISTS token_expires_at TIMESTAMP;
