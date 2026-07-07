import type { ControllerRenderProps, UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

interface ServiceSpecificStepProps {
  form: UseFormReturn<any>;
  selectedService: string;
}

const EXPERIENCE_OPTS = [
  { value: "beginner_0_6", label: "Beginner (0-6 months)" },
  { value: "intermediate_6_24", label: "Intermediate (6-24 months)" },
  { value: "advanced_24_plus", label: "Advanced (24+ months)" },
];
const DAYS_OPTS = [
  { value: "2", label: "2 days" },
  { value: "3", label: "3 days" },
  { value: "4", label: "4 days" },
  { value: "5+", label: "5+ days" },
];
const GYM_ACCESS_OPTS = [
  { value: "commercial_gym", label: "Commercial Gym" },
  { value: "home_gym_full", label: "Home Gym (Fully Equipped)" },
  { value: "home_gym_minimal", label: "Home Gym (Minimally Equipped)" },
];
const NUTRITION_OPTS = [
  { value: "calorie_counting", label: "Calorie Counting Only" },
  { value: "macros_calories", label: "Macros + Calorie Counting" },
  { value: "intuitive_eating", label: "Intuitive Eating" },
  { value: "not_sure", label: "Not sure" },
];

/**
 * Segmented single-select control replacing the small-option dropdowns. Same field
 * values as the old <Select> — a control swap only. Guards against clicking the
 * active chip to clear the value (keeps a value once set).
 */
function SegmentedField({
  field,
  options,
  ariaLabel,
}: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  field: ControllerRenderProps<any, string>;
  options: { value: string; label: string }[];
  ariaLabel: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      value={field.value || ""}
      onValueChange={(v) => v && field.onChange(v)}
      aria-label={ariaLabel}
      className="flex flex-wrap justify-start gap-2"
    >
      {options.map((o) => (
        <ToggleGroupItem
          key={o.value}
          value={o.value}
          className={cn(
            "rounded-md text-sm",
            "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary",
          )}
        >
          {o.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export default function ServiceSpecificStep({ form, selectedService }: ServiceSpecificStepProps) {
  const gymAccessType = form.watch("gym_access_type");
  const preferredGymLocation = form.watch("preferred_gym_location");

  // Team Plan (formerly Fe Squad)
  if (selectedService === "Team Plan" || selectedService === "Fe Squad") {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Service Details</h3>
        </div>

        <FormField
          control={form.control}
          name="accepts_team_program"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I am aware that I am signing up for a team-based training program with no individual customization
                </FormLabel>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="understands_no_nutrition"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I am aware that nutritional guidance and recommendations are not included within the Team Plan service
                </FormLabel>
              </div>
            </FormItem>
          )}
        />
      </div>
    );
  }

  // Bunz of Steel
  if (selectedService === "Bunz of Steel") {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Service Details</h3>
        </div>

        <FormField
          control={form.control}
          name="accepts_team_program"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I am aware that I am signing up for a team-based training program with no individual customization
                </FormLabel>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="understands_no_nutrition"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I am aware that nutritional guidance and recommendations are not included within the Bunz of Steel service
                </FormLabel>
              </div>
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="accepts_lower_body_only"
          render={({ field }) => (
            <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-md border p-4">
              <FormControl>
                <Checkbox checked={!!field.value} onCheckedChange={field.onChange} />
              </FormControl>
              <div className="space-y-1 leading-none">
                <FormLabel>
                  I am aware that the Bunz of Steel service is a lower body focused training plan
                </FormLabel>
              </div>
            </FormItem>
          )}
        />
      </div>
    );
  }

  // 1:1 Online
  if (selectedService === "1:1 Online") {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Training Details</h3>
        </div>

        <FormField
          control={form.control}
          name="training_experience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Training Experience</FormLabel>
              <FormControl>
                <SegmentedField field={field} options={EXPERIENCE_OPTS} ariaLabel="Training experience" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="training_goals"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Training Goals</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe your fitness goals in detail..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="training_days_per_week"
          render={({ field }) => (
            <FormItem>
              <FormLabel>How many days per week can you commit to training?</FormLabel>
              <FormControl>
                <SegmentedField field={field} options={DAYS_OPTS} ariaLabel="Training days per week" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="gym_access_type"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Available exercise facility</FormLabel>
              <FormControl>
                <SegmentedField field={field} options={GYM_ACCESS_OPTS} ariaLabel="Available exercise facility" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {gymAccessType === "home_gym_minimal" && (
          <FormField
            control={form.control}
            name="home_gym_equipment"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Please describe your available equipment</FormLabel>
                <FormControl>
                  <Textarea
                    placeholder="List the equipment you have available..."
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="nutrition_approach"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred nutritional approach</FormLabel>
              <FormControl>
                <SegmentedField field={field} options={NUTRITION_OPTS} ariaLabel="Preferred nutritional approach" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  }

  // 1:1 In-Person or Hybrid
  if (selectedService === "1:1 In-Person" || selectedService === "1:1 Hybrid") {
    return (
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold mb-4">Training Details</h3>
        </div>

        <FormField
          control={form.control}
          name="training_experience"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Training Experience</FormLabel>
              <FormControl>
                <SegmentedField field={field} options={EXPERIENCE_OPTS} ariaLabel="Training experience" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="training_goals"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Training Goals</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Describe your fitness goals in detail..."
                  className="min-h-[100px]"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="preferred_training_times"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred training times (select all that apply)</FormLabel>
              <div className="space-y-3">
                {[
                  { value: "early_morning", label: "Early Morning (5am-7am)" },
                  { value: "late_morning", label: "Late Morning (8am-11am) - WEEKEND ONLY" },
                  { value: "afternoon", label: "Afternoon (12pm-4pm) - WEEKEND ONLY" },
                  { value: "evening", label: "Evening (5pm-8pm)" },
                ].map((option) => (
                  <div key={option.value} className="flex items-center space-x-3 rounded-md border p-3">
                    <Checkbox
                      checked={(field.value || []).includes(option.value)}
                      onCheckedChange={(checked) => {
                        const current = field.value || [];
                        if (checked) {
                          field.onChange([...current, option.value]);
                        } else {
                          field.onChange(current.filter((v: string) => v !== option.value));
                        }
                      }}
                    />
                    <span className="text-sm">{option.label}</span>
                  </div>
                ))}
              </div>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="preferred_gym_location"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred gym</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select gym" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Oxygen Jabriya">Oxygen Jabriya</SelectItem>
                  <SelectItem value="Oxygen Subah AlSalem">Oxygen Subah AlSalem</SelectItem>
                  <SelectItem value="Spark Shuwaikh">Spark Shuwaikh</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {preferredGymLocation === "other" && (
          <FormField
            control={form.control}
            name="other_gym_location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Please specify gym name and area (subject to availability)</FormLabel>
                <FormControl>
                  <Input placeholder="Enter gym name and area..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        <FormField
          control={form.control}
          name="nutrition_approach"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Preferred nutritional approach</FormLabel>
              <FormControl>
                <SegmentedField field={field} options={NUTRITION_OPTS} ariaLabel="Preferred nutritional approach" />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  }

  return null;
}
