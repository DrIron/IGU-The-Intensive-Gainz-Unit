// src/components/client-overview/ClientVitalsRail.tsx
//
// Persistent "is this client on track?" rail (redesign B1 --
// docs/COACH_CLIENT_REDESIGN.md "Client vitals rail"). Always visible: a
// sticky right column on xl+, a compact summary pinned above the main content
// below xl. ONE mount, ONE set of fetches -- the two layouts are CSS-gated
// (hidden xl:flex / xl:hidden), so position is driven by flex `order` on the
// parent (see ClientOverviewTabs) rather than mounting twice.
//
// Items: next check-in countdown, weight -> target sparkline, adherence % +
// needs-attention line, last workout (+ a structured slot for B3 PR chips),
// quick actions (Adjust nutrition / Assign program / Message).

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Apple,
  ClipboardPlus,
  MessageSquare,
  Dot,
  CalendarClock,
  Scale,
  CheckCheck,
  Dumbbell,
} from "lucide-react";
import { formatDistanceToNowStrict } from "date-fns";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { useCoachDeloadRequestForClient } from "@/hooks/useCoachDeloadRequests";
import { AssignProgramDialog } from "@/components/coach/programs/AssignProgramDialog";
import { useClientVitals } from "./useClientVitals";
import type { ClientContext } from "./types";

interface ClientVitalsRailProps {
  context: ClientContext;
  /** Positioning + width classes supplied by the shell layout. */
  className?: string;
}

export function ClientVitalsRail({ context, className }: ClientVitalsRailProps) {
  const { clientUserId, subscription, viewerRole, profile } = context;
  const navigate = useNavigate();
  const { user } = useAuthSession();
  const vitals = useClientVitals(clientUserId);
  const { count: unread } = useUnreadMessageCount(clientUserId);
  const { pending: deload } = useCoachDeloadRequestForClient(clientUserId);
  const [showAssign, setShowAssign] = useState(false);

  const canAssign = viewerRole !== "dietitian";
  const clientName = profile.displayName?.trim() || profile.firstName?.trim() || "Client";

  const checkIn = describeCheckIn(vitals.nextCheckInDate, vitals.loading);
  const attention = buildAttention(vitals.pendingAdjustments, unread, Boolean(deload));
  const weightToGo =
    vitals.latestWeightKg != null && vitals.targetWeightKg != null
      ? vitals.latestWeightKg - vitals.targetWeightKg
      : null;

  const goToTab = (tab: string) => navigate(`/coach/clients/${clientUserId}?tab=${tab}`);
  const onAssign = () => {
    if (canAssign && user && subscription) setShowAssign(true);
    else goToTab("workouts");
  };

  const items = {
    checkIn,
    attention,
    weightToGo,
    vitals,
  };

  return (
    <aside
      aria-label="Client vitals"
      className={cn("min-w-0", className)}
    >
      {/* Desktop xl+: full vertical rail. */}
      <div className="hidden xl:flex xl:flex-col gap-3 rounded-xl border border-border bg-card p-4">
        <RailHeader />
        <FullRail items={items} />
        <QuickActions
          canAssign={canAssign}
          onAdjust={() => goToTab("nutrition")}
          onAssign={onAssign}
          onMessage={() => goToTab("messages")}
          layout="stack"
        />
      </div>

      {/* Below xl: compact summary card. */}
      <div className="xl:hidden rounded-xl border border-border bg-card p-3">
        <CompactRail items={items} />
        <QuickActions
          canAssign={canAssign}
          onAdjust={() => goToTab("nutrition")}
          onAssign={onAssign}
          onMessage={() => goToTab("messages")}
          layout="row"
        />
      </div>

      {showAssign && user && subscription && (
        <AssignProgramDialog
          open={showAssign}
          onOpenChange={setShowAssign}
          coachUserId={user.id}
          clientUserId={clientUserId}
          clientName={clientName}
          subscriptionId={subscription.id}
        />
      )}
    </aside>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Shared computed model
// ──────────────────────────────────────────────────────────────────────────────

interface RailItems {
  checkIn: CheckInState;
  attention: AttentionState;
  weightToGo: number | null;
  vitals: ReturnType<typeof useClientVitals>;
}

// ──────────────────────────────────────────────────────────────────────────────
// Desktop full rail
// ──────────────────────────────────────────────────────────────────────────────

function RailHeader() {
  return (
    <p className="text-[10px] uppercase tracking-wide text-muted-foreground">On track?</p>
  );
}

function FullRail({ items }: { items: RailItems }) {
  const { checkIn, attention, weightToGo, vitals } = items;
  return (
    <div className="flex flex-col gap-3">
      <RailRow label="Next check-in" icon="calendar">
        <p className={cn("text-sm font-medium", checkIn.tone)}>{checkIn.label}</p>
      </RailRow>

      <RailRow
        label="Weight → target"
        icon="scale"
        aside={
          weightToGo != null ? (
            <span className="font-mono text-xs text-emerald-600 tabular-nums">
              {formatToGo(weightToGo)}
            </span>
          ) : undefined
        }
      >
        {vitals.latestWeightKg != null ? (
          <>
            <div className="flex items-baseline gap-1.5">
              <span className="font-mono text-base font-medium tabular-nums">
                {vitals.latestWeightKg.toFixed(1)}
              </span>
              {vitals.targetWeightKg != null && (
                <span className="text-xs text-muted-foreground">
                  → {vitals.targetWeightKg.toFixed(1)} kg
                </span>
              )}
            </div>
            <Sparkline series={vitals.weightSeries} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">No weigh-ins yet</p>
        )}
      </RailRow>

      <RailRow
        label="Adherence"
        icon="check"
        aside={
          <span className="font-mono text-base font-medium tabular-nums text-emerald-600">
            {vitals.adherencePct != null ? `${vitals.adherencePct}%` : "—"}
          </span>
        }
      >
        {attention.label ? (
          <p className="flex items-center gap-0.5 text-xs text-amber-600">
            <Dot className="h-4 w-4 shrink-0" aria-hidden="true" />
            {attention.label}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Nothing pending</p>
        )}
      </RailRow>

      <RailRow label="Last workout" icon="dumbbell" last>
        {vitals.lastWorkoutAt ? (
          <p className="text-sm font-medium">{relative(vitals.lastWorkoutAt)}</p>
        ) : (
          <p className="text-xs text-muted-foreground">No completions yet</p>
        )}
        {/* B3: recent PR chips drop in here once the detector is generalised coach-side. */}
      </RailRow>
    </div>
  );
}

function RailRow({
  label,
  icon,
  aside,
  children,
  last,
}: {
  label: string;
  icon: RailIcon;
  aside?: React.ReactNode;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={cn(!last && "border-b border-border pb-3")}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <RailGlyph icon={icon} />
          {label}
        </span>
        {aside}
      </div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Mobile / tablet compact rail
// ──────────────────────────────────────────────────────────────────────────────

function CompactRail({ items }: { items: RailItems }) {
  const { checkIn, attention, weightToGo, vitals } = items;
  return (
    <div className="grid grid-cols-2 gap-3 pb-3">
      <CompactCell label="Check-in" icon="calendar">
        <span className={cn("text-sm font-medium", checkIn.tone)}>{checkIn.label}</span>
      </CompactCell>

      <CompactCell label="Adherence" icon="check">
        <span className="font-mono text-sm font-medium tabular-nums text-emerald-600">
          {vitals.adherencePct != null ? `${vitals.adherencePct}%` : "—"}
          {attention.label && (
            <span className="ml-1 font-sans text-[11px] font-normal text-amber-600">
              · {attention.shortLabel}
            </span>
          )}
        </span>
      </CompactCell>

      <CompactCell label="Weight → target" icon="scale">
        <span className="font-mono text-sm font-medium tabular-nums">
          {vitals.latestWeightKg != null ? vitals.latestWeightKg.toFixed(1) : "—"}
          {vitals.targetWeightKg != null && (
            <span className="font-sans text-[11px] font-normal text-muted-foreground">
              {" "}
              → {vitals.targetWeightKg.toFixed(1)}
            </span>
          )}
          {weightToGo != null && (
            <span className="ml-1 font-sans text-[11px] font-normal text-emerald-600">
              {formatToGo(weightToGo)}
            </span>
          )}
        </span>
      </CompactCell>

      <CompactCell label="Last workout" icon="dumbbell">
        <span className="text-sm font-medium">
          {vitals.lastWorkoutAt ? relative(vitals.lastWorkoutAt) : "—"}
        </span>
      </CompactCell>
    </div>
  );
}

function CompactCell({
  label,
  icon,
  children,
}: {
  label: string;
  icon: RailIcon;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
        <RailGlyph icon={icon} />
        {label}
      </p>
      <div className="mt-0.5 truncate">{children}</div>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Quick actions
// ──────────────────────────────────────────────────────────────────────────────

function QuickActions({
  canAssign,
  onAdjust,
  onAssign,
  onMessage,
  layout,
}: {
  canAssign: boolean;
  onAdjust: () => void;
  onAssign: () => void;
  onMessage: () => void;
  layout: "stack" | "row";
}) {
  return (
    <div
      className={cn(
        "gap-2",
        layout === "stack" ? "flex flex-col pt-1" : "flex flex-row mt-3",
      )}
    >
      <Button
        variant="outline"
        size="sm"
        onClick={onAdjust}
        className={layout === "row" ? "flex-1" : undefined}
      >
        <Apple className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
        {layout === "row" ? "Adjust" : "Adjust nutrition"}
      </Button>
      {canAssign && (
        <Button
          variant="outline"
          size="sm"
          onClick={onAssign}
          className={layout === "row" ? "flex-1" : undefined}
        >
          <ClipboardPlus className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
          {layout === "row" ? "Assign" : "Assign program"}
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        onClick={onMessage}
        className={layout === "row" ? "flex-1" : undefined}
      >
        <MessageSquare className="h-3.5 w-3.5 mr-1.5" aria-hidden="true" />
        Message
      </Button>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Sparkline
// ──────────────────────────────────────────────────────────────────────────────

function Sparkline({ series }: { series: number[] }) {
  if (series.length < 2) return null;
  const W = 160;
  const H = 24;
  const min = Math.min(...series);
  const max = Math.max(...series);
  const span = max - min || 1;
  const step = W / (series.length - 1);
  const points = series
    .map((v, i) => {
      const x = i * step;
      // Invert y so higher weight sits higher on the chart.
      const y = H - 3 - ((v - min) / span) * (H - 6);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      height="22"
      preserveAspectRatio="none"
      className="mt-1.5"
      aria-hidden="true"
    >
      <polyline points={points} fill="none" stroke="#1D9E75" strokeWidth="2" />
    </svg>
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Glyphs
// ──────────────────────────────────────────────────────────────────────────────

type RailIcon = "calendar" | "scale" | "check" | "dumbbell";

function RailGlyph({ icon }: { icon: RailIcon }) {
  const cls = "h-3.5 w-3.5";
  switch (icon) {
    case "calendar":
      return <CalendarClock className={cls} aria-hidden="true" />;
    case "scale":
      return <Scale className={cls} aria-hidden="true" />;
    case "check":
      return <CheckCheck className={cls} aria-hidden="true" />;
    case "dumbbell":
      return <Dumbbell className={cls} aria-hidden="true" />;
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// Derivations
// ──────────────────────────────────────────────────────────────────────────────

interface CheckInState {
  label: string;
  tone: string;
}

function describeCheckIn(nextCheckInDate: string | null, loading: boolean): CheckInState {
  if (loading) return { label: "…", tone: "text-muted-foreground" };
  if (!nextCheckInDate) return { label: "No check-in yet", tone: "text-muted-foreground" };
  const due = new Date(nextCheckInDate).getTime();
  if (Number.isNaN(due)) return { label: "No check-in yet", tone: "text-muted-foreground" };
  const days = Math.round((due - Date.now()) / (24 * 60 * 60 * 1000));
  if (days < 0)
    return {
      label: `Overdue ${Math.abs(days)}d`,
      tone: "text-destructive",
    };
  if (days === 0) return { label: "Due today", tone: "text-amber-600" };
  return {
    label: `Due in ${days}d`,
    tone: days <= 2 ? "text-amber-600" : "text-emerald-600",
  };
}

interface AttentionState {
  /** Full line for the desktop rail. */
  label: string | null;
  /** Terse fragment for the compact cell. */
  shortLabel: string | null;
}

function buildAttention(
  pendingAdjustments: number,
  unread: number,
  hasDeload: boolean,
): AttentionState {
  const parts: string[] = [];
  if (pendingAdjustments > 0) parts.push(`${pendingAdjustments} pending`);
  if (unread > 0) parts.push(`${unread} unread`);
  if (hasDeload) parts.push("deload request");
  if (parts.length === 0) return { label: null, shortLabel: null };
  return { label: parts.join(" · "), shortLabel: parts[0] };
}

function formatToGo(delta: number): string {
  const rounded = Math.abs(delta).toFixed(1);
  if (Math.abs(delta) < 0.05) return "at target";
  return delta > 0 ? `-${rounded}kg` : `+${rounded}kg`;
}

function relative(iso: string): string {
  try {
    return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
  } catch {
    return iso;
  }
}
