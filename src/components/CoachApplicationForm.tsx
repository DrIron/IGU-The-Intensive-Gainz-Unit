import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";

const coachApplicationSchema = z.object({
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50, "First name too long").trim(),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50, "Last name too long").trim(),
  email: z.string().email("Invalid email address").max(255, "Email too long").trim().toLowerCase(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.string().min(1, "Gender is required"),
  phoneNumber: z.string().max(20, "Phone number too long").optional(),
  certifications: z.string()
    .min(30, "Please provide detailed certifications (at least 30 characters)")
    .max(2000, "Certifications must be less than 2000 characters")
    .trim(),
  yearsOfExperience: z.coerce.number().min(0, "Years of experience must be 0 or greater").max(50, "Years of experience seems unrealistic"),
  specializations: z.array(z.string())
    .min(1, "Please select at least one specialization")
    .max(15, "Maximum 15 specializations"),
  motivation: z.string()
    .min(100, "Please provide at least 100 characters explaining your motivation")
    .max(2000, "Motivation must be less than 2000 characters")
    .trim(),
  requestedSubroles: z.array(z.string()).default([]),
});

type CoachApplicationFormValues = z.infer<typeof coachApplicationSchema>;

interface CoachApplicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoachApplicationForm({ open, onOpenChange }: CoachApplicationFormProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { tags: specializationTags, loading: tagsLoading } = useSpecializationTags();

  // Fetch subrole definitions for the multi-select
  const { data: subroleDefinitions = [], isLoading: subroleDefsLoading } = useQuery({
    queryKey: ["subrole-definitions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("subrole_definitions")
        .select("id, slug, display_name, description, requires_credentials")
        .eq("is_active", true)
        .order("sort_order");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const form = useForm<CoachApplicationFormValues>({
    resolver: zodResolver(coachApplicationSchema),
    defaultValues: {
      firstName: "",
      lastName: "",
      email: "",
      dateOfBirth: "",
      gender: "",
      phoneNumber: "",
      certifications: "",
      yearsOfExperience: 0,
      specializations: [],
      motivation: "",
      requestedSubroles: [],
    },
  });

  const onSubmit = async (values: CoachApplicationFormValues) => {
    setIsSubmitting(true);
    try {
      // Process certifications array
      const certifications = values.certifications
        .split(",")
        .map(c => c.trim())
        .filter(c => c.length > 0)
        .slice(0, 20); // Max 20 certifications

      if (certifications.length === 0) {
        throw new Error("Please provide at least one certification");
      }

      const { error } = await supabase.from("coach_applications").insert({
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        date_of_birth: values.dateOfBirth,
        gender: values.gender,
        phone_number: values.phoneNumber?.trim() || null,
        certifications,
        years_of_experience: values.yearsOfExperience,
        specializations: values.specializations,
        motivation: values.motivation.trim(),
        requested_subroles: values.requestedSubroles,
      });

      if (error) throw error;

      // Send confirmation email
      await supabase.functions.invoke('send-coach-application-emails', {
        body: {
          applicantEmail: values.email,
          applicantName: `${values.firstName} ${values.lastName}`,
          type: 'received'
        }
      });

      toast.success("Application submitted successfully! Check your email for confirmation.");
      form.reset();
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error submitting application:", error);
      toast.error(error.message || "Failed to submit application. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply to Become a Coach</DialogTitle>
          <DialogDescription>
            Join the IGU team and help clients achieve their fitness goals with evidence-based coaching.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="firstName"
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
                control={form.control}
                name="lastName"
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

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input type="email" placeholder="john.doe@example.com" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="dateOfBirth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Date of Birth</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="gender"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Gender</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="male">Male</SelectItem>
                        <SelectItem value="female">Female</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone (Optional)</FormLabel>
                    <FormControl>
                      <Input type="tel" placeholder="+965 1234 5678" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="yearsOfExperience"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Years of Coaching Experience</FormLabel>
                  <FormControl>
                    <Input type="number" min="0" placeholder="5" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

              <FormField
                control={form.control}
                name="certifications"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Certifications (comma-separated)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="NASM-CPT, Precision Nutrition L1, ISSA Specialist in Strength"
                        className="resize-none"
                        maxLength={2000}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      {field.value.length}/2000 characters (max 20 certifications)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="specializations"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Areas of Specialization</FormLabel>
                    <FormControl>
                      <div className="space-y-3">
                        {tagsLoading ? (
                          <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading specializations...</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {specializationTags.map((tag) => {
                              const isSelected = field.value.includes(tag.value);
                              return (
                                <button
                                  key={tag.id}
                                  type="button"
                                  onClick={() => {
                                    const updated = isSelected
                                      ? field.value.filter((v: string) => v !== tag.value)
                                      : [...field.value, tag.value];
                                    field.onChange(updated);
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                                  )}
                                >
                                  {isSelected && <span>✓</span>}
                                  {tag.label}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-sm text-muted-foreground">
                          {field.value.length}/15 selected
                        </p>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="requestedSubroles"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Requested Practitioner Roles (Optional)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        {subroleDefsLoading ? (
                          <div className="flex items-center gap-2 py-2 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading roles...</span>
                          </div>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {subroleDefinitions.map((def: any) => {
                              const isSelected = field.value.includes(def.slug);
                              return (
                                <button
                                  key={def.id}
                                  type="button"
                                  onClick={() => {
                                    const updated = isSelected
                                      ? field.value.filter((v: string) => v !== def.slug)
                                      : [...field.value, def.slug];
                                    field.onChange(updated);
                                  }}
                                  className={cn(
                                    "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium border transition-colors",
                                    isSelected
                                      ? "bg-primary text-primary-foreground border-primary"
                                      : "bg-muted/50 text-muted-foreground border-border hover:border-primary/50"
                                  )}
                                >
                                  {isSelected && <span>&#10003;</span>}
                                  {def.display_name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Select any specialized roles you'd like to apply for. These require admin approval and may need credential verification.
                        </p>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="motivation"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Why do you want to join IGU?</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Share your motivation for joining our team..."
                        className="resize-none min-h-[100px]"
                        maxLength={2000}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-sm text-muted-foreground">
                      {field.value.length}/2000 characters (minimum 100)
                    </p>
                    <FormMessage />
                  </FormItem>
                )}
              />

            <div className="flex gap-4 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={isSubmitting}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting} className="flex-1">
                {isSubmitting ? "Submitting..." : "Submit Application"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
