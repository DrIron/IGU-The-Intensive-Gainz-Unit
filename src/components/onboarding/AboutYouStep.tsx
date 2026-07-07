import { UseFormReturn } from "react-hook-form";
import { PersonalDetailsFields } from "@/components/forms/PersonalDetailsFields";

interface AboutYouStepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>;
}

/**
 * Onboarding "About you" step (structural redesign Part A) — personal info +
 * demographics (name, phone, DOB, gender, height). Email is locked/read-only.
 */
export function AboutYouStep({ form }: AboutYouStepProps) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">About you</h2>
        <p className="text-muted-foreground">Your contact details and a few basics for your coach.</p>
      </div>

      <PersonalDetailsFields
        control={form.control}
        emailDisabled={true}
        showEmail={true}
        emailValue={form.watch("email")}
        firstNameField="first_name"
        lastNameField="last_name"
        emailField="email"
        phoneField="phone_number"
        countryCodeField="country_code"
        dateOfBirthField="date_of_birth"
        showGender={true}
        genderField="gender"
        showHeight={true}
        heightCmField="height_cm"
      />
    </div>
  );
}
