<<<<<<< HEAD
import { UserCircle } from "lucide-react";
import type { ClientOverviewTabProps } from "../types";
import { ComingSoonPanel } from "./_ComingSoon";

export function ProfileInfoTab(_props: ClientOverviewTabProps) {
  return (
    <ComingSoonPanel
      icon={UserCircle}
      title="Profile & Info"
      description="Demographics, goals, subscription status, onboarding submission, and PAR-Q link. Read-only first, coach-editable fields added where RLS already allows."
    />
  );
}
=======
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { formatDistanceToNowStrict } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  User,
  Ruler,
  Scale,
  Percent,
  CreditCard,
  FileText,
  ShieldAlert,
  Loader2,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useClientDemographics } from "@/hooks/useClientDemographics";
import {
  formatServiceType,
  formatSubscriptionStatus,
  getSubscriptionStatusVariant,
  formatSnakeCase,
} from "@/lib/statusUtils";
import { cn } from "@/lib/utils";
import type { ClientOverviewTabProps } from "../types";

interface SubmissionMeta {
  id: string;
  submissionStatus: string | null;
  medicalCleared: boolean | null;
  medicalClearedAt: string | null;
  needsMedicalReview: boolean | null;
  documentsVerified: boolean | null;
  redFlagsCount: number | null;
  notesSummary: string | null;
  createdAt: string | null;
}

/**
 * Profile & Info tab -- read-only surface consolidating the non-clinical
 * client data a coach would otherwise click around to see.
 *
 * Demographics come from `useClientDemographics` (3 SECURITY DEFINER RPCs +
 * latest weight/body-fat). Subscription comes straight from the shell's
 * ClientContext -- no refetch. Submission metadata comes from
 * `form_submissions_safe` (the coach-safe projection of the onboarding
 * form). Training goals / experience / gym access live on the PHI-gated
 * `form_submissions` table, so this tab deliberately stops at a link into
 * `/client-submission/:userId` instead of duplicating that PHI view.
 *
 * Everything is read-only for this phase. Coach-editable fields land in a
 * follow-up; this PR keeps the blast radius tiny.
 */
export function ProfileInfoTab({ context }: ClientOverviewTabProps) {
  const { clientUserId, subscription } = context;
  const demographics = useClientDemographics(clientUserId);
  const [submission, setSubmission] = useState<SubmissionMeta | null>(null);
  const [submissionLoading, setSubmissionLoading] = useState(true);
  const hasFetched = useRef<string | null>(null);

  const loadSubmission = useCallback(async (userId: string) => {
    setSubmissionLoading(true);
    const { data, error } = await supabase
      .from("form_submissions_safe")
      .select(
        "id, submission_status, medical_cleared, medical_cleared_at, needs_medical_review, documents_verified, red_flags_count, notes_summary, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) console.warn("[ProfileInfoTab] submission:", error.message);
    setSubmission(
      data
        ? {
            id: data.id,
            submissionStatus: data.submission_status,
            medicalCleared: data.medical_cleared,
            medicalClearedAt: data.medical_cleared_at,
            needsMedicalReview: data.needs_medical_review,
            documentsVerified: data.documents_verified,
            redFlagsCount: data.red_flags_count,
            notesSummary: data.notes_summary,
            createdAt: data.created_at,
          }
        : null,
    );
    setSubmissionLoading(false);
  }, []);

  useEffect(() => {
    if (hasFetched.current === clientUserId) return;
    hasFetched.current = clientUserId;
    loadSubmission(clientUserId).catch((err) => {
      console.error("[ProfileInfoTab] unexpected:", err);
      setSubmissionLoading(false);
    });
  }, [clientUserId, loadSubmission]);

  return (
    <div className="space-y-6">
      <DemographicsCard demographics={demographics} />
      <SubscriptionCard subscription={subscription} />
      <OnboardingCard
        submission={submission}
        loading={submissionLoading}
        clientUserId={clientUserId}
      />
    </div>
  );
}

function DemographicsCard({
  demographics,
}: {
  demographics: ReturnType<typeof useClientDemographics>;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex">
          <div aria-hidden="true" className="w-1 shrink-0 bg-emerald-500" />
          <div className="flex-1 p-4 md:p-6 space-y-4">
            <CardTitleRow icon={<User className="h-4 w-4" aria-hidden="true" />} label="Demographics" />
            {demographics.isLoading ? (
              <Loader label="Loading demographics" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Stat
                  icon={<User className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Age"
                  value={demographics.age != null ? `${demographics.age}y` : "--"}
                />
                <Stat
                  icon={<User className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Gender"
                  value={
                    demographics.gender === "male"
                      ? "Male"
                      : demographics.gender === "female"
                        ? "Female"
                        : "--"
                  }
                />
                <Stat
                  icon={<Ruler className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Height"
                  value={
                    demographics.heightCm != null ? `${demographics.heightCm} cm` : "--"
                  }
                />
                <Stat
                  icon={<Scale className="h-3.5 w-3.5" aria-hidden="true" />}
                  label="Weight"
                  value={
                    demographics.latestWeightKg != null
                      ? `${demographics.latestWeightKg.toFixed(1)} kg`
                      : "--"
                  }
                  caption={
                    demographics.latestWeightLoggedAt
                      ? relative(demographics.latestWeightLoggedAt)
                      : undefined
                  }
                />
                {demographics.latestBodyFatPercentage != null && (
                  <Stat
                    icon={<Percent className="h-3.5 w-3.5" aria-hidden="true" />}
                    label="Body fat"
                    value={`${demographics.latestBodyFatPercentage.toFixed(1)}%`}
                    caption={
                      demographics.latestBodyFatLoggedAt
                        ? relative(demographics.latestBodyFatLoggedAt)
                        : undefined
                    }
                  />
                )}
                {demographics.activityLevel && (
                  <Stat
                    icon={<User className="h-3.5 w-3.5" aria-hidden="true" />}
                    label="Activity"
                    value={formatSnakeCase(demographics.activityLevel)}
                  />
                )}
              </div>
            )}
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              Read-only. Coaches can't edit demographics here -- clients change
              them from their account settings.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SubscriptionCard({
  subscription,
}: {
  subscription: ClientOverviewTabProps["context"]["subscription"];
}) {
  const rail = subscription ? subscriptionRail(subscription.status) : "bg-muted";
  const variant = subscription
    ? getSubscriptionStatusVariant(subscription.status)
    : "outline";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex">
          <div aria-hidden="true" className={cn("w-1 shrink-0", rail)} />
          <div className="flex-1 p-4 md:p-6 space-y-3">
            <CardTitleRow
              icon={<CreditCard className="h-4 w-4" aria-hidden="true" />}
              label="Subscription"
              action={
                subscription && (
                  <Badge variant={variant}>
                    {formatSubscriptionStatus(subscription.status)}
                  </Badge>
                )
              }
            />
            {subscription ? (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Stat label="Plan" value={subscription.serviceName ?? "--"} />
                <Stat
                  label="Service type"
                  value={formatServiceType(subscription.serviceType)}
                />
                <Stat
                  label="Subscription ID"
                  value={subscription.id.slice(0, 8)}
                  mono
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                No subscription on record. Admin-created shells land here until
                the client starts a plan.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function OnboardingCard({
  submission,
  loading,
  clientUserId,
}: {
  submission: SubmissionMeta | null;
  loading: boolean;
  clientUserId: string;
}) {
  const medicalRail = submission?.needsMedicalReview
    ? "bg-destructive"
    : submission?.medicalCleared
      ? "bg-emerald-500"
      : submission?.medicalCleared == null
        ? "bg-muted"
        : "bg-amber-500";

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex">
          <div aria-hidden="true" className={cn("w-1 shrink-0", medicalRail)} />
          <div className="flex-1 p-4 md:p-6 space-y-4">
            <CardTitleRow
              icon={<FileText className="h-4 w-4" aria-hidden="true" />}
              label="Onboarding submission"
              action={
                submission?.submissionStatus && (
                  <Badge variant="outline">
                    {formatSnakeCase(submission.submissionStatus)}
                  </Badge>
                )
              }
            />
            {loading ? (
              <Loader label="Loading submission" />
            ) : submission ? (
              <>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <MedicalStat
                    needsReview={submission.needsMedicalReview}
                    cleared={submission.medicalCleared}
                    clearedAt={submission.medicalClearedAt}
                  />
                  <BoolStat
                    label="Documents"
                    ok={submission.documentsVerified}
                    okText="Verified"
                    pendingText="Pending"
                  />
                  {submission.redFlagsCount != null && (
                    <Stat
                      label="Red flags"
                      value={String(submission.redFlagsCount)}
                    />
                  )}
                  <Stat
                    label="Submitted"
                    value={
                      submission.createdAt
                        ? relative(submission.createdAt)
                        : "--"
                    }
                  />
                </div>

                {submission.notesSummary && (
                  <div className="rounded-md border bg-muted/30 p-3">
                    <p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
                      Coach notes summary
                    </p>
                    <p className="text-sm whitespace-pre-wrap">
                      {submission.notesSummary}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                No onboarding submission yet.
              </p>
            )}

            <div className="flex flex-wrap gap-2 pt-1">
              <Button asChild variant="outline" size="sm">
                <Link to={`/client-submission/${clientUserId}`}>
                  Open full submission
                  <ArrowRight className="h-3.5 w-3.5 ml-1" aria-hidden="true" />
                </Link>
              </Button>
            </div>
            <p className="font-mono text-[11px] text-muted-foreground tabular-nums">
              Training goals, medical PAR-Q answers, and identity documents
              sit on the PHI-gated submission page above.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function subscriptionRail(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "past_due":
    case "pending":
      return "bg-amber-500";
    case "suspended":
    case "payment_failed":
      return "bg-destructive";
    case "cancelled":
    case "expired":
    case "inactive":
      return "bg-muted";
    default:
      return "bg-muted";
  }
}

function CardTitleRow({
  icon,
  label,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <CardTitle className="text-base md:text-lg flex items-center gap-2">
        <span className="text-muted-foreground">{icon}</span>
        {label}
      </CardTitle>
      {action}
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  caption,
  mono,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  caption?: string;
  mono?: boolean;
}) {
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground flex items-center gap-1">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "text-sm font-medium truncate",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </p>
      {caption && (
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums truncate">
          {caption}
        </p>
      )}
    </div>
  );
}

function BoolStat({
  label,
  ok,
  okText,
  pendingText,
}: {
  label: string;
  ok: boolean | null;
  okText: string;
  pendingText: string;
}) {
  const Icon = ok ? CheckCircle2 : AlertTriangle;
  const tone = ok
    ? "text-emerald-600 dark:text-emerald-400"
    : ok == null
      ? "text-muted-foreground"
      : "text-amber-600 dark:text-amber-400";
  return (
    <div className="space-y-0.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {label}
      </p>
      <p className={cn("text-sm font-medium flex items-center gap-1", tone)}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {ok ? okText : pendingText}
      </p>
    </div>
  );
}

function MedicalStat({
  needsReview,
  cleared,
  clearedAt,
}: {
  needsReview: boolean | null;
  cleared: boolean | null;
  clearedAt: string | null;
}) {
  let tone: string;
  let Icon: typeof CheckCircle2;
  let label: string;
  if (needsReview) {
    tone = "text-destructive";
    Icon = ShieldAlert;
    label = "Review needed";
  } else if (cleared) {
    tone = "text-emerald-600 dark:text-emerald-400";
    Icon = CheckCircle2;
    label = "Cleared";
  } else {
    tone = "text-muted-foreground";
    Icon = AlertTriangle;
    label = "Pending";
  }

  return (
    <div className="space-y-0.5 min-w-0">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
        Medical
      </p>
      <p className={cn("text-sm font-medium flex items-center gap-1", tone)}>
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </p>
      {cleared && clearedAt && (
        <p className="font-mono text-[11px] text-muted-foreground tabular-nums truncate">
          {relative(clearedAt)}
        </p>
      )}
    </div>
  );
}

function Loader({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      {label}
    </div>
  );
}

function relative(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}
>>>>>>> origin/main
