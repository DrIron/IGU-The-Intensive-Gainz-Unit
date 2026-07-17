import { SET_TYPE_CHIP, SET_TYPE_LABEL, type SetType } from "@/lib/setType";
import { cn } from "@/lib/utils";

/**
 * WK5 — the calm per-set type chip, reused by the logger (completed sets) and the "previous
 * workout" history rows. A 'normal' set renders NOTHING (default is implicit, no chip).
 */
export function SetTypeChip({ type, className }: { type: SetType; className?: string }) {
  if (type === "normal") return null;
  return (
    <span
      data-set-type-chip={type}
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        SET_TYPE_CHIP[type],
        className,
      )}
    >
      {SET_TYPE_LABEL[type]}
    </span>
  );
}
