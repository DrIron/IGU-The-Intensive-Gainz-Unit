import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ACTIVITY_TYPE_COLORS, type ActivityType } from "@/types/muscle-builder";

/**
 * SessionTypeBar — the 2px coloured left rail that carries a session's type
 * signal (strength / cardio / hiit / …), replacing a bordered, tinted subcard.
 *
 * Lifted from `muscle-builder/SessionBlock.tsx` (§11.2). It is a *wrapper*, not a
 * standalone bar, because that is how the visual is actually built: the colour
 * lives on the container's `border-left`, so the rail and its content are one box.
 *
 * Presentational only — colour comes from `ACTIVITY_TYPE_COLORS`.
 *
 * `className` is a deliberate escape hatch. Desktop (`SessionBlock`) and mobile
 * (`MobileDayDetail`) had already drifted apart on spacing (`space-y-1` vs
 * `space-y-1.5`) and on the hover group. Forcing them to one value would be a
 * visual CHANGE, which PR1 forbids — so each caller keeps its own spacing while
 * sharing the rail itself. Converging that spacing is a deliberate follow-up, not
 * a silent side effect of an extraction.
 */
interface SessionTypeBarProps {
  activityType: ActivityType;
  /**
   * Slot inherits from a parent week (builder only) — the rail turns amber and
   * the type colour is suppressed.
   */
  isOverridden?: boolean;
  /**
   * Canonical authoring (Phase 2): colour the rail from the session's CONTENTS instead of
   * `activityType`. When set, `contentColorHex` (a hex, or null = neutral) drives the rail. Legacy
   * callers omit this and keep the type-driven colour, byte-identical.
   */
  useContentColor?: boolean;
  contentColorHex?: string | null;
  className?: string;
  children: ReactNode;
}

export function SessionTypeBar({
  activityType,
  isOverridden = false,
  useContentColor = false,
  contentColorHex = null,
  className,
  children,
}: SessionTypeBarProps) {
  const colors = ACTIVITY_TYPE_COLORS[activityType];
  // Content-color mode: hex when derivable, else neutral (no inline colour → border-border).
  const borderColor = isOverridden
    ? undefined
    : useContentColor
      ? contentColorHex ?? undefined
      : colors.colorHex;

  return (
    <div
      className={cn(
        "border-l-2 pl-2",
        isOverridden && "border-l-amber-500",
        useContentColor && contentColorHex == null && "border-l-border",
        className,
      )}
      style={{ borderLeftColor: borderColor }}
    >
      {children}
    </div>
  );
}
