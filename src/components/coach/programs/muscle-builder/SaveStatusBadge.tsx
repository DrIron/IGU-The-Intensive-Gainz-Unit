import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface SaveStatusBadgeProps {
  state: SaveState;
  lastSavedAt?: number | null;
  errorMessage?: string | null;
  onSave?: () => void;
}

/**
 * Ambient save-state indicator. Replaces the perpetually-disabled "Save" button.
 *
 * Keeps the current app aesthetic — Tailwind muted tokens, default fonts —
 * but borrows the idea from the Studio redesign: a small coloured dot plus
 * short status text that evolves as the plan is edited and saved. When the
 * plan has unsaved changes the whole pill becomes a button that triggers
 * a manual save (for the rare case where the coach wants to save right now
 * instead of waiting the 2s auto-save debounce).
 *
 *   ●  Saved 3s ago         (emerald dot, steady)
 *   ●  Saving…              (amber dot, pulsing)
 *   ●  Unsaved changes ↑    (primary dot, clickable)
 *   ●  Save failed — retry  (destructive dot, clickable)
 */
export const SaveStatusBadge = memo(function SaveStatusBadge({
  state,
  lastSavedAt,
  errorMessage,
  onSave,
}: SaveStatusBadgeProps) {
  // Tick the "N seconds ago" label independent of other state updates
  const [, setTick] = useState(0);
  useEffect(() => {
    if (state !== "saved" || !lastSavedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, [state, lastSavedAt]);

  const dotClass = cn(
    "h-1.5 w-1.5 rounded-full shrink-0",
    state === "saved" && "bg-emerald-500",
    state === "saving" && "bg-amber-500 animate-pulse",
    state === "dirty" && "bg-primary",
    state === "error" && "bg-destructive animate-pulse",
    state === "idle" && "bg-muted-foreground/40",
  );

  let label: string;
  if (state === "saved") {
    const ago = lastSavedAt ? Math.max(0, Math.round((Date.now() - lastSavedAt) / 1000)) : 0;
    label = ago < 3 ? "Saved" : ago < 60 ? `Saved ${ago}s ago` : `Saved ${Math.round(ago / 60)}m ago`;
  } else if (state === "saving") {
    label = "Saving…";
  } else if (state === "dirty") {
    label = "Unsaved changes";
  } else if (state === "error") {
    label = errorMessage ? `Save failed — ${errorMessage}` : "Save failed";
  } else {
    label = "Up to date";
  }

  const isActionable = (state === "dirty" || state === "error") && !!onSave;

  const inner = (
    <>
      <span className={dotClass} aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
      {isActionable && (
        <span aria-hidden className="text-xs text-foreground font-medium">
          ↑
        </span>
      )}
    </>
  );

  if (isActionable) {
    return (
      <button
        type="button"
        onClick={onSave}
        className="flex items-center gap-2 h-8 px-2.5 rounded-md hover:bg-muted/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        aria-label={label}
        title={label}
      >
        {inner}
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-2 h-8 px-2.5"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {inner}
    </div>
  );
});
