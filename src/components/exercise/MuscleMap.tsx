import { cn } from "@/lib/utils";

/**
 * MuscleMap — the reserved anatomy slot for the ExerciseDemoCard.
 *
 * ── Honesty (non-negotiable) ────────────────────────────────────────────────
 * Today there is no anatomy render, so this shows Primary / Secondary muscle CHIPS ONLY inside a
 * framed, portrait-sized slot. It draws NO silhouette / body art / SVG figure — a fabricated body
 * outline would be inventing data we don't have. When a real render lands (`renderUrl`, a portrait
 * still), it fills the slot and the chips sit beneath it. The slot is reserved now so the layout
 * doesn't jump when the render arrives.
 */

function friendly(name: string): string {
  return name.replace(/_/g, " ");
}

interface MuscleMapProps {
  primary?: string | null;
  secondary?: string[] | null;
  /** A portrait anatomy still. Null today → chips fill the slot. Never a drawn silhouette. */
  renderUrl?: string | null;
  className?: string;
}

export function MuscleMap({ primary, secondary, renderUrl = null, className }: MuscleMapProps) {
  const secondaryList = (secondary ?? []).filter(Boolean);

  return (
    <div
      data-muscle-map
      className={cn(
        "flex min-h-[180px] flex-col justify-center gap-3 rounded-xl border border-border bg-muted/30 p-4",
        className,
      )}
    >
      {renderUrl && (
        // A real anatomy still when we have one — never a generated figure.
        <img src={renderUrl} alt="" className="mx-auto max-h-56 object-contain" />
      )}

      <div>
        <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
          Primary
        </p>
        {primary ? (
          <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-1 text-sm font-medium capitalize text-primary">
            {friendly(primary)}
          </span>
        ) : (
          <span className="text-sm text-muted-foreground">Not specified</span>
        )}
      </div>

      {secondaryList.length > 0 && (
        <div>
          <p className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-muted-foreground">
            Secondary
          </p>
          <div className="flex flex-wrap gap-1.5">
            {secondaryList.map((m) => (
              <span
                key={m}
                className="inline-flex items-center rounded-full bg-muted px-2.5 py-1 text-xs font-medium capitalize text-muted-foreground"
              >
                {friendly(m)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
