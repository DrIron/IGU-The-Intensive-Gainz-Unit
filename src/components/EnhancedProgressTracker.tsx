import { Check, Clock, CreditCard, FileCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface Step {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  completed: boolean;
  current: boolean;
}

interface EnhancedProgressTrackerProps {
  formSubmitted: boolean;
  documentsUploaded: boolean;
  documentsVerified: boolean;
  paymentCompleted: boolean;
  currentStatus: string;
  isTeamPlan?: boolean;
}

export function EnhancedProgressTracker({
  formSubmitted,
  documentsUploaded,
  documentsVerified,
  paymentCompleted,
  currentStatus,
  isTeamPlan = false
}: EnhancedProgressTrackerProps) {
  // Team plans: Signup -> Payment
  // 1:1 plans: Signup -> Documents -> Verification -> Payment
  
  const teamPlanSteps: Step[] = [
    {
      id: 'signup',
      title: 'Signup Complete',
      description: 'Account created successfully',
      icon: Check,
      completed: formSubmitted,
      current: !formSubmitted
    },
    {
      id: 'payment',
      title: 'Payment',
      description: 'Complete payment to activate',
      icon: CreditCard,
      completed: paymentCompleted,
      current: formSubmitted && !paymentCompleted
    }
  ];

  const oneToOneSteps: Step[] = [
    {
      id: 'signup',
      title: 'Signup Complete',
      description: 'Account created successfully',
      icon: Check,
      completed: formSubmitted,
      current: !formSubmitted
    },
    {
      id: 'documents',
      title: 'Documents Upload',
      description: 'Upload required documents',
      icon: FileCheck,
      completed: documentsUploaded && documentsVerified,
      current: formSubmitted && !documentsVerified
    },
    {
      id: 'verification',
      title: 'Verification',
      description: 'Documents under review',
      icon: Clock,
      completed: documentsVerified,
      current: documentsUploaded && !documentsVerified
    },
    {
      id: 'payment',
      title: 'Payment',
      description: 'Complete payment to activate',
      icon: CreditCard,
      completed: paymentCompleted,
      current: documentsVerified && !paymentCompleted
    }
  ];

  const steps = isTeamPlan ? teamPlanSteps : oneToOneSteps;

  return (
    <div className="w-full py-6">
      <div className="flex justify-between items-center relative">
        {/* Progress line */}
        <div className="absolute top-5 left-0 w-full h-0.5 bg-muted">
          <div 
            className="h-full bg-primary transition-all duration-500"
            style={{ 
              width: `${(steps.filter(s => s.completed).length / (steps.length - 1)) * 100}%` 
            }}
          />
        </div>

        {/* Steps */}
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <div key={step.id} className="flex flex-col items-center relative z-10 flex-1">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all bg-background",
                  step.completed
                    ? "border-primary bg-primary text-primary-foreground"
                    : step.current
                    ? "border-primary text-primary animate-pulse"
                    : "border-muted text-muted-foreground"
                )}
              >
                <Icon className="h-5 w-5" />
              </div>
              <div className="mt-2 text-center max-w-[100px]">
                <p className={cn(
                  "text-xs font-medium",
                  step.completed || step.current ? "text-foreground" : "text-muted-foreground"
                )}>
                  {step.title}
                </p>
                <p className="text-xs text-muted-foreground mt-1 hidden sm:block">
                  {step.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
