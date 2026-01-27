-- Add new values to account_status enum
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'pending_coach_approval';
ALTER TYPE account_status ADD VALUE IF NOT EXISTS 'inactive';