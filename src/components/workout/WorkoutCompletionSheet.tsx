/**
 * WorkoutCompletionSheet — the session-summary moment shown on workout
 * completion before navigating to the calendar (WK7 §2e). Mobile = vaul Drawer +
 * DrawerScrollArea; desktop = Dialog + DialogScrollArea (BUG8: never a Radix
 * ScrollArea in a max-h container). All weights display in the client's unit;
 * volume/PR magnitudes are canonical kg converted via fromCanonicalKg.
 */
import { Trophy, Dumbbell, CheckCircle2, Clock, SkipForward, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerContent,
  DrawerTitle,
  DrawerDescription,
  DrawerScrollArea,
} from "@/components/ui/drawer";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogScrollArea,
} from "@/components/ui/dialog";
import { useIsMobile } from "@/hooks/use-mobile";
import { fromCanonicalKg, type WeightUnit } from "@/utils/weightUnits";

export interface SessionPR {
  name: string;
  weightKg: number;
  reps: number;
}

export interface WorkoutSummary {
  volumeKg: number;
  setsCompleted: number;
  setsSkipped: number;
  prs: SessionPR[];
  elapsedSeconds: number | null;
}

function formatElapsed(seconds: number | null): string | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return null;
  const mins = Math.round(seconds / 60);
  if (mins < 1) return "<1 min";
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

function buildCoachMessage(summary: WorkoutSummary, unit: WeightUnit, moduleTitle?: string, dateLabel?: string): string {
  const vol = fromCanonicalKg(summary.volumeKg, unit, 0) ?? 0;
  const lines: string[] = [];
  lines.push(`Hi coach -- just finished ${moduleTitle ?? "my session"}${dateLabel ? ` (${dateLabel})` : ""}.`);
  lines.push(`Volume ${vol.toLocaleString()} ${unit} · ${summary.setsCompleted} sets${(() => { const e = formatElapsed(summary.elapsedSeconds); return e ? ` · ${e}` : ""; })()}`);
  if (summary.prs.length) {
    lines.push("New PRs:");
    for (const pr of summary.prs) {
      lines.push(`- ${pr.name}: ${fromCanonicalKg(pr.weightKg, unit, unit === "kg" ? 1 : 0)} ${unit} x ${pr.reps}`);
    }
  }
  lines.push("", ""); // leave room for the client to keep typing
  return lines.join("\n");
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border bg-card p-3 text-center">
      <div className="text-muted-foreground mb-1">{icon}</div>
      <div className="text-lg font-bold tabular-nums leading-none">{value}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{label}</div>
    </div>
  );
}

function SummaryBody({ summary, unit }: { summary: WorkoutSummary; unit: WeightUnit }) {
  const volume = fromCanonicalKg(summary.volumeKg, unit, 0) ?? 0;
  const elapsed = formatElapsed(summary.elapsedSeconds);

  return (
    <div className="space-y-4 px-4 pb-2">
      <div className="grid grid-cols-2 gap-2">
        <StatTile
          icon={<Dumbbell className="w-4 h-4" />}
          value={`${volume.toLocaleString()} ${unit}`}
          label="Total volume"
        />
        <StatTile
          icon={<CheckCircle2 className="w-4 h-4" />}
          value={`${summary.setsCompleted}`}
          label="Sets completed"
        />
        {elapsed && <StatTile icon={<Clock className="w-4 h-4" />} value={elapsed} label="Time" />}
        {summary.setsSkipped > 0 && (
          <StatTile icon={<SkipForward className="w-4 h-4" />} value={`${summary.setsSkipped}`} label="Skipped" />
        )}
      </div>

      {summary.prs.length > 0 && (
        <div className="rounded-xl border border-status-ontrack/30 bg-status-ontrack/5 p-3">
          <div className="flex items-center gap-2 mb-2 text-status-ontrack">
            <Trophy className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {summary.prs.length} personal best{summary.prs.length > 1 ? "s" : ""} this session
            </span>
          </div>
          <ul className="space-y-1.5">
            {summary.prs.map((pr, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <span className="truncate pr-2">{pr.name}</span>
                <span className="font-mono tabular-nums shrink-0">
                  {fromCanonicalKg(pr.weightKg, unit, unit === "kg" ? 1 : 0)} {unit} × {pr.reps}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function WorkoutCompletionSheet({
  open,
  summary,
  unit,
  onDone,
  coachWhatsApp,
  moduleTitle,
  sessionDateLabel,
}: {
  open: boolean;
  summary: WorkoutSummary | null;
  unit: WeightUnit;
  onDone: () => void;
  coachWhatsApp?: string | null;
  moduleTitle?: string;
  sessionDateLabel?: string;
}) {
  const isMobile = useIsMobile();
  if (!summary) return null;

  const coachWaButton = coachWhatsApp ? (
    <a
      href={`https://wa.me/${coachWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(buildCoachMessage(summary, unit, moduleTitle, sessionDateLabel))}`}
      target="_blank"
      rel="noopener noreferrer"
      className="mb-2 block"
    >
      <Button variant="outline" className="w-full gap-2">
        <MessageCircle className="w-4 h-4" /> Message coach about this session
      </Button>
    </a>
  ) : null;

  const title = "Workout complete";
  const description = "Nice work -- here's how this session went.";

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(o) => { if (!o) onDone(); }}>
        <DrawerContent className="max-h-[92dvh] flex flex-col">
          <div className="px-4 pt-3 pb-2 text-center">
            <DrawerTitle>{title}</DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </div>
          <DrawerScrollArea className="flex-1 min-h-0">
            <SummaryBody summary={summary} unit={unit} />
          </DrawerScrollArea>
          <div className="p-4 pb-[max(1rem,env(safe-area-inset-bottom))] border-t">
            {coachWaButton}
            <Button className="w-full" onClick={onDone}>Done</Button>
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDone(); }}>
      <DialogContent className="max-w-md max-h-[85vh] flex flex-col">
        <div className="text-center">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <DialogScrollArea className="flex-1 min-h-0 -mx-6 px-2">
          <SummaryBody summary={summary} unit={unit} />
        </DialogScrollArea>
        {coachWaButton}
        <Button className="w-full" onClick={onDone}>Done</Button>
      </DialogContent>
    </Dialog>
  );
}
