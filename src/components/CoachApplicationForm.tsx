import { useState, useRef, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Turnstile, type TurnstileInstance } from "@marsidev/react-turnstile";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ChevronLeft, ChevronRight, CheckCircle2 } from "lucide-react";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

const TURNSTILE_SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY || "";

const credentialSchema = z.object({
  name: z.string().min(2, "Credential name required"),
  issuer: z.string().min(2, "Issuing body required"),
  year: z.string().optional(),
  expiryYear: z.string().optional(),
});

const coachApplicationSchema = z.object({
  // Step 1: About You
  firstName: z.string().min(2, "First name must be at least 2 characters").max(50).trim(),
  lastName: z.string().min(2, "Last name must be at least 2 characters").max(50).trim(),
  email: z.string().email("Invalid email address").max(255).trim().toLowerCase(),
  dateOfBirth: z.string().min(1, "Date of birth is required"),
  gender: z.string().min(1, "Gender is required"),
  phoneNumber: z.string().max(20).optional(),
  occupation: z.string().max(100).optional(),
  coachingModality: z.enum(["online", "in_person", "hybrid"]).optional(),
  yearsOfExperience: z.coerce.number().min(0).max(50),
  currentClientCount: z.coerce.number().min(0).max(200).default(0),
  maxCapacity: z.coerce.number().min(1).max(200).default(20),

  // Step 2: Credentials & Philosophy
  credentialsJson: z.array(credentialSchema).min(1, "Add at least one credential"),
  specializations: z.array(z.string()).min(1, "Select at least one specialization").max(15),
  requestedSubroles: z.array(z.string()).default([]),
  coachingPhilosophy: z.string().min(50, "At least 50 characters").max(2000).trim(),
  evidenceBasedApproach: z.string().min(50, "At least 50 characters").max(2000).trim(),

  // Legacy field (kept for backward compat, auto-generated from credentialsJson)
  certifications: z.string().default(""),
  motivation: z.string().default(""),
});

type CoachApplicationFormValues = z.infer<typeof coachApplicationSchema>;

interface CoachApplicationFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS = [
  { id: 1, label: "About You" },
  { id: 2, label: "Credentials & Philosophy" },
  { id: 3, label: "Review & Submit" },
];

// Step 1 fields that must be valid before proceeding
const STEP_1_FIELDS: (keyof CoachApplicationFormValues)[] = [
  "firstName", "lastName", "email", "dateOfBirth", "gender", "yearsOfExperience",
];

// Step 2 fields
const STEP_2_FIELDS: (keyof CoachApplicationFormValues)[] = [
  "credentialsJson", "specializations", "coachingPhilosophy", "evidenceBasedApproach",
];

export function CoachApplicationForm({ open, onOpenChange }: CoachApplicationFormProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const turnstileRef = useRef<TurnstileInstance>(null);
  const { tags: specializationTags, loading: tagsLoading } = useSpecializationTags();

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
      occupation: "",
      coachingModality: undefined,
      yearsOfExperience: 0,
      currentClientCount: 0,
      maxCapacity: 20,
      credentialsJson: [{ name: "", issuer: "", year: "", expiryYear: "" }],
      specializations: [],
      requestedSubroles: [],
      coachingPhilosophy: "",
      evidenceBasedApproach: "",
      certifications: "",
      motivation: "",
    },
  });

  const goNext = useCallback(async () => {
    const fieldsToValidate = step === 1 ? STEP_1_FIELDS : STEP_2_FIELDS;
    const valid = await form.trigger(fieldsToValidate as any);
    if (valid) setStep((s) => Math.min(s + 1, 3));
  }, [step, form]);

  const goBack = useCallback(() => {
    setStep((s) => Math.max(s - 1, 1));
  }, []);

  const addCredential = useCallback(() => {
    const current = form.getValues("credentialsJson");
    form.setValue("credentialsJson", [...current, { name: "", issuer: "", year: "", expiryYear: "" }]);
  }, [form]);

  const removeCredential = useCallback((index: number) => {
    const current = form.getValues("credentialsJson");
    if (current.length <= 1) return;
    form.setValue("credentialsJson", current.filter((_, i) => i !== index));
  }, [form]);

  const onSubmit = async (values: CoachApplicationFormValues) => {
    setIsSubmitting(true);
    try {
      // Generate legacy certifications string from structured data
      const certifications = values.credentialsJson
        .map((c) => `${c.name} (${c.issuer})`)
        .filter((c) => c.length > 3);

      // Use philosophy as motivation for backward compat
      const motivation = values.coachingPhilosophy;

      const { error } = await supabase.from("coach_applications").insert({
        first_name: values.firstName.trim(),
        last_name: values.lastName.trim(),
        email: values.email.trim().toLowerCase(),
        date_of_birth: values.dateOfBirth,
        gender: values.gender,
        phone_number: values.phoneNumber?.trim() || null,
        occupation: values.occupation?.trim() || null,
        coaching_modality: values.coachingModality || null,
        current_client_count: values.currentClientCount,
        max_capacity: values.maxCapacity,
        certifications,
        years_of_experience: values.yearsOfExperience,
        specializations: values.specializations,
        motivation,
        requested_subroles: values.requestedSubroles,
        credentials_json: values.credentialsJson,
        coaching_philosophy: values.coachingPhilosophy.trim(),
        evidence_based_approach: values.evidenceBasedApproach.trim(),
      });

      if (error) throw error;

      await supabase.functions.invoke("send-coach-application-emails", {
        body: {
          applicantEmail: values.email,
          applicantName: `${values.firstName} ${values.lastName}`,
          type: "received",
          turnstileToken,
        },
      });

      toast.success("Application submitted! Check your email for confirmation.");
      form.reset();
      setStep(1);
      setTurnstileToken(null);
      turnstileRef.current?.reset();
      onOpenChange(false);
    } catch (error: unknown) {
      console.error("Error submitting application:", error);
      toast.error(sanitizeErrorForUser(error));
    } finally {
      setIsSubmitting(false);
    }
  };

  const watchValues = form.watch();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Apply to Become a Coach</DialogTitle>
          <DialogDescription>
            Step {step} of 3: {STEPS[step - 1].label}
          </DialogDescription>
        </DialogHeader>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-2">
          {STEPS.map((s) => (
            <div key={s.id} className="flex items-center flex-1">
              <div
                className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold border-2 shrink-0",
                  s.id < step && "bg-primary border-primary text-primary-foreground",
                  s.id === step && "border-primary text-primary",
                  s.id > step && "border-muted text-muted-foreground"
                )}
              >
                {s.id < step ? <CheckCircle2 className="h-4 w-4" /> : s.id}
              </div>
              {s.id < 3 && (
                <div className={cn("flex-1 h-0.5 mx-1", s.id < step ? "bg-primary" : "bg-muted")} />
              )}
            </div>
          ))}
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* ── Step 1: About You ── */}
            {step === 1 && (
              <>
                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="firstName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>First Name *</FormLabel>
                      <FormControl><Input placeholder="John" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="lastName" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Last Name *</FormLabel>
                      <FormControl><Input placeholder="Doe" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <FormField control={form.control} name="email" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Email *</FormLabel>
                    <FormControl><Input type="email" placeholder="john@example.com" {...field} /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="dateOfBirth" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Date of Birth *</FormLabel>
                      <FormControl><Input type="date" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="gender" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Gender *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="male">Male</SelectItem>
                          <SelectItem value="female">Female</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="phoneNumber" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone</FormLabel>
                      <FormControl><Input type="tel" placeholder="+965 1234 5678" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <FormField control={form.control} name="occupation" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Occupation</FormLabel>
                      <FormControl><Input placeholder="Personal Trainer" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="coachingModality" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preferred Modality</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="online">Online</SelectItem>
                          <SelectItem value="in_person">In-Person</SelectItem>
                          <SelectItem value="hybrid">Hybrid</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <FormField control={form.control} name="yearsOfExperience" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Years Experience *</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="currentClientCount" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Current Clients</FormLabel>
                      <FormControl><Input type="number" min="0" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                  <FormField control={form.control} name="maxCapacity" render={({ field }) => (
                    <FormItem>
                      <FormLabel>Max Capacity</FormLabel>
                      <FormControl><Input type="number" min="1" {...field} /></FormControl>
                      <FormMessage />
                    </FormItem>
                  )} />
                </div>
              </>
            )}

            {/* ── Step 2: Credentials & Philosophy ── */}
            {step === 2 && (
              <>
                {/* Structured Credentials */}
                <FormField control={form.control} name="credentialsJson" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Credentials & Certifications *</FormLabel>
                    <div className="space-y-3">
                      {field.value.map((cred, index) => (
                        <div key={index} className="grid grid-cols-4 gap-2 p-3 rounded-lg border bg-muted/30">
                          <Input
                            placeholder="Credential Name"
                            value={cred.name}
                            onChange={(e) => {
                              const updated = [...field.value];
                              updated[index] = { ...updated[index], name: e.target.value };
                              field.onChange(updated);
                            }}
                            className="col-span-2"
                          />
                          <Input
                            placeholder="Issuing Body"
                            value={cred.issuer}
                            onChange={(e) => {
                              const updated = [...field.value];
                              updated[index] = { ...updated[index], issuer: e.target.value };
                              field.onChange(updated);
                            }}
                          />
                          <div className="flex items-center gap-1">
                            <Input
                              placeholder="Year"
                              value={cred.year || ""}
                              onChange={(e) => {
                                const updated = [...field.value];
                                updated[index] = { ...updated[index], year: e.target.value };
                                field.onChange(updated);
                              }}
                              className="w-20"
                            />
                            {field.value.length > 1 && (
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeCredential(index)}>
                                ×
                              </Button>
                            )}
                          </div>
                        </div>
                      ))}
                      <Button type="button" variant="outline" size="sm" onClick={addCredential}>
                        + Add Credential
                      </Button>
                    </div>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Specializations */}
                <FormField control={form.control} name="specializations" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Areas of Specialization *</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        {tagsLoading ? (
                          <div className="flex items-center gap-2 py-4 text-muted-foreground">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            <span>Loading...</span>
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
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Requested Subroles */}
                <FormField control={form.control} name="requestedSubroles" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Practitioner Roles (Optional)</FormLabel>
                    <FormControl>
                      <div className="space-y-2">
                        {subroleDefsLoading ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
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
                                  {isSelected && <span>✓</span>}
                                  {def.display_name}
                                </button>
                              );
                            })}
                          </div>
                        )}
                        <p className="text-xs text-muted-foreground">
                          Select roles you'd like to apply for. These require admin approval.
                        </p>
                      </div>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Coaching Philosophy */}
                <FormField control={form.control} name="coachingPhilosophy" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Coaching Philosophy *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe your coaching philosophy and approach to client success..."
                        className="resize-none min-h-[80px]"
                        maxLength={2000}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{field.value.length}/2000</p>
                    <FormMessage />
                  </FormItem>
                )} />

                {/* Evidence-Based Approach */}
                <FormField control={form.control} name="evidenceBasedApproach" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Evidence-Based Approach *</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="How do you incorporate scientific evidence into your coaching practice?"
                        className="resize-none min-h-[80px]"
                        maxLength={2000}
                        {...field}
                      />
                    </FormControl>
                    <p className="text-xs text-muted-foreground">{field.value.length}/2000</p>
                    <FormMessage />
                  </FormItem>
                )} />
              </>
            )}

            {/* ── Step 3: Review & Submit ── */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="font-semibold text-sm">Personal Information</h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">Name:</span> {watchValues.firstName} {watchValues.lastName}</div>
                    <div><span className="text-muted-foreground">Email:</span> {watchValues.email}</div>
                    <div><span className="text-muted-foreground">Experience:</span> {watchValues.yearsOfExperience} years</div>
                    {watchValues.coachingModality && (
                      <div><span className="text-muted-foreground">Modality:</span> {watchValues.coachingModality}</div>
                    )}
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="font-semibold text-sm">Credentials</h3>
                  <div className="space-y-1">
                    {watchValues.credentialsJson?.map((c, i) => (
                      <p key={i} className="text-sm">
                        {c.name} -- {c.issuer} {c.year && `(${c.year})`}
                      </p>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-3">
                  <h3 className="font-semibold text-sm">Specializations</h3>
                  <div className="flex flex-wrap gap-1">
                    {watchValues.specializations?.map((s) => (
                      <Badge key={s} variant="secondary" className="text-xs">{s}</Badge>
                    ))}
                  </div>
                </div>

                <div className="rounded-lg border p-4 space-y-2">
                  <h3 className="font-semibold text-sm">Coaching Philosophy</h3>
                  <p className="text-sm text-muted-foreground">{watchValues.coachingPhilosophy}</p>
                </div>

                {/* Consent */}
                <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 text-sm text-muted-foreground">
                  By submitting, you confirm that the information provided is accurate and you consent to IGU reviewing your application and contacting you regarding the coaching position.
                </div>

                {TURNSTILE_SITE_KEY && (
                  <div className="flex justify-center">
                    <Turnstile
                      ref={turnstileRef}
                      siteKey={TURNSTILE_SITE_KEY}
                      onSuccess={setTurnstileToken}
                      onExpire={() => setTurnstileToken(null)}
                      options={{ theme: "dark", size: "normal" }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Navigation */}
            <div className="flex gap-3 pt-4">
              {step > 1 && (
                <Button type="button" variant="outline" onClick={goBack} disabled={isSubmitting}>
                  <ChevronLeft className="h-4 w-4 mr-1" />
                  Back
                </Button>
              )}
              <div className="flex-1" />
              {step < 3 ? (
                <Button type="button" onClick={goNext}>
                  Next
                  <ChevronRight className="h-4 w-4 ml-1" />
                </Button>
              ) : (
                <Button
                  type="submit"
                  disabled={isSubmitting || (!!TURNSTILE_SITE_KEY && !turnstileToken)}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Submitting...
                    </>
                  ) : (
                    "Submit Application"
                  )}
                </Button>
              )}
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
