import { memo, useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error";

export interface StudioSaveStatusProps {
  state: SaveState;
  /** Epoch ms of the last successful save — drives the "2s ago" text */
  lastSavedAt?: number | null;
  /** Error message to show inline when state === 'error' */
  errorMessage?: string | null;
  /** Optional manual save trigger (shown when state === 'dirty' or 'error') */
  onSave?: () => void;
}

/**
 * Ambient save-state strip — lives in the header. Not a button. Not a modal.
 * A pulsing dot + tiny monospace label that tells the coach the plan is safe.
 *
 *   ●  Saved 3s ago           <- success (green dot, fades to white/40)
 *   ●  Saving…                <- in-flight (amber, pulsing)
 *   ●  Unsaved changes  [↑]   <- dirty (white, pushes a Save action)
 *   ●  Error — retry          <- failure (rose, clickable)
 *
 * This replaces the disabled "Save" button that's always ghosted in the
 * old header. Coaches never have to wonder "did that actually save?"
 */
export const StudioSaveStatus = memo(function StudioSaveStatus({
  state,
  lastSavedAt,
  errorMessage,
  onSave,
}: StudioSaveStatusProps) {
  // Tick the "N seconds ago" label without causing other rerenders
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (state !== "saved" || !lastSavedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, [state, lastSavedAt]);

  const dotClass = cn(
    "h-1.5 w-1.5 rounded-full shrink-0",
    state === "saved" && "bg-emerald-400/90",
    state === "saving" && "bg-amber-400 animate-pulse",
    state === "dirty" && "bg-white/80",
    state === "error" && "bg-rose-500 animate-pulse",
    state === "idle" && "bg-white/20",
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
    label = errorMessage ? `Error — ${errorMessage}` : "Save failed";
  } else {
    label = "Idle";
  }

  const isActionable = (state === "dirty" || state === "error") && !!onSave;

  const content = (
    <>
      <span className={dotClass} aria-hidden />
      <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
        {label}
      </span>
      {isActionable && (
        <span
          aria-hidden
          className="font-mono text-[10px] uppercase tracking-[0.18em] text-white hover:text-white"
        >
          ↑
        </span>
      )}
      {/* Invisible node to make `tick` referenced — avoids lint warning and
          forces the component to recompute label on each interval fire. */}
      <span className="sr-only" aria-hidden>
        {tick}
      </span>
    </>
  );

  if (isActionable) {
    return (
      <button
        type="button"
        onClick={onSave}
        className="group flex items-center gap-2 px-2.5 h-7 rounded-full bg-white/[0.05] hover:bg-white/[0.08] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-white/40"
        aria-label={label}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className="flex items-center gap-2 px-2.5 h-7 rounded-full bg-white/[0.03]"
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      {content}
    </div>
  );
});
