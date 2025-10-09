-- Add AI verification columns to student_verifications table
-- This migration adds support for automated AI-based student ID verification

ALTER TABLE student_verifications
ADD COLUMN IF NOT EXISTS ai_status VARCHAR(50), -- 'pending', 'processing', 'approved', 'reupload_front', 'reupload_back', 'reupload_both', 'rejected', 'failed', 'manual_review'
ADD COLUMN IF NOT EXISTS ai_result JSONB, -- Full JSON response from AI including verification_result, reason, confidence
ADD COLUMN IF NOT EXISTS ai_confidence INTEGER, -- Confidence score 0-100
ADD COLUMN IF NOT EXISTS ai_reason TEXT, -- Short explanation from AI
ADD COLUMN IF NOT EXISTS ai_verified_at TIMESTAMP, -- When AI verification was completed
ADD COLUMN IF NOT EXISTS ai_cost DECIMAL(10, 6) DEFAULT 0.00; -- Cost of AI verification in USD

-- Create index for AI status queries
CREATE INDEX IF NOT EXISTS idx_student_verifications_ai_status ON student_verifications(ai_status);
CREATE INDEX IF NOT EXISTS idx_student_verifications_ai_verified_at ON student_verifications(ai_verified_at);
