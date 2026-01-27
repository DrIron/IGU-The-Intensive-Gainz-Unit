-- Create table to block re-login/signups for deleted accounts
CREATE TABLE IF NOT EXISTS public.blocked_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  reason TEXT,
  blocked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  blocked_by UUID
);

ALTER TABLE public.blocked_emails ENABLE ROW LEVEL SECURITY;

-- RLS: only admins can manage/view
CREATE POLICY "Admins can view blocked emails"
ON public.blocked_emails FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert blocked emails"
ON public.blocked_emails FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update blocked emails"
ON public.blocked_emails FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete blocked emails"
ON public.blocked_emails FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));