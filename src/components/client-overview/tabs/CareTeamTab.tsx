import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { CareTeamCard } from "@/components/coach/CareTeamCard";
import { CareTeamMessagesPanel } from "@/components/nutrition/CareTeamMessagesPanel";
import type { ClientOverviewTabProps } from "../types";

interface PrimaryCoach {
  user_id: string;
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
  specializations: string[] | null;
}

/**
 * Care Team tab for the Client Overview shell.
 *
 * Pure composition of existing components:
 *  - `CareTeamCard` (coach/) renders the roster -- primary coach plus every
 *    care_team_assignments row, with add / remove / discharge flows inside.
 *    Shown only to primary coach or admin, matching the legacy
 *    CoachClientDetail gate.
 *  - `CareTeamMessagesPanel` (nutrition/) renders the threaded team chat
 *    with composer, filters, read tracking, mentions. RLS explicitly
 *    excludes the client -- this is staff-to-staff only.
 *
 * Tab-scoped fetches are limited to what the reused components need:
 * subscription.coach_id + next_billing_date (beyond what ClientContext
 * exposes) and a coaches_directory lookup for the primary coach's public
 * profile. The shell remains the single source for identity.
 */
export function CareTeamTab({ context }: ClientOverviewTabProps) {
  const { clientUserId, subscription, viewerRole } = context;
  const { user } = useAuthSession();
  const viewerId = user?.id ?? null;
  const [primaryCoach, setPrimaryCoach] = useState<PrimaryCoach | null>(null);
  const [nextBillingDate, setNextBillingDate] = useState<string | null>(null);
  const [isPrimaryCoach, setIsPrimaryCoach] = useState(false);
  const [loading, setLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async (subscriptionId: string, viewerUserId: string | null) => {
    setLoading(true);

    const { data: sub, error: subErr } = await supabase
      .from("subscriptions")
      .select("coach_id, next_billing_date")
      .eq("id", subscriptionId)
      .maybeSingle();
    if (subErr) console.warn("[CareTeamTab] subscription:", subErr.message);

    const coachId = sub?.coach_id ?? null;
    setNextBillingDate(sub?.next_billing_date ?? null);
    setIsPrimaryCoach(Boolean(viewerUserId && coachId && viewerUserId === coachId));

    if (coachId) {
      const { data: coach, error: coachErr } = await supabase
        .from("coaches_directory")
        .select("user_id, first_name, last_name, profile_picture_url, specializations")
        .eq("user_id", coachId)
        .maybeSingle();
      if (coachErr) console.warn("[CareTeamTab] coaches_directory:", coachErr.message);
      setPrimaryCoach(coach ?? null);
    } else {
      setPrimaryCoach(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    // Key on viewerId too so the effect re-runs once `useAuthSession`
    // resolves -- a mount-time null viewer would otherwise freeze
    // `isPrimaryCoach = false` even when the late-arriving session
    // matches the subscription's coach.
    const key = `${clientUserId}:${subscription?.id ?? "none"}:${viewerId ?? "pending"}`;
    if (hasFetched.current === key) return;
    hasFetched.current = key;

    if (!subscription?.id) {
      setLoading(false);
      return;
    }

    load(subscription.id, viewerId).catch((err) => {
      console.error("[CareTeamTab] unexpected:", err);
      setLoading(false);
    });
  }, [clientUserId, subscription?.id, viewerId, load]);

  if (!subscription) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <div className="flex justify-center">
            <div className="inline-flex items-center justify-center p-3 rounded-full bg-muted">
              <Users className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            </div>
          </div>
          <div className="space-y-1">
            <p className="font-medium">No care team yet</p>
            <p className="text-sm text-muted-foreground max-w-md mx-auto">
              This client has no subscription on record, so there's no care
              team to display. A team is assigned when the client starts a plan.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-hidden="true" />
        </CardContent>
      </Card>
    );
  }

  const isAdmin = viewerRole === "admin";

  return (
    <div className="space-y-6">
      {(isPrimaryCoach || isAdmin) && (
        <CareTeamCard
          clientId={clientUserId}
          subscriptionId={subscription.id}
          primaryCoach={primaryCoach}
          isPrimaryCoach={isPrimaryCoach}
          isAdmin={isAdmin}
          nextBillingDate={nextBillingDate}
        />
      )}

      <CareTeamMessagesPanel clientId={clientUserId} />
    </div>
  );
}
