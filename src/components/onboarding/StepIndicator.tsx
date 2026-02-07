import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
  onStepClick?: (stepIndex: number) => void;
}

export function StepIndicator({ currentStep, totalSteps, steps, onStepClick }: StepIndicatorProps) {
  const handleClick = (index: number) => {
    // Only allow clicking completed steps (index < currentStep)
    if (index < currentStep && onStepClick) {
      onStepClick(index);
    }
  };

  return (
    <div className="mb-8">
      {/* Desktop: horizontal layout */}
      <div className="hidden sm:flex items-center justify-between">
        {steps.map((step, index) => {
          const isCompleted = index < currentStep;
          const isClickable = isCompleted && !!onStepClick;

          return (
            <div key={index} className="flex items-center flex-1">
              <div className="flex flex-col items-center flex-1">
                <button
                  type="button"
                  onClick={() => handleClick(index)}
                  disabled={!isClickable}
                  className={cn(
                    "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-colors shrink-0",
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : index === currentStep
                      ? "border-primary text-primary"
                      : "border-muted text-muted-foreground",
                    isClickable && "cursor-pointer hover:ring-2 hover:ring-primary/30"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-5 w-5" />
                  ) : (
                    <span className="text-sm font-medium">{index + 1}</span>
                  )}
                </button>
                <span
                  className={cn(
                    "text-xs mt-2 text-center max-w-[80px] leading-tight",
                    isClickable && "cursor-pointer hover:text-primary"
                  )}
                  onClick={() => handleClick(index)}
                >
                  {step}
                </span>
              </div>
              {index < totalSteps - 1 && (
                <div
                  className={cn(
                    "h-0.5 flex-1 mx-2 transition-colors min-w-[20px]",
                    index < currentStep ? "bg-primary" : "bg-muted"
                  )}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile: 2x2 grid layout */}
      <div className="sm:hidden">
        <div className="grid grid-cols-2 gap-4">
          {steps.map((step, index) => {
            const isCompleted = index < currentStep;
            const isClickable = isCompleted && !!onStepClick;

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleClick(index)}
                disabled={!isClickable}
                className={cn(
                  "flex items-center gap-3 text-left",
                  isClickable && "cursor-pointer"
                )}
              >
                <div
                  className={cn(
                    "w-8 h-8 rounded-full flex items-center justify-center border-2 transition-colors shrink-0",
                    isCompleted
                      ? "bg-primary border-primary text-primary-foreground"
                      : index === currentStep
                      ? "border-primary text-primary"
                      : "border-muted text-muted-foreground",
                    isClickable && "hover:ring-2 hover:ring-primary/30"
                  )}
                >
                  {isCompleted ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <span className="text-xs font-medium">{index + 1}</span>
                  )}
                </div>
                <span
                  className={cn(
                    "text-xs leading-tight",
                    index === currentStep ? "font-medium text-foreground" : "text-muted-foreground",
                    isClickable && "hover:text-primary"
                  )}
                >
                  {step}
                </span>
              </button>
            );
          })}
        </div>
        {/* Progress bar for mobile */}
        <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${((currentStep + 1) / totalSteps) * 100}%` }}
          />
        </div>
      </div>
    </div>
  );
}
