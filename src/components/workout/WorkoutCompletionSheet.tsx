/**
 * WorkoutCompletionSheet — the session-summary moment shown on workout
 * completion before navigating to the calendar (WK7 §2e). Mobile = vaul Drawer +
 * DrawerScrollArea; desktop = Dialog + DialogScrollArea (BUG8: never a Radix
 * ScrollArea in a max-h container). All weights display in the client's unit;
 * volume/PR magnitudes are canonical kg converted via fromCanonicalKg.
 */
import { Trophy, Dumbbell, CheckCircle2, Clock, MessageCircle, Flame, Share2 } from "lucide-react";
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
import { generateWorkoutShareImage } from "@/utils/workoutShareCard";

export type SessionPRType = "heaviest" | "rep_range" | "easier";

export interface SessionPR {
  name: string;
  weightKg: number;
  reps: number;
  type: SessionPRType;
}

const PR_TYPE_LABEL: Record<SessionPRType, string> = {
  heaviest: "Heaviest ever",
  rep_range: "Rep-range record",
  easier: "Got easier",
};

export interface WorkoutSummary {
  volumeKg: number;
  setsCompleted: number;
  setsSkipped: number;
  exerciseCount: number;
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

function buildShareText(summary: WorkoutSummary, unit: WeightUnit, moduleTitle?: string): string {
  const vol = fromCanonicalKg(summary.volumeKg, unit, 0) ?? 0;
  const elapsed = formatElapsed(summary.elapsedSeconds);
  const lines: string[] = [];
  lines.push(`${moduleTitle ?? "Workout"} done 💪`);
  lines.push(
    `${summary.exerciseCount} exercises · ${summary.setsCompleted} sets · ${vol.toLocaleString()} ${unit}${elapsed ? ` · ${elapsed}` : ""}`,
  );
  if (summary.prs.length) {
    lines.push(`🏆 ${summary.prs.length} PR${summary.prs.length > 1 ? "s" : ""}: ${summary.prs.map((p) => p.name).join(", ")}`);
  }
  lines.push("— trained with IGU");
  return lines.join("\n");
}

function SummaryBody({ summary, unit }: { summary: WorkoutSummary; unit: WeightUnit }) {
  const volume = fromCanonicalKg(summary.volumeKg, unit, 0) ?? 0;
  const elapsed = formatElapsed(summary.elapsedSeconds);
  const volDisplay = volume >= 1000 ? `${(volume / 1000).toFixed(1)}k` : `${Math.round(volume)}`;

  return (
    <div className="space-y-4 px-4 pb-2">
      <div className="grid grid-cols-4 gap-2">
        <StatTile icon={<Dumbbell className="w-4 h-4" />} value={`${summary.exerciseCount}`} label="Exercises" />
        <StatTile icon={<CheckCircle2 className="w-4 h-4" />} value={`${summary.setsCompleted}`} label="Sets" />
        <StatTile icon={<Flame className="w-4 h-4" />} value={volDisplay} label={`Vol ${unit}`} />
        <StatTile icon={<Clock className="w-4 h-4" />} value={elapsed ?? "--"} label="Time" />
      </div>

      {summary.setsSkipped > 0 && (
        <p className="text-center text-xs text-muted-foreground">
          {summary.setsSkipped} set{summary.setsSkipped > 1 ? "s" : ""} skipped
        </p>
      )}

      {summary.prs.length > 0 && (
        <div className="rounded-xl border border-status-ontrack/30 bg-status-ontrack/5 p-3">
          <div className="flex items-center gap-2 mb-2 text-status-ontrack">
            <Trophy className="w-4 h-4" />
            <span className="text-sm font-semibold">
              {summary.prs.length} personal record{summary.prs.length > 1 ? "s" : ""} 🎉
            </span>
          </div>
          <ul className="space-y-2">
            {summary.prs.map((pr, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Trophy className="w-3.5 h-3.5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{pr.name}</p>
                  <p className="text-[11px] text-muted-foreground">{PR_TYPE_LABEL[pr.type]}</p>
                </div>
                <span className="shrink-0 font-mono text-sm tabular-nums">
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

  const handleShare = async () => {
    const text = buildShareText(summary, unit, moduleTitle);
    // Preferred: share the branded image card to the OS share sheet (Stories,
    // posts, WhatsApp). Falls back to a PNG download, then to a text share.
    try {
      const blob = await generateWorkoutShareImage(summary, unit, {
        moduleTitle,
        dateLabel: sessionDateLabel,
      });
      if (blob) {
        const file = new File([blob], "igu-workout.png", { type: "image/png" });
        const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
        if (nav.share && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: "IGU workout", text });
          return;
        }
        // No file-share support — download the card so it can be posted manually.
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "igu-workout.png";
        a.click();
        URL.revokeObjectURL(url);
        return;
      }
    } catch {
      /* user dismissed, or image/share failed — fall through to text */
    }
    try {
      if (navigator.share) await navigator.share({ title: "IGU workout", text });
      else if (navigator.clipboard) await navigator.clipboard.writeText(text);
    } catch {
      /* user dismissed — no-op */
    }
  };

  const shareButton = (
    <Button variant="outline" className="mb-2 w-full gap-2" onClick={handleShare}>
      <Share2 className="w-4 h-4" /> Share workout
    </Button>
  );

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

  const title = `${moduleTitle ?? "Workout"} complete 🎉`;
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
            {shareButton}
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
        {shareButton}
        {coachWaButton}
        <Button className="w-full" onClick={onDone}>Done</Button>
      </DialogContent>
    </Dialog>
  );
}
