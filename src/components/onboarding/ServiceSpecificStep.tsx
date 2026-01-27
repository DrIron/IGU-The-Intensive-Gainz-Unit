import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

interface ServiceSpecificStepProps {
  form: UseFormReturn<any>;
  selectedService: string;
}

export default function ServiceSpecificStep({ form, selectedService }: ServiceSpecificStepProps) {
  const gymAccessType = form.watch("gym_access_type");
  const preferredGymLocation = form.watch("preferred_gym_location");

  // Fe Squad
  if (selectedService === "Fe Squad") {
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
                  I am aware that nutritional guidance and recommendations are not included within the Fe Squad service
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
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your experience level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="beginner_0_6">Beginner (0-6 months)</SelectItem>
                  <SelectItem value="intermediate_6_24">Intermediate (6-24 months)</SelectItem>
                  <SelectItem value="advanced_24_plus">Advanced (24+ months)</SelectItem>
                </SelectContent>
              </Select>
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
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select training days" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="2">2 days</SelectItem>
                  <SelectItem value="3">3 days</SelectItem>
                  <SelectItem value="4">4 days</SelectItem>
                  <SelectItem value="5+">5+ days</SelectItem>
                </SelectContent>
              </Select>
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
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select facility type" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="commercial_gym">Commercial Gym</SelectItem>
                  <SelectItem value="home_gym_full">Home Gym (Fully Equipped)</SelectItem>
                  <SelectItem value="home_gym_minimal">Home Gym (Minimally Equipped)</SelectItem>
                </SelectContent>
              </Select>
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
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select approach" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="calorie_counting">Calorie Counting Only</SelectItem>
                  <SelectItem value="macros_calories">Macros + Calorie Counting</SelectItem>
                  <SelectItem value="intuitive_eating">Intuitive Eating</SelectItem>
                  <SelectItem value="not_sure">Not sure</SelectItem>
                </SelectContent>
              </Select>
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
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your experience level" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="beginner_0_6">Beginner (0-6 months)</SelectItem>
                  <SelectItem value="intermediate_6_24">Intermediate (6-24 months)</SelectItem>
                  <SelectItem value="advanced_24_plus">Advanced (24+ months)</SelectItem>
                </SelectContent>
              </Select>
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
              <FormLabel>Preferred training time</FormLabel>
              <Select onValueChange={(value) => field.onChange([value])} value={field.value?.[0]}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select preferred time" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="early_morning">Early Morning (5am-7am)</SelectItem>
                  <SelectItem value="late_morning">Late Morning (8am-11am) - WEEKEND ONLY</SelectItem>
                  <SelectItem value="afternoon">Afternoon (12pm-4pm) - WEEKEND ONLY</SelectItem>
                  <SelectItem value="evening">Evening (5pm-8pm)</SelectItem>
                </SelectContent>
              </Select>
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
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select approach" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="calorie_counting">Calorie Counting Only</SelectItem>
                  <SelectItem value="macros_calories">Macros + Calorie Counting</SelectItem>
                  <SelectItem value="intuitive_eating">Intuitive Eating</SelectItem>
                  <SelectItem value="not_sure">Not sure</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>
    );
  }

  return null;
}
