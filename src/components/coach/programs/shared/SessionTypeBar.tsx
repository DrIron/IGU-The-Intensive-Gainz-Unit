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
  className?: string;
  children: ReactNode;
}

export function SessionTypeBar({
  activityType,
  isOverridden = false,
  className,
  children,
}: SessionTypeBarProps) {
  const colors = ACTIVITY_TYPE_COLORS[activityType];

  return (
    <div
      className={cn("border-l-2 pl-2", isOverridden && "border-l-amber-500", className)}
      style={{ borderLeftColor: isOverridden ? undefined : colors.colorHex }}
    >
      {children}
    </div>
  );
}
