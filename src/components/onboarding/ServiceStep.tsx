import { useEffect, useState, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { PersonalDetailsFields } from "@/components/forms/PersonalDetailsFields";
import { CoachPreferenceSection } from "@/components/onboarding/CoachPreferenceSection";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";

interface ServiceStepProps {
  form: UseFormReturn<any>;
  serviceId?: string;
}

interface Service {
  id: string;
  name: string;
  description: string;
  price_kwd: number;
  type: string;
}

const referralSources = [
  { value: "instagram", label: "Instagram" },
  { value: "tiktok", label: "TikTok" },
  { value: "youtube", label: "YouTube" },
  { value: "google", label: "Google Search" },
  { value: "twitter_x", label: "Twitter/X" },
  { value: "friend_referral", label: "Friend/Family Referral" },
  { value: "gym_flyer", label: "Gym/Flyer" },
  { value: "returning_client", label: "Returning Client" },
  { value: "other", label: "Other" },
];

export function ServiceStep({ form, serviceId }: ServiceStepProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [preSelectedService, setPreSelectedService] = useState<Service | null>(null);
  const { tags: focusOptions, loading: tagsLoading } = useSpecializationTags();

  const selectedPlanName = form.watch("plan_name");
  const focusAreas = form.watch("focus_areas") || [];

  const loadServices = useCallback(async () => {
    try {
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('*')
        .eq('is_active', true);

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      // If serviceId is provided, set it as default
      if (serviceId && servicesData) {
        const service = servicesData.find(s => s.id === serviceId || s.name === serviceId);
        if (service) {
          form.setValue('plan_name', service.name);
          setPreSelectedService(service);
        }
      }
    } catch (error) {
      console.error('Error loading services:', error);
    } finally {
      setLoading(false);
    }
  }, [serviceId, form]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

  const isOneToOneService = () => {
    const selectedService = services.find(s => s.name === selectedPlanName);
    return selectedService?.type === 'one_to_one';
  };

  // Derive plan type for coach matching
  const getPlanType = (): 'online' | 'hybrid' | 'in_person' | null => {
    if (selectedPlanName === '1:1 Online') return 'online';
    if (selectedPlanName === '1:1 Hybrid') return 'hybrid';
    if (selectedPlanName === '1:1 In-Person') return 'in_person';
    return null;
  };

  const handleFocusAreaChange = (value: string, checked: boolean) => {
    const currentAreas = form.getValues("focus_areas") || [];
    if (checked) {
      form.setValue("focus_areas", [...currentAreas, value]);
    } else {
      form.setValue("focus_areas", currentAreas.filter((area: string) => area !== value));
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold mb-2">Service Selection & Personal Information</h2>
        <p className="text-muted-foreground">
          Choose your coaching plan and provide your contact information.
        </p>
      </div>

      {preSelectedService && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <p className="text-sm font-medium text-primary">
            ✓ You've selected <span className="font-bold">{preSelectedService.name}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            You can change your selection below if needed
          </p>
        </div>
      )}

      {/* Personal Information */}
      <div className="space-y-4">
        <p className="text-sm font-medium text-muted-foreground">Personal Information</p>
        <PersonalDetailsFields
          control={form.control}
          emailDisabled={true}
          showEmail={true}
          emailValue={form.watch('email')}
          firstNameField="first_name"
          lastNameField="last_name"
          emailField="email"
          phoneField="phone_number"
          countryCodeField="country_code"
          dateOfBirthField="date_of_birth"
          showGender={true}
          genderField="gender"
        />
      </div>

      <FormField
        control={form.control}
        name="discord_username"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Discord Username (Optional)</FormLabel>
            <FormControl>
              <Input placeholder="username#1234" {...field} />
            </FormControl>
            <FormDescription>
              Join our private Discord community for coach check-ins, workout tips, and member support.{" "}
              <a href="https://discord.com/download" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                Download Discord
              </a>
            </FormDescription>
          </FormItem>
        )}
      />

      {/* Service Selection */}
      <FormField
        control={form.control}
        name="plan_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Select Your Coaching Plan *</FormLabel>
            <FormControl>
              <RadioGroup
                onValueChange={field.onChange}
                value={field.value}
                className="space-y-3"
              >
                {services.map((service) => (
                  <Card key={service.id} className="p-4">
                    <label className="flex items-start space-x-3 cursor-pointer">
                      <RadioGroupItem value={service.name} />
                      <div className="flex-1">
                        <div className="font-semibold">{service.name}</div>
                        <div className="text-sm text-muted-foreground mb-2">
                          {service.description}
                        </div>
                        <div className="text-lg font-bold text-primary">
                          {service.price_kwd} KWD/month
                        </div>
                      </div>
                    </label>
                  </Card>
                ))}
              </RadioGroup>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Areas of Focus - Required for 1:1 services */}
      {selectedPlanName && (
        <FormField
          control={form.control}
          name="focus_areas"
          render={() => (
            <FormItem>
              <FormLabel>
                Areas of Focus {isOneToOneService() ? '*' : '(Optional)'}
              </FormLabel>
              <FormDescription className="mb-3">
                Select one or more areas you'd like to focus on. This helps us match you with the best coach for your goals.
              </FormDescription>
              {tagsLoading ? (
                <div className="flex items-center gap-2 py-4 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Loading focus areas...</span>
                </div>
              ) : (
                <div className="space-y-3">
                  {focusOptions.map((option) => (
                    <div key={option.value} className="flex items-center space-x-3">
                      <Checkbox
                        id={`focus-${option.value}`}
                        checked={focusAreas.includes(option.value)}
                        onCheckedChange={(checked) => handleFocusAreaChange(option.value, checked as boolean)}
                      />
                      <label
                        htmlFor={`focus-${option.value}`}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>
              )}
              <FormMessage />
            </FormItem>
          )}
        />
      )}

      {/* Coach Preference - Only for 1:1 services */}
      {isOneToOneService() && getPlanType() && (
        <CoachPreferenceSection 
          form={form} 
          planType={getPlanType()!} 
          focusAreas={focusAreas}
        />
      )}

      {/* Referral Source */}
      <FormField
        control={form.control}
        name="heard_about_us"
        render={({ field }) => (
          <FormItem>
            <FormLabel>How did you hear about us? *</FormLabel>
            <Select onValueChange={field.onChange} value={field.value}>
              <FormControl>
                <SelectTrigger>
                  <SelectValue placeholder="Select an option" />
                </SelectTrigger>
              </FormControl>
              <SelectContent>
                {referralSources.map((source) => (
                  <SelectItem key={source.value} value={source.value}>
                    {source.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name="heard_about_us_other"
        render={({ field }) => (
          <FormItem>
            <FormLabel>If Other, please specify</FormLabel>
            <FormControl>
              <Input placeholder="How did you find us?" {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}
