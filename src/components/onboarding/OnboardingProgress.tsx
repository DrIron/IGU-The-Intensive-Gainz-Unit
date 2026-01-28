import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLIENT_ONBOARDING_STEPS, OnboardingStep } from "@/auth/onboarding";

interface OnboardingProgressProps {
  /** Current step ID */
  currentStep: string;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Visual progress indicator for onboarding steps.
 * Shows completed, current, and upcoming steps.
 */
export function OnboardingProgress({ currentStep, className }: OnboardingProgressProps) {
  const currentStepIndex = CLIENT_ONBOARDING_STEPS.findIndex(s => s.id === currentStep);
  
  return (
    <div className={cn("w-full", className)}>
      {/* Mobile: Simple progress bar */}
      <div className="md:hidden">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium">
            Step {currentStepIndex + 1} of {CLIENT_ONBOARDING_STEPS.length}
          </span>
          <span className="text-sm text-muted-foreground">
            {CLIENT_ONBOARDING_STEPS[currentStepIndex]?.label}
          </span>
        </div>
        <div className="h-2 bg-muted rounded-full overflow-hidden">
          <div 
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentStepIndex + 1) / CLIENT_ONBOARDING_STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      {/* Desktop: Step indicators */}
      <div className="hidden md:block">
        <div className="flex items-center justify-between">
          {CLIENT_ONBOARDING_STEPS.map((step, index) => {
            const isCompleted = index < currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const isUpcoming = index > currentStepIndex;
            
            return (
              <div key={step.id} className="flex items-center">
                {/* Step circle */}
                <div className="flex flex-col items-center">
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors",
                      isCompleted && "bg-primary border-primary text-primary-foreground",
                      isCurrent && "border-primary text-primary",
                      isUpcoming && "border-muted text-muted-foreground"
                    )}
                  >
                    {isCompleted ? (
                      <CheckCircle2 className="h-5 w-5" />
                    ) : isCurrent ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Circle className="h-5 w-5" />
                    )}
                  </div>
                  <span
                    className={cn(
                      "mt-2 text-xs font-medium text-center max-w-[80px]",
                      isCurrent && "text-primary",
                      isUpcoming && "text-muted-foreground"
                    )}
                  >
                    {step.label}
                  </span>
                </div>
                
                {/* Connector line */}
                {index < CLIENT_ONBOARDING_STEPS.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 h-0.5 mx-2",
                      index < currentStepIndex ? "bg-primary" : "bg-muted"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
