// src/components/client-overview/workouts/ClientProgramList.tsx
// Card grid of client_programs for one client. Active programs first, then
// completed / past. Click a card to drill into that program's day layout.

import { memo } from "react";
import { Badge } from "@/components/ui/badge";
import { CardContent } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { CalendarRange, Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { ClientProgramSummary } from "./useClientWorkouts";

interface ClientProgramListProps {
  programs: ClientProgramSummary[];
  onOpen: (program: ClientProgramSummary) => void;
}

export const ClientProgramList = memo(function ClientProgramList({
  programs,
  onOpen,
}: ClientProgramListProps) {
  const active = programs.filter((p) => p.status === "active");
  const past = programs.filter((p) => p.status !== "active");

  return (
    <div className="space-y-5">
      {active.length > 0 && (
        <Section title="Active" count={active.length}>
          <Grid>
            {active.map((p) => (
              <ProgramCard key={p.id} program={p} onOpen={() => onOpen(p)} />
            ))}
          </Grid>
        </Section>
      )}
      {past.length > 0 && (
        <Section title="Past" count={past.length}>
          <Grid>
            {past.map((p) => (
              <ProgramCard key={p.id} program={p} onOpen={() => onOpen(p)} muted />
            ))}
          </Grid>
        </Section>
      )}
    </div>
  );
});

/* ------------------------------------------------------------------ */

function Section({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          {title}
        </h3>
        <span className="text-xs text-muted-foreground/70 font-mono">
          {count}
        </span>
      </div>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {children}
    </div>
  );
}

interface ProgramCardProps {
  program: ClientProgramSummary;
  onOpen: () => void;
  muted?: boolean;
}

const ProgramCard = memo(function ProgramCard({
  program,
  onOpen,
  muted,
}: ProgramCardProps) {
  const completionPct =
    program.totalModules > 0
      ? Math.round((program.completedModules / program.totalModules) * 100)
      : 0;

  return (
    <ClickableCard
      ariaLabel={`Open program ${program.title}`}
      onClick={onOpen}
      className={cn(
        "h-full transition-shadow hover:shadow-md",
        muted && "opacity-80",
      )}
    >
      <CardContent className="p-4 space-y-3">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
              <Dumbbell className="h-3 w-3" aria-hidden="true" />
              {program.macrocycleName ? (
                <span className="inline-flex items-center gap-1 truncate">
                  <CalendarRange className="h-3 w-3" aria-hidden="true" />
                  {program.macrocycleName}
                </span>
              ) : (
                <span>Program</span>
              )}
            </div>
            <p className="font-semibold text-base md:text-lg truncate mt-0.5">
              {program.title}
            </p>
          </div>
          <StatusBadge status={program.status} />
        </div>

        <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono tabular-nums">
          <span>
            {program.completedModules} / {program.totalModules || "--"}
          </span>
          <span>·</span>
          <span>{program.totalDays} days</span>
          <span>·</span>
          <span>Started {formatStart(program.startDate)}</span>
        </div>

        <ProgressBar pct={completionPct} status={program.status} />
      </CardContent>
    </ClickableCard>
  );
});

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const color =
    status !== "active"
      ? "bg-muted-foreground/40"
      : pct >= 80
        ? "bg-emerald-500"
        : pct >= 40
          ? "bg-amber-500"
          : "bg-primary";
  return (
    <div
      className="h-1 w-full rounded-full overflow-hidden bg-muted"
      role="progressbar"
      aria-valuenow={pct}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full transition-all", color)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const variant: "default" | "secondary" | "outline" | "destructive" =
    status === "active"
      ? "default"
      : status === "completed"
        ? "secondary"
        : "outline";
  const label = (() => {
    if (status === "active") return "Active";
    if (status === "completed") return "Completed";
    if (status === "paused") return "Paused";
    if (status === "cancelled") return "Cancelled";
    return status;
  })();
  return (
    <Badge variant={variant} className="text-[10px] uppercase tracking-wide shrink-0">
      {label}
    </Badge>
  );
}

function formatStart(iso: string): string {
  try {
    return format(new Date(iso), "MMM d");
  } catch {
    return iso;
  }
}
