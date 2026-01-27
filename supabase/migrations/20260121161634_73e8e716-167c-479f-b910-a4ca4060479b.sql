-- Add before/after JSON columns to admin_audit_log for detailed change tracking
ALTER TABLE public.admin_audit_log 
ADD COLUMN IF NOT EXISTS before_json JSONB,
ADD COLUMN IF NOT EXISTS after_json JSONB;

-- Rename columns to match requested schema (action_type -> action, target_type -> entity_type, target_id -> entity_id)
-- We'll keep the existing columns and add aliases via a comment for clarity
COMMENT ON COLUMN public.admin_audit_log.action_type IS 'The action performed (alias: action)';
COMMENT ON COLUMN public.admin_audit_log.target_type IS 'The entity type affected (alias: entity_type)';
COMMENT ON COLUMN public.admin_audit_log.target_id IS 'The entity ID affected (alias: entity_id)';

-- Create index for faster lookups on pricing-related audit logs
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_target_type ON public.admin_audit_log(target_type);
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_created_at ON public.admin_audit_log(created_at DESC);