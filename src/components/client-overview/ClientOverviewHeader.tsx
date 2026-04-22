import { Link } from "react-router-dom";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChevronLeft, FileText } from "lucide-react";
import {
  formatServiceType,
  formatSubscriptionStatus,
  getSubscriptionStatusVariant,
  getProfileStatusVariant,
  formatProfileStatus,
} from "@/lib/statusUtils";
import { cn } from "@/lib/utils";
import { useClientDemographics } from "@/hooks/useClientDemographics";
import { formatDistanceToNowStrict } from "date-fns";
import type { ClientContext } from "./types";

interface ClientOverviewHeaderProps {
  context: ClientContext;
}

/**
 * Identity + service + status rail at the top of the Client Overview page.
 *
 * Echoes the Planning Board / Nutrition Phase card vocabulary: a thin colored
 * rail keyed to subscription status, hero name, small monospace micro-line
 * of demographics, and a minimal set of nav chips. Quick actions (assign
 * program, direct calendar, etc.) land in later PRs alongside the Workouts
 * tab -- keeping PR A small.
 */
export function ClientOverviewHeader({ context }: ClientOverviewHeaderProps) {
  const { profile, subscription, clientUserId } = context;
  const demographics = useClientDemographics(clientUserId);

  const composedName = [profile.firstName, profile.lastName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const fallbackName = profile.displayName?.trim() || composedName || "Client";
  const initials = fallbackName
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  const subStatus = subscription?.status ?? null;
  const railColor = railForStatus(subStatus ?? profile.status);
  const subStatusVariant = subscription
    ? getSubscriptionStatusVariant(subscription.status)
    : getProfileStatusVariant(profile.status);
  const subStatusLabel = subscription
    ? formatSubscriptionStatus(subscription.status)
    : formatProfileStatus(profile.status);

  const micro = buildMicroLine(demographics);

  return (
    <div className="space-y-3">
      <Link
        to="/coach/clients"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ChevronLeft className="h-3 w-3" />
        My Clients
      </Link>

      <Card className="overflow-hidden">
        <CardContent className="p-0">
          <div className="flex">
            <div aria-hidden="true" className={cn("w-1 shrink-0", railColor)} />

            <div className="flex-1 p-4 md:p-6">
              <div className="flex flex-col md:flex-row md:items-start gap-4">
                <div className="flex items-start gap-4 flex-1 min-w-0">
                  <Avatar className="h-14 w-14 md:h-16 md:w-16 shrink-0">
                    <AvatarImage
                      src={profile.avatarUrl ?? undefined}
                      alt={fallbackName}
                    />
                    <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                      {initials}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="text-2xl md:text-3xl font-bold truncate">
                        {fallbackName}
                      </h1>
                      <Badge variant={subStatusVariant}>{subStatusLabel}</Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      {subscription?.serviceName && (
                        <span className="inline-flex items-center gap-1">
                          <Badge variant="outline" className="font-normal">
                            {subscription.serviceName}
                          </Badge>
                        </span>
                      )}
                      {subscription?.serviceType && (
                        <span className="font-mono text-[11px] tabular-nums uppercase tracking-wide">
                          {formatServiceType(subscription.serviceType)}
                        </span>
                      )}
                    </div>

                    {micro && (
                      <p className="font-mono text-[11px] text-muted-foreground tabular-nums pt-0.5">
                        {micro}
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 md:shrink-0">
                  <Button variant="outline" size="sm" asChild>
                    <Link to={`/client-submission/${clientUserId}`}>
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      Submission
                    </Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function railForStatus(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-500";
    case "pending":
    case "pending_payment":
    case "pending_coach_approval":
      return "bg-amber-500";
    case "needs_medical_review":
    case "payment_failed":
    case "suspended":
      return "bg-destructive";
    case "cancelled":
    case "inactive":
    case "expired":
      return "bg-muted";
    default:
      return "bg-muted";
  }
}

function buildMicroLine(demographics: ReturnType<typeof useClientDemographics>): string | null {
  if (demographics.isLoading) return null;
  const parts: string[] = [];
  if (demographics.age != null) parts.push(`${demographics.age}y`);
  if (demographics.gender) parts.push(demographics.gender === "male" ? "M" : "F");
  if (demographics.heightCm != null) parts.push(`${demographics.heightCm}cm`);
  if (demographics.latestWeightKg != null) {
    const logged = demographics.latestWeightLoggedAt
      ? ` (${formatDistanceToNowStrict(new Date(demographics.latestWeightLoggedAt), { addSuffix: true })})`
      : "";
    parts.push(`${demographics.latestWeightKg.toFixed(1)}kg${logged}`);
  }
  return parts.length ? parts.join(" | ") : null;
}
