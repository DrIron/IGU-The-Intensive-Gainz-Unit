import { UseFormReturn } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// Matches the DB CHECK on profiles_public.activity_level and the Mifflin-St Jeor
// multipliers consumed by calculateNutritionGoals().
const ACTIVITY_LEVELS = [
  { value: "1.2", label: "Sedentary (desk job, little exercise)" },
  { value: "1.375", label: "Light (1-3x/week)" },
  { value: "1.55", label: "Moderate (3-5x/week)" },
  { value: "1.725", label: "Very active (6-7x/week)" },
  { value: "1.9", label: "Extremely active (2x/day or manual labor)" },
];

interface ActivityLevelFieldProps {
  form: UseFormReturn<any>;
  name?: string;
}

export function ActivityLevelField({ form, name = "activity_level" }: ActivityLevelFieldProps) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>Activity Level</FormLabel>
          <Select onValueChange={field.onChange} value={field.value}>
            <FormControl>
              <SelectTrigger>
                <SelectValue placeholder="Select your typical activity" />
              </SelectTrigger>
            </FormControl>
            <SelectContent>
              {ACTIVITY_LEVELS.map((level) => (
                <SelectItem key={level.value} value={level.value}>
                  {level.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Used by the calorie calculator and your coach to size your macros. Combines training with daily movement -- not just gym days.
          </p>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
