-- Phase 0/F2 of addon-services Path B rebuild.
-- See docs/ADDON_SERVICES_BUILD_SPEC.md § 1 (F2).
--
-- View that derives sessions_remaining from (pack_size * quantity) minus
-- the count of addon_session_logs. Eliminates the writable column that
-- nothing decrements (root cause of B6-N4).
--
-- The view is SECURITY INVOKER by default in Postgres, so RLS on
-- addon_purchases + addon_session_logs continues to filter rows -- clients
-- still only see their own packs.
--
-- Excludes soft-deleted rows by default (deleted_at IS NULL). Admin tooling
-- that needs to see deleted rows queries addon_purchases directly.
--
-- The writable sessions_remaining column on addon_purchases stays in place
-- through Phase 0..4. Phase 5 drops it (destructive). FE call sites
-- migrate to the view incrementally; SessionsTab.tsx currently selects
-- only ap.id + ap.addon_service_id, so it doesn't depend on the column at
-- all and needs no change.

CREATE OR REPLACE VIEW public.addon_purchases_with_remaining AS
SELECT
  ap.id,
  ap.client_id,
  ap.addon_service_id,
  ap.professional_id,
  ap.payment_id,
  ap.quantity,
  ap.total_paid_kwd,
  ap.discount_percentage,
  ap.expires_at,
  ap.purchased_at,
  ap.created_at,
  ap.status,
  ap.deleted_at,
  svc.name AS service_name,
  svc.type AS service_type,
  svc.required_subrole,
  -- sessions_total: how many sessions this purchase entitles to.
  -- session_pack: pack_size per pack * quantity.
  -- one_time / specialist single / monthly_addon: 1 per quantity (treated as 1 session each).
  (ap.quantity * COALESCE(svc.pack_size, 1)) AS sessions_total,
  -- consumed: count of logs against this purchase (RLS on logs filters by viewer).
  COALESCE(logs.consumed, 0) AS sessions_consumed,
  -- remaining: clamp at zero defensively in case of historical drift.
  GREATEST(
    (ap.quantity * COALESCE(svc.pack_size, 1)) - COALESCE(logs.consumed, 0),
    0
  ) AS sessions_remaining,
  -- is_usable: convenience flag for FE -- true iff active and not past expiry.
  (ap.status = 'active' AND ap.expires_at > now()) AS is_usable
FROM public.addon_purchases ap
JOIN public.addon_services svc ON svc.id = ap.addon_service_id
LEFT JOIN LATERAL (
  SELECT COUNT(*)::int AS consumed
  FROM public.addon_session_logs asl
  WHERE asl.addon_purchase_id = ap.id
) logs ON true
WHERE ap.deleted_at IS NULL;

COMMENT ON VIEW public.addon_purchases_with_remaining IS
  'Derived view of addon_purchases with sessions_remaining computed from '
  'addon_session_logs count. Use this instead of the writable '
  'addon_purchases.sessions_remaining column (deprecated, dropped in Phase 5). '
  'Excludes soft-deleted rows. Inherits RLS from underlying tables.';

GRANT SELECT ON public.addon_purchases_with_remaining TO authenticated;
