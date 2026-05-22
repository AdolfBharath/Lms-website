-- ========================================================
-- ADD REFERRAL COLUMN TO USERS TABLE
-- ========================================================
-- Run this in the Supabase SQL Editor to support saving
-- student referral codes directly inside the user table.

ALTER TABLE users ADD COLUMN IF NOT EXISTS referral TEXT;

-- Verify the column was added
COMMENT ON COLUMN users.referral IS 'Student referral code generated for sharing';
