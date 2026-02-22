import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  label: string;
  status: "completed" | "current" | "upcoming";
  description?: string;
}

interface OnboardingStepTrackerProps {
  steps: Step[];
  className?: string;
}

/**
 * Vertical step tracker for pending activation pages.
 * Shows completed, current (spinning), and upcoming steps.
 */
export function OnboardingStepTracker({ steps, className }: OnboardingStepTrackerProps) {
  return (
    <div className={cn("space-y-0", className)}>
      {steps.map((step, index) => {
        const isLast = index === steps.length - 1;

        return (
          <div key={step.id} className="flex gap-3">
            {/* Icon + connector line */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 transition-colors",
                  step.status === "completed" && "bg-primary border-primary text-primary-foreground",
                  step.status === "current" && "border-primary text-primary bg-primary/10",
                  step.status === "upcoming" && "border-muted-foreground/30 text-muted-foreground/50"
                )}
              >
                {step.status === "completed" ? (
                  <CheckCircle2 className="h-4 w-4" />
                ) : step.status === "current" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Circle className="h-4 w-4" />
                )}
              </div>
              {!isLast && (
                <div
                  className={cn(
                    "w-0.5 flex-1 min-h-[24px]",
                    step.status === "completed" ? "bg-primary" : "bg-muted-foreground/20"
                  )}
                />
              )}
            </div>

            {/* Text */}
            <div className={cn("pb-6", isLast && "pb-0")}>
              <p
                className={cn(
                  "text-sm font-medium leading-8",
                  step.status === "completed" && "text-primary",
                  step.status === "current" && "text-foreground",
                  step.status === "upcoming" && "text-muted-foreground"
                )}
              >
                {step.label}
              </p>
              {step.description && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {step.description}
                </p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
