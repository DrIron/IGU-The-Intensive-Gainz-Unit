import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Demographics a coach can auto-populate into the nutrition goal form.
 * Every field is nullable -- a missing value just means the coach fills it
 * manually. Authorization is enforced in the SECURITY DEFINER RPCs:
 * caller must be the client themselves, an admin, the primary coach, or an
 * active care-team member.
 *
 * Migrations:
 *   - get_client_age:       20260502_get_client_age_rpc.sql
 *   - get_client_gender:    20260420120000_client_demographics_access.sql
 *   - get_client_height_cm: 20260420120000_client_demographics_access.sql
 *   - activity_level col:   20260421200000_add_activity_level.sql (on
 *                           profiles_public -- not PHI, coaches read directly)
 */
export interface ClientDemographics {
  age: number | null;
  gender: "male" | "female" | null;
  heightCm: number | null;
  latestWeightKg: number | null;
  latestWeightLoggedAt: string | null;
  activityLevel: string | null;
  isLoading: boolean;
}

const EMPTY: ClientDemographics = {
  age: null,
  gender: null,
  heightCm: null,
  latestWeightKg: null,
  latestWeightLoggedAt: null,
  activityLevel: null,
  isLoading: false,
};

export function useClientDemographics(clientUserId: string | null | undefined): ClientDemographics {
  const [state, setState] = useState<ClientDemographics>({ ...EMPTY, isLoading: !!clientUserId });
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (userId: string) => {
    // Parallelize the three RPCs + latest weight query. Each `{ data, error }`
    // is destructured; errors are logged but do not throw -- a single RPC
    // failure must not block the rest (e.g. a client with no gender stored
    // should still get age + height).
    const [ageRes, genderRes, heightRes, weightRes, publicRes] = await Promise.all([
      supabase.rpc("get_client_age", { p_client_id: userId }),
      supabase.rpc("get_client_gender" as never, { p_client_id: userId } as never),
      supabase.rpc("get_client_height_cm" as never, { p_client_id: userId } as never),
      supabase
        .from("weight_logs")
        .select("weight_kg, log_date")
        .eq("user_id", userId)
        .order("log_date", { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Activity level is on profiles_public (not PHI), so coaches can read
      // it directly -- no RPC needed.
      supabase
        .from("profiles_public")
        .select("activity_level")
        .eq("id", userId)
        .maybeSingle(),
    ]);

    if (ageRes.error) console.warn("[useClientDemographics] get_client_age:", ageRes.error.message);
    if (genderRes.error) console.warn("[useClientDemographics] get_client_gender:", genderRes.error.message);
    if (heightRes.error) console.warn("[useClientDemographics] get_client_height_cm:", heightRes.error.message);
    if (weightRes.error) console.warn("[useClientDemographics] weight_logs:", weightRes.error.message);
    if (publicRes.error) console.warn("[useClientDemographics] profiles_public:", publicRes.error.message);

    const rawGender = (genderRes.data as string | null) ?? null;
    const gender = rawGender === "male" || rawGender === "female" ? rawGender : null;

    setState({
      age: (ageRes.data as number | null) ?? null,
      gender,
      heightCm: (heightRes.data as number | null) ?? null,
      latestWeightKg: weightRes.data?.weight_kg ?? null,
      latestWeightLoggedAt: weightRes.data?.log_date ?? null,
      activityLevel: (publicRes.data as { activity_level: string | null } | null)?.activity_level ?? null,
      isLoading: false,
    });
  }, []);

  useEffect(() => {
    if (!clientUserId) {
      setState(EMPTY);
      hasFetched.current = null;
      return;
    }
    // Re-fetch when the client changes; skip if already fetched for this client.
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    setState((s) => ({ ...s, isLoading: true }));
    load(clientUserId).catch((err) => {
      console.error("[useClientDemographics] unexpected error:", err);
      setState((s) => ({ ...s, isLoading: false }));
    });
  }, [clientUserId, load]);

  return state;
}
