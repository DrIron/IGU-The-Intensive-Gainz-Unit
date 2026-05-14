import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useRoleCache } from "@/hooks/useRoleCache";
import { useUserSubroles } from "@/hooks/useUserSubroles";
import type { NutritionPermissions, NutritionRole } from "@/types/nutrition-phase22";

interface UseNutritionPermissionsProps {
  clientUserId: string;
}

/**
 * Hook to check nutrition editing permissions.
 *
 * Permission hierarchy:
 * 1. Admin - always can edit
 * 2. Dietitian (assigned to client) - can edit
 * 3. Coach (primary) - can edit ONLY if no dietitian assigned
 * 4. Self (client) - can log own data
 * 5. None - no access
 *
 * Backed by the `can_edit_nutrition(actor_uid, client_uid)` RPC for the
 * edit decision, plus three role-determining reads for the UX-copy
 * distinction (assigned dietitian vs. read-only coach vs. unaffiliated).
 *
 * Perf: this used to fire ~7 sequential round-trips per mount, and
 * `NutritionTab` mounts five `NutritionPermissionGate` instances on the
 * same `clientUserId` -- ~35 sequential hits per tab open. Now:
 *   - React Query dedupes the five gates to ONE shared fetch (keyed on
 *     viewerId + clientUserId).
 *   - The remaining reads run in a single `Promise.all`.
 *   - Roles piggyback on `useRoleCache` (warm ~99% of the time) and
 *     subroles on `useUserSubroles` (React-Query cached, 5 min).
 * Cold case: ~6 requests (1 user_roles + 5 in the Promise.all). Warm
 * cachedRoles: 5. Re-open within the 1-min staleTime: 0.
 */
export function useNutritionPermissions({ clientUserId }: UseNutritionPermissionsProps): NutritionPermissions {
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const { cachedRoles, cachedUserId } = useRoleCache();
  const viewerId = sessionUser?.id ?? cachedUserId ?? null;
  const { approvedSlugs, isLoading: subrolesLoading } = useUserSubroles(viewerId ?? undefined);

  // Only trust cachedRoles when it belongs to the current viewer.
  // useRoleCache's reactive `cachedRoles` is read from localStorage at mount
  // and isn't re-validated against viewerId, so an A-then-B session swap in
  // the same tab could otherwise leak user A's roles into user B's query.
  const rolesFromCache = cachedRoles && cachedUserId === viewerId ? cachedRoles : null;

  const query = useQuery({
    queryKey: ["nutrition-permissions", viewerId, clientUserId],
    enabled: !!viewerId && !!clientUserId && !subrolesLoading,
    // 1 min -- deliberately shorter than useUserSubroles' 5 min, because
    // care_team_assignments can flip mid-session (a primary coach adding the
    // viewer to a care team). Trades a tiny refetch for fresher edit
    // decisions.
    staleTime: 60 * 1000,
    queryFn: async () => {
      // Roles come from the warm localStorage cache when available; otherwise
      // a one-shot fetch joins the same Promise.all so it stays one batch.
      const rolesPromise: Promise<{ data: string[]; error: unknown }> = rolesFromCache
        ? Promise.resolve({ data: rolesFromCache, error: null })
        : supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", viewerId!)
            .then(({ data, error }) => ({
              data: data?.map((r) => r.role) ?? [],
              error,
            }));

      const [
        rolesRes,
        hasDietitianRes,
        canEditRes,
        dietitianAssignmentRes,
        subscriptionRes,
        careTeamRes,
      ] = await Promise.all([
        rolesPromise,
        supabase.rpc("client_has_dietitian", { p_client_uid: clientUserId }),
        supabase.rpc("can_edit_nutrition", {
          p_actor_uid: viewerId!,
          p_client_uid: clientUserId,
        }),
        // viewer == assigned dietitian on this client?
        supabase
          .from("care_team_assignments")
          .select("id")
          .eq("staff_user_id", viewerId!)
          .eq("client_id", clientUserId)
          .eq("specialty", "dietitian")
          .eq("lifecycle_status", "active")
          .maybeSingle(),
        // viewer == primary coach on this client?
        supabase
          .from("subscriptions")
          .select("id")
          .eq("user_id", clientUserId)
          .eq("coach_id", viewerId!)
          .eq("status", "active")
          .maybeSingle(),
        // viewer == any active care-team member on this client?
        // (consumed only by the mobility-coach branch below)
        supabase
          .from("care_team_assignments")
          .select("id")
          .eq("staff_user_id", viewerId!)
          .eq("client_id", clientUserId)
          .in("lifecycle_status", ["active", "scheduled_end"])
          .maybeSingle(),
      ]);

      // Every read is destructured + logged. RLS denials on `.select()`
      // return HTTP 200 / zero rows / no thrown error (CLAUDE.md), so a
      // silent `error` field must be surfaced explicitly rather than left
      // to collapse into a default `false` with no trace.
      if (rolesRes.error) console.error("[useNutritionPermissions] roles:", rolesRes.error);
      if (hasDietitianRes.error) console.error("[useNutritionPermissions] client_has_dietitian:", hasDietitianRes.error);
      if (canEditRes.error) console.error("[useNutritionPermissions] can_edit_nutrition:", canEditRes.error);
      if (dietitianAssignmentRes.error) console.error("[useNutritionPermissions] dietitian assignment:", dietitianAssignmentRes.error);
      if (subscriptionRes.error) console.error("[useNutritionPermissions] subscription:", subscriptionRes.error);
      if (careTeamRes.error) console.error("[useNutritionPermissions] care team:", careTeamRes.error);

      return {
        rolesArr: rolesRes.data ?? [],
        clientHasDietitian: Boolean(hasDietitianRes.data),
        canEdit: Boolean(canEditRes.data),
        isAssignedDietitian: Boolean(dietitianAssignmentRes.data),
        isPrimaryCoach: Boolean(subscriptionRes.data),
        isCareTeamMember: Boolean(careTeamRes.data),
      };
    },
  });

  const data = query.data;

  // Loading when: the query is in flight, OR subroles are still resolving for
  // a known viewer, OR there's no viewerId yet AND the session is still
  // resolving (cold start, empty role cache). The last clause prevents a
  // flash of the denied-state Alert before auth settles.
  const isLoading =
    query.isLoading ||
    (!!viewerId && subrolesLoading) ||
    (!viewerId && sessionLoading);

  // Synchronous per-client role derivation. Unlike the old terminal else-if
  // cascade -- where holding the dietitian role/subrole *globally* shadowed
  // the coach branch even on a client you were the primary coach of -- each
  // branch here checks the viewer's actual relationship TO THIS CLIENT:
  //   - dietitian role/subrole AND assigned dietitian on this client
  //   - coach role AND primary coach on this client
  //   - mobility-coach subrole AND active care-team member on this client
  // First match wins. Completes the per-client-role consistency started in
  // commit 309d097 (resolveViewerRole).
  const currentUserRole: NutritionRole = ((): NutritionRole => {
    if (!data) return "none";
    const isAdmin = data.rolesArr.includes("admin");
    const isCoach = data.rolesArr.includes("coach");
    const isDietitian =
      data.rolesArr.includes("dietitian") || approvedSlugs.includes("dietitian");
    const isMobility = approvedSlugs.includes("mobility_coach");
    const isSelf = viewerId === clientUserId;

    if (isAdmin) return "dietitian"; // admins get full nutrition access
    if (isDietitian && data.isAssignedDietitian) return "dietitian";
    if (isCoach && data.isPrimaryCoach) return "coach";
    if (isMobility && data.isCareTeamMember) return "coach";
    if (isSelf) return "self";
    return "none";
  })();

  // Coach loses edit access when the client has an assigned dietitian.
  // Preserved from the original (was a post-hoc `canEdit = false` mutation).
  const canEdit =
    (data?.canEdit ?? false) &&
    !(currentUserRole === "coach" && (data?.clientHasDietitian ?? false));

  return {
    canEdit,
    isLoading,
    clientHasDietitian: data?.clientHasDietitian ?? false,
    currentUserRole,
  };
}
