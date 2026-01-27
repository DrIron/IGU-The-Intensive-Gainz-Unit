import { Control, FieldValues, Path } from "react-hook-form";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

const COUNTRY_CODES = [
  { code: "+965", country: "Kuwait" },
  { code: "+966", country: "Saudi Arabia" },
  { code: "+971", country: "UAE" },
  { code: "+973", country: "Bahrain" },
  { code: "+974", country: "Qatar" },
  { code: "+968", country: "Oman" },
  { code: "+962", country: "Jordan" },
  { code: "+961", country: "Lebanon" },
  { code: "+20", country: "Egypt" },
  { code: "+1", country: "USA/Canada" },
  { code: "+44", country: "UK" },
];

interface PersonalDetailsFieldsProps<T extends FieldValues> {
  control: Control<T>;
  emailDisabled?: boolean;
  showEmail?: boolean;
  emailValue?: string;
  firstNameField?: Path<T>;
  lastNameField?: Path<T>;
  emailField?: Path<T>;
  phoneField?: Path<T>;
  countryCodeField?: Path<T>;
  dateOfBirthField?: Path<T>;
  genderField?: Path<T>;
  showGender?: boolean;
}

export function PersonalDetailsFields<T extends FieldValues>({
  control,
  emailDisabled = false,
  showEmail = true,
  emailValue,
  firstNameField = "firstName" as Path<T>,
  lastNameField = "lastName" as Path<T>,
  emailField = "email" as Path<T>,
  phoneField = "phone" as Path<T>,
  countryCodeField = "countryCode" as Path<T>,
  dateOfBirthField = "dateOfBirth" as Path<T>,
  genderField = "gender" as Path<T>,
  showGender = true,
}: PersonalDetailsFieldsProps<T>) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <FormField
          control={control}
          name={firstNameField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>First Name</FormLabel>
              <FormControl>
                <Input placeholder="John" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={lastNameField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Last Name</FormLabel>
              <FormControl>
                <Input placeholder="Doe" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      {showEmail && (
        <FormField
          control={control}
          name={emailField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input
                  type="email"
                  placeholder="john.doe@example.com"
                  disabled={emailDisabled}
                  className={emailDisabled ? "bg-muted" : ""}
                  {...field}
                  value={emailDisabled && emailValue ? emailValue : field.value}
                />
              </FormControl>
              {emailDisabled && (
                <p className="text-xs text-muted-foreground">
                  Email cannot be changed. Contact support if needed.
                </p>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <FormField
          control={control}
          name={countryCodeField}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Country Code</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Select" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {COUNTRY_CODES.map((country) => (
                    <SelectItem key={country.code} value={country.code}>
                      {country.code} ({country.country})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={control}
          name={phoneField}
          render={({ field }) => (
            <FormItem className="md:col-span-2">
              <FormLabel>Phone Number</FormLabel>
              <FormControl>
                <Input
                  type="tel"
                  placeholder="1234 5678"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={control}
        name={dateOfBirthField}
        render={({ field }) => (
          <FormItem>
            <FormLabel>Date of Birth *</FormLabel>
            <FormControl>
              <Input type="date" {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {showGender && (
        <FormField
          control={control}
          name={genderField}
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Gender</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  value={field.value}
                  className="flex flex-row space-x-4"
                >
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="male" id="male" />
                    <Label htmlFor="male" className="font-normal cursor-pointer">Male</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <RadioGroupItem value="female" id="female" />
                    <Label htmlFor="female" className="font-normal cursor-pointer">Female</Label>
                  </div>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      )}
    </div>
  );
}
