import { UseFormReturn } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Pencil, UserRound, HeartPulse, FileCheck2 } from "lucide-react";

interface WelcomeBackStepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  isOneToOne: boolean;
  /** Opens a skipped step for review/edit (about | health | legal). */
  onReview: (stepId: string) => void;
}

/**
 * Onboarding "Welcome back" entry (structural redesign Part C — reactivation).
 * Shown to a returning client whose subscription lapsed (cancelled/expired). We
 * keep their demographics, health form, and agreements on file, so the forced
 * path is just plan -> [details + coach for 1:1] -> payment. The on-file items
 * stay editable here (Review), just not forced.
 */
export function WelcomeBackStep({ form, isOneToOne, onReview }: WelcomeBackStepProps) {
  const firstName: string = form.watch("first_name") || "";

  const onFile = [
    {
      id: "about",
      icon: UserRound,
      title: "Your details",
      desc: "Name, contact, and demographics",
    },
    {
      id: "health",
      icon: HeartPulse,
      title: "Health form (PAR-Q)",
      desc: "Update it if anything has changed",
    },
    {
      id: "legal",
      icon: FileCheck2,
      title: "Agreements",
      desc: "Terms, privacy, and disclaimers you accepted",
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">
          Welcome back{firstName ? `, ${firstName}` : ""}!
        </h2>
        <p className="text-muted-foreground">
          Good to see you again. We've kept your details on file, so you only need to confirm
          your plan{isOneToOne ? ", training details, and coach" : ""} to continue to payment.
        </p>
      </div>

      <div className="space-y-3">
        <p className="text-sm font-medium">Already on file</p>
        {onFile.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.id}
              className="flex items-center justify-between gap-3 rounded-lg border p-4"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="shrink-0 rounded-full bg-primary/10 p-2">
                  <Icon className="h-4 w-4 text-primary" aria-hidden />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium">{item.title}</span>
                    <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0" aria-hidden />
                  </div>
                  <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="shrink-0 text-primary hover:text-primary"
                onClick={() => onReview(item.id)}
              >
                <Pencil className="h-4 w-4 sm:mr-1" />
                <span className="hidden sm:inline">Review</span>
              </Button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
