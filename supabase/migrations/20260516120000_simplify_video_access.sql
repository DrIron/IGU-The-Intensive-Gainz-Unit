-- Educational content: drop entitlement table, gate by active subscription with
-- optional per-video service scoping. See docs/EDUCATIONAL_CONTENT_REVIEW.md §6 PR B.
--
-- Ordering note: REPLACE can_access_video BEFORE dropping video_entitlements so
-- the CASCADE only sweeps the SQL-language helper (user_has_video_entitlement),
-- not the policy graph hanging off can_access_video.

BEGIN;

-- 1. Add optional per-video service scoping. NULL or empty = visible to every active subscriber.
ALTER TABLE public.educational_videos
  ADD COLUMN IF NOT EXISTS required_service_ids UUID[] NULL;

COMMENT ON COLUMN public.educational_videos.required_service_ids IS
  'NULL or empty = visible to any subscriber with an active/pending_payment subscription. Non-empty = only subscribers whose subscription.service_id IN this array.';

CREATE INDEX IF NOT EXISTS idx_educational_videos_required_services
  ON public.educational_videos USING GIN (required_service_ids)
  WHERE required_service_ids IS NOT NULL;

-- 2. Replace can_access_video to gate by active subscription + optional service scope.
-- Plpgsql avoids catalog-level body deps that would tangle a future CASCADE.
-- Two-arg form does the real work; single-arg form is a thin auth.uid() wrapper used by RLS policies + RPCs.

CREATE OR REPLACE FUNCTION public.can_access_video(p_user_id uuid, p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_video RECORD;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN false;
  END IF;

  IF public.has_role(p_user_id, 'admin') THEN
    RETURN true;
  END IF;

  IF public.has_role(p_user_id, 'coach') THEN
    RETURN true;
  END IF;

  SELECT is_active, is_free_preview, required_service_ids, prerequisite_video_id
  INTO v_video
  FROM public.educational_videos
  WHERE id = p_video_id;

  IF NOT FOUND OR v_video.is_active IS NOT TRUE THEN
    RETURN false;
  END IF;

  IF v_video.is_free_preview = true THEN
    RETURN true;
  END IF;

  -- Subscription scope: any active/pending_payment sub; if scope is set, service_id must match.
  IF NOT EXISTS (
    SELECT 1
    FROM public.subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status IN ('active', 'pending_payment')
      AND (
        v_video.required_service_ids IS NULL
        OR cardinality(v_video.required_service_ids) = 0
        OR s.service_id = ANY (v_video.required_service_ids)
      )
  ) THEN
    RETURN false;
  END IF;

  -- Prerequisite check (inline; the helper video_prerequisite_met has only a single-arg overload).
  IF v_video.prerequisite_video_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.video_progress vp
      WHERE vp.user_id = p_user_id
        AND vp.video_id = v_video.prerequisite_video_id
        AND vp.completed_at IS NOT NULL
    ) THEN
      RETURN false;
    END IF;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_access_video(p_video_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RETURN false;
  END IF;
  RETURN public.can_access_video(v_user_id, p_video_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_access_video(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_video(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.can_access_video(uuid, uuid) IS
  'Returns true if p_user_id can access p_video_id. Admin/coach -> true; inactive -> false; free preview -> true; otherwise requires active/pending_payment subscription whose service_id matches the video required_service_ids (or NULL/empty scope), and completed prerequisite if any.';

COMMENT ON FUNCTION public.can_access_video(uuid) IS
  'auth.uid() wrapper for can_access_video(uuid, uuid). Safe for direct use in RLS policies.';

-- 3. Drop the unused entitlement model. Safe now that can_access_video no longer references it.
-- CASCADE sweeps the policies on the dropped table and the SQL-language helper that
-- still embeds a SELECT against video_entitlements.
DROP TABLE IF EXISTS public.video_entitlements CASCADE;
DROP FUNCTION IF EXISTS public.user_has_video_entitlement(uuid) CASCADE;
DROP FUNCTION IF EXISTS public.user_has_video_entitlement(uuid, uuid) CASCADE;

-- 4. Backfill defense: ensure no rogue NULL flags (columns are nullable; DEFAULTs only set on new rows).
UPDATE public.educational_videos SET is_free_preview = false WHERE is_free_preview IS NULL;
UPDATE public.educational_videos SET is_active = true WHERE is_active IS NULL;

COMMIT;
