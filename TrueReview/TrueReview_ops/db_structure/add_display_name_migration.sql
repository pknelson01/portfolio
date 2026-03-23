-- Migration: Add display_name column and search indexes
-- Run this on your PostgreSQL database

-- Step 1: Add display_name column (if not exists)
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name VARCHAR(20);

-- Step 2: Backfill existing users with username as display_name
UPDATE users SET display_name = username WHERE display_name IS NULL;

-- Step 3: Add NOT NULL constraint
ALTER TABLE users ALTER COLUMN display_name SET NOT NULL;

-- Step 4: Create fuzzy search indexes (pg_trgm extension should already be enabled)
CREATE INDEX IF NOT EXISTS idx_username_trgm ON users USING gin (username gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_display_name_trgm ON users USING gin (display_name gin_trgm_ops);

-- Verify the changes
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns
WHERE table_name = 'users' AND column_name = 'display_name';

-- Check indexes
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'users' AND (indexname LIKE '%username%' OR indexname LIKE '%display_name%');
