-- Migration: Add screenshot_url column to feedback table
-- Run this to add screenshot support to existing feedback tables

ALTER TABLE feedback
ADD COLUMN IF NOT EXISTS screenshot_url TEXT;

COMMENT ON COLUMN feedback.screenshot_url IS 'Base64 encoded screenshot or URL to screenshot image attached to feedback';
