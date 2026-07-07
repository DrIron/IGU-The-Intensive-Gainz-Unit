import type { UseFormReturn } from "react-hook-form";
import { CoachPreferenceSection } from "./CoachPreferenceSection";

const PLAN_NAME_TO_TYPE: Record<string, "online" | "hybrid" | "in_person"> = {
  "1:1 Online": "online",
  "1:1 Hybrid": "hybrid",
  "1:1 In-Person": "in_person",
};

interface ChooseCoachStepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
  planName: string;
}

/**
 * ON2 — the dedicated "Choose your coach" onboarding step (1:1 plans only).
 * Thin wrapper that maps the plan name to CoachPreferenceSection's planType and
 * feeds it the client's focus areas (used to sort coaches best-match-first). All
 * coach fetching / capacity / auto-match logic lives in CoachPreferenceSection.
 */
export function ChooseCoachStep({ form, planName }: ChooseCoachStepProps) {
  const planType = PLAN_NAME_TO_TYPE[planName] ?? "online";
  const focusAreas = (form.watch("focus_areas") as string[] | undefined) ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold">Choose your coach</h2>
        <p className="text-sm text-muted-foreground">
          Pick the coach you'd like to work with, or let us match you.
        </p>
      </div>
      <CoachPreferenceSection form={form} planType={planType} focusAreas={focusAreas} />
    </div>
  );
}
