import { memo } from "react";

/**
 * Rest day treatment — cross-hatch pattern + sideways "REST" label in
 * Bebas Neue. Distinct from an empty training day at a glance.
 */
export const StudioRestDay = memo(function StudioRestDay() {
  return (
    <div
      className="relative flex-1 flex items-center justify-center min-h-[200px]"
      aria-label="Rest day"
    >
      {/* Hairline cross-hatch */}
      <div
        aria-hidden
        className="absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, white 0 1px, transparent 1px 14px)",
        }}
      />
      {/* Rotated REST label */}
      <span
        aria-hidden
        className="font-display text-[38px] leading-none tracking-[0.25em] text-white/10 [writing-mode:vertical-rl] [transform:rotate(180deg)]"
      >
        REST
      </span>
    </div>
  );
});
