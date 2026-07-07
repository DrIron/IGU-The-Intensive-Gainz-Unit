import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";
import { SpecializationTagPicker } from "@/components/ui/SpecializationTagPicker";

interface GoalsStepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

/**
 * Onboarding "Goals" step (structural redesign Part A) — the focus_areas chip
 * picker. 1:1 only (the step only appears in the 1:1 step array); the coach step
 * sorts by these, so ≥1 is required (validated in OnboardingForm's "goals" case).
 */
export function GoalsStep({ form }: GoalsStepProps) {
  const focusAreas: string[] = form.watch("focus_areas") || [];

  const toggleFocusArea = (value: string) => {
    const current: string[] = form.getValues("focus_areas") || [];
    form.setValue(
      "focus_areas",
      current.includes(value) ? current.filter((v) => v !== value) : [...current, value],
      { shouldValidate: true },
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Your goals</h2>
        <p className="text-muted-foreground">What do you want to focus on? This is how we match you with the right coach.</p>
      </div>

      <FormField
        control={form.control}
        name="focus_areas"
        render={() => (
          <FormItem>
            <FormLabel>Areas of Focus *</FormLabel>
            <FormDescription className="mb-3">
              Select one or more areas you'd like to focus on.
            </FormDescription>
            <SpecializationTagPicker selectedTags={focusAreas} onToggle={toggleFocusArea} maxTags={15} />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
