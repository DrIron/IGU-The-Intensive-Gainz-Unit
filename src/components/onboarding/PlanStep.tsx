import { useEffect, useState, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ClickableCard } from "@/components/ui/clickable-card";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, CheckCircle2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface PlanStepProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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

/**
 * Onboarding "Plan" step (structural redesign Part A) — the plan ClickableCards +
 * "how did you hear about us". Owns plan_name + heard_about_us. Team plans pick
 * their team in the dedicated TeamStep (Part B).
 */
export function PlanStep({ form, serviceId }: PlanStepProps) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [preSelectedService, setPreSelectedService] = useState<Service | null>(null);

  const loadServices = useCallback(async () => {
    try {
      const { data: servicesData, error: servicesError } = await supabase
        .from("services")
        .select("*")
        .eq("is_active", true);
      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      if (serviceId && servicesData) {
        const service = servicesData.find((s) => s.id === serviceId || s.name === serviceId);
        if (service) {
          form.setValue("plan_name", service.name);
          setPreSelectedService(service);
        }
      }
    } catch (error) {
      console.error("Error loading services:", error);
    } finally {
      setLoading(false);
    }
  }, [serviceId, form]);

  useEffect(() => {
    loadServices();
  }, [loadServices]);

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
        <h2 className="text-2xl font-bold mb-2">Choose your plan</h2>
        <p className="text-muted-foreground">Pick the coaching plan that fits you.</p>
      </div>

      {preSelectedService && (
        <div className="bg-primary/10 border border-primary/20 rounded-lg p-4">
          <p className="text-sm font-medium text-primary">
            ✓ You've selected <span className="font-bold">{preSelectedService.name}</span>
          </p>
          <p className="text-xs text-muted-foreground mt-1">You can change your selection below if needed</p>
        </div>
      )}

      <FormField
        control={form.control}
        name="plan_name"
        render={({ field }) => (
          <FormItem>
            <FormLabel>Select Your Coaching Plan *</FormLabel>
            <FormControl>
              <div className="space-y-3">
                {services.map((service) => {
                  const isSelected = field.value === service.name;
                  return (
                    <ClickableCard
                      key={service.id}
                      ariaLabel={`Select ${service.name} plan`}
                      onClick={() => field.onChange(service.name)}
                      className={cn(
                        "relative p-4",
                        isSelected && "border-primary ring-2 ring-primary/20 bg-primary/5",
                      )}
                    >
                      {isSelected && (
                        <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" aria-hidden />
                      )}
                      <div className="font-semibold">{service.name}</div>
                      <div className="text-sm text-muted-foreground mb-2">{service.description}</div>
                      <div className="text-lg font-bold text-primary">
                        {/* 1:1 tiers are level-priced -- the exact price is set once a
                            coach is assigned and confirmed at checkout. */}
                        {service.type !== "team" && (
                          <span className="text-sm font-normal text-muted-foreground mr-1">from</span>
                        )}
                        {service.price_kwd} KWD/month
                      </div>
                    </ClickableCard>
                  );
                })}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

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
