import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { TeamSelectionSection } from "@/components/onboarding/TeamSelectionSection";

interface TeamStepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  planName: string;
}

/**
 * Onboarding "Team" step (structural redesign Part B) — team plans only.
 * Combines the team-pick cards (moved out of PlanStep) with the program
 * acknowledgments (moved out of ServiceSpecificStep), rendered as agreement
 * rows in the same style as LegalStep. `accepts_lower_body_only` only applies
 * to Bunz of Steel. Validation lives in OnboardingForm's `team` case; the
 * submit payload is unchanged.
 */
export function TeamStep({ form, planName }: TeamStepProps) {
  const isBunz = planName === "Bunz of Steel";

  // Same field names + copy as the old ServiceSpecificStep team branches.
  const acknowledgments = [
    {
      name: "accepts_team_program",
      label:
        "I am aware that I am signing up for a team-based training program with no individual customization",
    },
    {
      name: "understands_no_nutrition",
      label: `I am aware that nutritional guidance and recommendations are not included within the ${
        isBunz ? "Bunz of Steel" : "Team Plan"
      } service`,
    },
    ...(isBunz
      ? [
          {
            name: "accepts_lower_body_only",
            label:
              "I am aware that the Bunz of Steel service is a lower body focused training plan",
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Your team</h2>
        <p className="text-muted-foreground">
          Pick your team, then confirm you understand how the program works.
        </p>
      </div>

      <TeamSelectionSection form={form} />

      <div className="space-y-3">
        <p className="text-sm font-medium">Please confirm *</p>
        {acknowledgments.map((ack) => {
          const isChecked = !!form.watch(ack.name as any);
          return (
            <FormField
              key={ack.name}
              control={form.control}
              name={ack.name}
              render={({ field }) => (
                <FormItem
                  className={cn(
                    "flex items-center justify-between rounded-lg border p-4 transition-all",
                    isChecked
                      ? "border-green-500/50 bg-green-50/50 dark:bg-green-950/20"
                      : "border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <FormControl>
                      <Checkbox
                        checked={!!field.value}
                        onCheckedChange={field.onChange}
                        className={cn(
                          "h-5 w-5",
                          isChecked &&
                            "border-green-600 bg-green-600 data-[state=checked]:bg-green-600",
                        )}
                      />
                    </FormControl>
                    <FormLabel
                      className={cn(
                        "text-sm font-medium cursor-pointer",
                        isChecked && "text-green-700 dark:text-green-400",
                      )}
                    >
                      {ack.label}
                    </FormLabel>
                  </div>
                </FormItem>
              )}
            />
          );
        })}
      </div>
    </div>
  );
}
