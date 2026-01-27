import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormDescription } from "@/components/ui/form";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";

interface ParqStepProps {
  form: UseFormReturn<any>;
}

export function ParqStep({ form }: ParqStepProps) {
  const parqFields = [
    {
      name: "parq_heart_condition",
      label: "Has your doctor ever said that you have a heart condition?",
    },
    {
      name: "parq_chest_pain_active",
      label: "Do you feel pain in your chest when you do physical activity?",
    },
    {
      name: "parq_chest_pain_inactive",
      label: "In the past month, have you had chest pain when you were not doing physical activity?",
    },
    {
      name: "parq_balance_dizziness",
      label: "Do you lose your balance because of dizziness or do you ever lose consciousness?",
    },
    {
      name: "parq_bone_joint_problem",
      label: "Do you have a bone or joint problem that could be made worse by physical activity?",
    },
    {
      name: "parq_medication",
      label: "Are you currently taking medication for blood pressure or a heart condition?",
    },
    {
      name: "parq_other_reason",
      label: "Do you know of any other reason why you should not engage in physical activity?",
    },
  ];

  const hasAnyYes = parqFields.some(field => form.watch(field.name) === true);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Physical Activity Readiness Questionnaire (PAR-Q)</h2>
        <p className="text-muted-foreground">
          Please answer the following questions honestly. This helps us ensure your safety during training.
        </p>
      </div>

      {hasAnyYes && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            You've answered "Yes" to one or more questions. Your application will be flagged for medical review before proceeding.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-4">
        {parqFields.map((field) => (
          <FormField
            key={field.name}
            control={form.control}
            name={field.name}
            render={({ field: formField }) => (
              <FormItem className="rounded-md border p-4">
                <FormLabel className="text-sm font-medium mb-3 block">
                  {field.label}
                </FormLabel>
                <FormControl>
                  <RadioGroup
                    onValueChange={(value) => formField.onChange(value === "true")}
                    value={formField.value === true ? "true" : formField.value === false ? "false" : undefined}
                    className="flex gap-4"
                  >
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="false" id={`${field.name}-no`} />
                      <FormLabel htmlFor={`${field.name}-no`} className="font-normal cursor-pointer">
                        No
                      </FormLabel>
                    </div>
                    <div className="flex items-center space-x-2">
                      <RadioGroupItem value="true" id={`${field.name}-yes`} />
                      <FormLabel htmlFor={`${field.name}-yes`} className="font-normal cursor-pointer">
                        Yes
                      </FormLabel>
                    </div>
                  </RadioGroup>
                </FormControl>
              </FormItem>
            )}
          />
        ))}
      </div>

      <FormField
        control={form.control}
        name="parq_injuries_conditions"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Current Injuries or Medical Conditions (Optional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Please describe any current injuries or medical conditions we should be aware of..."
                {...field}
                rows={4}
              />
            </FormControl>
            <FormDescription>
              This information helps us tailor your training program safely.
            </FormDescription>
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="parq_additional_details"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Additional Health Information (Optional)</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Any other health information you'd like to share..."
                {...field}
                rows={3}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}
