-- Index Advisor recommendation: dedicated btree index on user_roles.user_id
-- The existing unique constraint (user_id, role) is composite; this single-column
-- index is more efficient for the frequent user_id-only lookups (19K+ calls).

CREATE INDEX IF NOT EXISTS idx_user_roles_user_id
  ON public.user_roles USING btree (user_id);
