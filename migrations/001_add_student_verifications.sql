-- Migration: Add Student Verifications Table
-- Run this on Railway database

-- Create student_verifications table
CREATE TABLE IF NOT EXISTS student_verifications (
  id SERIAL PRIMARY KEY,
  extension_user_id VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  student_id_url TEXT,
  university_name VARCHAR(255),
  graduation_year INTEGER,
  status VARCHAR(50) DEFAULT 'pending',
  requested_at TIMESTAMP DEFAULT NOW(),
  reviewed_by VARCHAR(255),
  reviewed_at TIMESTAMP,
  rejection_reason TEXT,
  expires_at TIMESTAMP
);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_student_verifications_extension_id ON student_verifications(extension_user_id);
CREATE INDEX IF NOT EXISTS idx_student_verifications_status ON student_verifications(status);

-- Verify table created
SELECT 'Student verifications table created successfully' as message;
