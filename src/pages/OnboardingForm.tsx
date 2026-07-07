import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { ParqStep } from "@/components/onboarding/ParqStep";
import { LegalStep } from "@/components/onboarding/LegalStep";
import { ServiceStep } from "@/components/onboarding/ServiceStep";
import ServiceSpecificStep from "@/components/onboarding/ServiceSpecificStep";
import { ChooseCoachStep } from "@/components/onboarding/ChooseCoachStep";
import { Dumbbell, Loader2, Save, CheckCircle2, LogOut } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorFallback } from "@/components/ui/error-fallback";
import { getOnboardingRedirect, ClientStatus } from "@/auth/onboarding";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

const formSchema = z.object({
  // PAR-Q
  parq_heart_condition: z.boolean().default(false),
  parq_chest_pain_active: z.boolean().default(false),
  parq_chest_pain_inactive: z.boolean().default(false),
  parq_balance_dizziness: z.boolean().default(false),
  parq_bone_joint_problem: z.boolean().default(false),
  parq_medication: z.boolean().default(false),
  parq_other_reason: z.boolean().default(false),
  parq_injuries_conditions: z.string().optional(),
  parq_additional_details: z.string().optional(),
  
  // Training (only required for 1:1 plans)
  training_experience: z.string().optional(),
  training_goals: z.string().optional(),
  training_days_per_week: z.string().optional(),
  preferred_training_times: z.array(z.string()).optional(),
  gym_access_type: z.string().optional(),
  preferred_gym_location: z.string().optional(),
  home_gym_equipment: z.string().optional(),
  other_gym_location: z.string().optional(),
  nutrition_approach: z.string().optional(),
  accepts_team_program: z.boolean().optional(),
  understands_no_nutrition: z.boolean().optional(),
  accepts_lower_body_only: z.boolean().optional(),
  
  // Legal
  agreed_terms: z.boolean().refine(val => val === true, "Required"),
  agreed_privacy: z.boolean().refine(val => val === true, "Required"),
  agreed_refund_policy: z.boolean().refine(val => val === true, "Required"),
  agreed_intellectual_property: z.boolean().refine(val => val === true, "Required"),
  agreed_medical_disclaimer: z.boolean().refine(val => val === true, "Required"),
  
  // Documents (optional - can be uploaded later on dashboard)
  master_agreement_url: z.string().optional(),
  liability_release_url: z.string().optional(),
  
  // Service & Personal Info
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone_number: z.string().min(1, "Phone number is required"),
  country_code: z.string().min(1, "Country code is required"),
  date_of_birth: z.string().min(1, "Date of birth is required"),
  gender: z.enum(["male", "female"]).optional(),
  height_cm: z
    .number({ invalid_type_error: "Enter height in cm" })
    .int("Height must be a whole number")
    .min(100, "Height must be at least 100 cm")
    .max(250, "Height must be at most 250 cm")
    .optional(),
  discord_username: z.string().optional(),
  plan_name: z.string().min(1, "Please select a plan"),
  focus_areas: z.array(z.string()).optional(),
  heard_about_us: z.string().min(1, "Please tell us how you heard about us"),
  heard_about_us_other: z.string().optional(),
  
  // Coach Preference (1:1 plans only)
  coach_preference_type: z.enum(["auto", "specific"]).default("auto"),
  requested_coach_id: z.string().nullable().optional(),
});

// PAR-Q answers are medical PHI. form_submissions encrypts them at rest via
// encrypt_phi_trigger; onboarding_drafts has no encryption, so these fields are
// never persisted to a draft -- users re-enter the Health step on resume.
const PARQ_FIELDS = [
  'parq_heart_condition',
  'parq_chest_pain_active',
  'parq_chest_pain_inactive',
  'parq_balance_dizziness',
  'parq_bone_joint_problem',
  'parq_medication',
  'parq_other_reason',
  'parq_injuries_conditions',
  'parq_additional_details',
] as const;

export default function OnboardingForm() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [currentStep, setCurrentStep] = useState(0);
  const [userId, setUserId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [selectedServiceName, setSelectedServiceName] = useState<string>("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [autoSaving, setAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [fatalError, setFatalError] = useState(false);
  // "You're in" finish screen (recap) shown on submit success, before payment.
  const [finished, setFinished] = useState<{
    redirectUrl: string;
    planName: string;
    coachLine: string | null;
    focusCount: number;
  } | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout>();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      parq_heart_condition: false,
      parq_chest_pain_active: false,
      parq_chest_pain_inactive: false,
      parq_balance_dizziness: false,
      parq_bone_joint_problem: false,
      parq_medication: false,
      parq_other_reason: false,
      preferred_training_times: [],
      training_experience: "",
      training_goals: "",
      agreed_terms: false,
      agreed_privacy: false,
      agreed_refund_policy: false,
      agreed_intellectual_property: false,
      agreed_medical_disclaimer: false,
      accepts_team_program: false,
      understands_no_nutrition: false,
      accepts_lower_body_only: false,
      country_code: "+965",
      date_of_birth: "",
      focus_areas: [],
      coach_preference_type: "auto",
      requested_coach_id: null,
    },
  });

  const selectedPlanName = form.watch("plan_name");
  
  // Watch legal checkbox values for button disable state
  const agreedTerms = form.watch("agreed_terms");
  const agreedPrivacy = form.watch("agreed_privacy");
  const agreedRefund = form.watch("agreed_refund_policy");
  const agreedIP = form.watch("agreed_intellectual_property");
  const agreedMedical = form.watch("agreed_medical_disclaimer");
  const allLegalAccepted = agreedTerms && agreedPrivacy && agreedRefund && agreedIP && agreedMedical;
  
  // ON2 — steps are plan-derived and driven by a stable step `id`, not an index.
  // 1:1 plans get a "Choose Coach" step between Service Details and Health; team
  // plans keep the 4-step flow. Everything downstream keys off the id.
  const isOneToOne = ["1:1 Online", "1:1 Hybrid", "1:1 In-Person"].includes(selectedPlanName);
  const steps = useMemo(
    () => [
      { id: "service", label: "Service" },
      { id: "details", label: "Service Details" },
      ...(isOneToOne ? [{ id: "coach", label: "Choose Coach" }] : []),
      { id: "health", label: "Health" },
      { id: "legal", label: "Legal" },
    ],
    [isOneToOne],
  );
  const stepId = steps[currentStep]?.id;

  // If the array shrinks (1:1 → team while on/after the coach step), clamp the
  // index so it never points past the end.
  useEffect(() => {
    setCurrentStep((s) => Math.min(s, steps.length - 1));
  }, [steps.length]);

  const loadServiceName = useCallback(async () => {
    try {
      const serviceId = searchParams.get('service');
      if (import.meta.env.DEV) console.log('Service ID from URL:', serviceId);
      if (!serviceId) return;

      // First, try to resolve by ID
      const { data, error } = await supabase
        .from('services')
        .select('name')
        .eq('id', serviceId)
        .maybeSingle();

      if (import.meta.env.DEV) console.log('Service by ID:', data, 'Error:', error);

      if (data?.name) {
        setSelectedServiceName(data.name);
        form.setValue('plan_name', data.name);
        return;
      }

      // Fallback: if the param is actually a name/slug, try by name
      const { data: byName, error: byNameError } = await supabase
        .from('services')
        .select('name')
        .eq('name', serviceId)
        .maybeSingle();

      if (import.meta.env.DEV) console.log('Service by name:', byName, 'Error:', byNameError);
      if (byName?.name) {
        setSelectedServiceName(byName.name);
        form.setValue('plan_name', byName.name);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading service:', error);
    }
  }, [searchParams, form]);

  const checkAuth = useCallback(async () => {
    try {
      // getUser() can hang if the auth session isn't initialized yet.
      // Race against an 8s timeout, retry once, then surface a fatal error.
      let user = null;
      try {
        const result = await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Auth timeout')), 8000)),
        ]);
        user = result.data?.user ?? null;
      } catch {
        if (import.meta.env.DEV) console.warn('Auth getUser timed out, retrying after delay...');
      }

      if (!user) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        const retry = await Promise.race([
          supabase.auth.getUser(),
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Auth timeout retry')), 8000)),
        ]).catch(() => null);
        user = retry?.data?.user ?? null;
      }

      if (!user) {
        setFatalError(true);
        setLoading(false);
        return;
      }
      setUserId(user.id);

      // Check user roles - admins and coaches cannot sign up for services
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      if (roles && roles.length > 0) {
        const userRoles = roles.map(r => r.role);
        if (userRoles.includes('admin') || userRoles.includes('coach')) {
          toast({
            title: "Access Denied",
            description: "Admins and coaches cannot sign up for services.",
            variant: "destructive",
          });
          navigate("/dashboard");
          return;
        }
      }

      // Check for active subscriptions - users with active subscriptions cannot sign up for another.
      // Separate queries (nested FK joins on subscriptions are banned).
      const { data: activeSubscriptions } = await supabase
        .from('subscriptions')
        .select('id, status, service_id')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (activeSubscriptions && activeSubscriptions.length > 0) {
        let activeServiceName = 'an active subscription';
        const { data: activeService } = await supabase
          .from('services')
          .select('name')
          .eq('id', activeSubscriptions[0].service_id)
          .maybeSingle();
        if (activeService?.name) {
          activeServiceName = activeService.name;
        }
        toast({
          title: "Active Subscription Found",
          description: `You already have an active subscription (${activeServiceName}). Please cancel your current subscription before signing up for another service.`,
          variant: "destructive",
        });
        navigate("/dashboard");
        return;
      }

      // Check if user already has a submitted form
      const { data: existingSubmission } = await supabase
        .from('form_submissions')
        .select('id, submission_status')
        .eq('user_id', user.id)
        .maybeSingle();

      if (existingSubmission && existingSubmission.submission_status === 'submitted') {
        setHasSubmitted(true);
        toast({
          title: "Form Already Submitted",
          description: "You've already submitted your onboarding form. Redirecting to dashboard...",
        });
        setTimeout(() => navigate("/dashboard"), 2000);
        return;
      }

      // Fetch and prefill user data - split query for public/private (own user has RLS access)
      const [{ data: profilePublic }, { data: profilePrivate }] = await Promise.all([
        supabase.from('profiles_public').select('first_name').eq('id', user.id).maybeSingle(),
        supabase.from('profiles_private').select('email, phone, full_name, last_name').eq('profile_id', user.id).maybeSingle()
      ]);
      const profile = profilePublic && profilePrivate ? {
        email: profilePrivate.email,
        phone: profilePrivate.phone,
        full_name: profilePrivate.full_name,
        first_name: profilePublic.first_name,
        last_name: profilePrivate.last_name,
      } : null;

      // First try to get from user metadata (set during signup)
      const firstName = user.user_metadata?.first_name || profile?.first_name;
      const lastName = user.user_metadata?.last_name || profile?.last_name;

      if (profile) {
        // Prefill email (always from profile)
        form.setValue('email', profile.email);

        // Prefill phone if available
        if (profile.phone) form.setValue('phone_number', profile.phone);

        // Prefill name from user metadata first, then profile fields
        if (firstName) {
          form.setValue('first_name', firstName);
        } else if (profile.full_name) {
          const [first] = profile.full_name.split(' ');
          form.setValue('first_name', first || '');
        }

        if (lastName) {
          form.setValue('last_name', lastName);
        } else if (profile.full_name) {
          const [, ...lastNameParts] = profile.full_name.split(' ');
          form.setValue('last_name', lastNameParts.join(' ') || '');
        }
      }

      // Also get from auth user metadata as backup
      if (user.user_metadata?.full_name && !profile?.first_name) {
        const [firstName, ...lastNameParts] = user.user_metadata.full_name.split(' ');
        if (!form.getValues('first_name')) form.setValue('first_name', firstName || '');
        if (!form.getValues('last_name')) form.setValue('last_name', lastNameParts.join(' ') || '');
      }

      setLoading(false);
    } catch (err) {
      if (import.meta.env.DEV) console.error("Error during auth check:", err);
      setFatalError(true);
      setLoading(false);
    }
  }, [navigate, toast, form]);

  const loadDraft = useCallback(async () => {
    if (!userId) return;

    try {
      const { data: draft, error } = await supabase
        .from('onboarding_drafts')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;

      if (draft && draft.form_data) {
        // Restore form data. Skip any parq_* keys -- old drafts (pre PHI-strip)
        // may still carry plaintext PAR-Q; never restore medical answers.
        Object.keys(draft.form_data).forEach((key) => {
          if (key.startsWith('parq_')) return;
          form.setValue(key as any, draft.form_data[key]);
        });

        // Restore current step
        if (draft.current_step) {
          setCurrentStep(draft.current_step);
        }

        setLastSaved(new Date(draft.updated_at));

        toast({
          title: "Draft Restored",
          description: "Your previous progress has been loaded.",
        });
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error loading draft:', error);
    }
  }, [userId, form, toast]);

  const saveDraft = useCallback(async () => {
    if (!userId || hasSubmitted || submitting) return;

    setAutoSaving(true);
    try {
      // PHI excluded from drafts -- form_submissions encrypts PAR-Q at rest via
      // trigger; drafts have no encryption, so we skip persisting medical
      // answers. Users re-enter the Health step on resume.
      const formData = form.getValues();
      const persistedData = Object.fromEntries(
        Object.entries(formData).filter(([key]) => !PARQ_FIELDS.includes(key as any))
      );

      const { error } = await supabase
        .from('onboarding_drafts')
        .upsert({
          user_id: userId,
          form_data: persistedData,
          current_step: currentStep,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      setLastSaved(new Date());
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error saving draft:', error);
    } finally {
      setAutoSaving(false);
    }
  }, [userId, currentStep, hasSubmitted, submitting, form]);

  const hasInitialized = useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    hasInitialized.current = true;
    checkAuth();
    loadServiceName();
  }, [checkAuth, loadServiceName]);

  // Guard set only once userId resolves, so the draft still loads after
  // checkAuth populates it -- but never re-runs on form/toast identity churn.
  const hasLoadedDraft = useRef(false);
  useEffect(() => {
    if (hasLoadedDraft.current) return;
    if (!userId) return;
    hasLoadedDraft.current = true;
    loadDraft();
  }, [userId, loadDraft]);

  // Auto-save form data when it changes (debounced)
  useEffect(() => {
    if (!userId) return;

    const subscription = form.watch(() => {
      // Clear existing timeout
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }

      // Set new timeout to save after 2 seconds of inactivity
      saveTimeoutRef.current = setTimeout(() => {
        saveDraft();
      }, 2000);
    });

    return () => {
      subscription.unsubscribe();
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [userId, form, saveDraft]);

  useEffect(() => {
    const subscription = form.watch((value) => {
      if (value.plan_name) {
        setSelectedServiceName(value.plan_name);
      }
    });
    return () => subscription.unsubscribe();
  }, [form]);

  const deleteDraft = async () => {
    if (!userId) return;

    try {
      const { error } = await supabase
        .from('onboarding_drafts')
        .delete()
        .eq('user_id', userId);
      if (error) throw error;
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Error deleting draft:', error);
    }
  };

  const validateStep = async (step: number): Promise<boolean> => {
    let fieldsToValidate: string[] = [];
    const serviceName = form.getValues("plan_name");

    switch (steps[step]?.id) {
      case "service": {
        fieldsToValidate = ["first_name", "last_name", "email", "phone_number", "plan_name", "heard_about_us"];
        // Focus areas are required for 1:1 services — the coach step sorts by them.
        // (Coach-selection validation lives on the "coach" step now, not here.)
        const currentPlan = form.getValues("plan_name");
        const isOneToOnePlan = currentPlan === "1:1 Online" || currentPlan === "1:1 In-Person" || currentPlan === "1:1 Hybrid";
        if (isOneToOnePlan) {
          const focusAreas = form.getValues("focus_areas") || [];
          if (focusAreas.length === 0) {
            form.setError("focus_areas", { message: "Please select at least one area of focus" });
            return false;
          }
        }
        break;
      }
      case "coach": {
        // 1:1 only. "specific" requires a chosen coach; "auto" needs no selection.
        const coachPreferenceType = form.getValues("coach_preference_type");
        const requestedCoachId = form.getValues("requested_coach_id");
        if (coachPreferenceType === "specific" && !requestedCoachId) {
          form.setError("requested_coach_id", { message: "Please select a coach or choose auto-match" });
          return false;
        }
        break;
      }
      case "details": // Service Details
        if (serviceName === "Team Plan" || serviceName === "Fe Squad" || serviceName === "Bunz of Steel") {
          // Manual validation for team plan checkboxes
          const acceptsTeam = form.getValues("accepts_team_program");
          const understandsNoNutrition = form.getValues("understands_no_nutrition");
          
          if (!acceptsTeam) {
            form.setError("accepts_team_program", { message: "You must acknowledge this to continue" });
            return false;
          }
          if (!understandsNoNutrition) {
            form.setError("understands_no_nutrition", { message: "You must acknowledge this to continue" });
            return false;
          }
          
          if (serviceName === "Bunz of Steel") {
            const acceptsLowerBody = form.getValues("accepts_lower_body_only");
            if (!acceptsLowerBody) {
              form.setError("accepts_lower_body_only", { message: "You must acknowledge this to continue" });
              return false;
            }
          }
        } else if (serviceName === "1:1 Online") {
          fieldsToValidate = ["training_experience", "training_goals", "training_days_per_week", "gym_access_type", "nutrition_approach"];
          
          // Manual validation for 1:1 required fields
          const trainingExp = form.getValues("training_experience");
          const trainingGoals = form.getValues("training_goals");
          
          if (!trainingExp || trainingExp.length === 0) {
            form.setError("training_experience", { message: "Please select your training experience" });
            return false;
          }
          if (!trainingGoals || trainingGoals.length < 10) {
            form.setError("training_goals", { message: "Please describe your goals (minimum 10 characters)" });
            return false;
          }
        } else if (serviceName === "1:1 In-Person" || serviceName === "1:1 Hybrid") {
          fieldsToValidate = ["training_experience", "training_goals", "preferred_training_times", "preferred_gym_location", "nutrition_approach"];
          
          // Manual validation for 1:1 required fields
          const trainingExp = form.getValues("training_experience");
          const trainingGoals = form.getValues("training_goals");
          
          if (!trainingExp || trainingExp.length === 0) {
            form.setError("training_experience", { message: "Please select your training experience" });
            return false;
          }
          if (!trainingGoals || trainingGoals.length < 10) {
            form.setError("training_goals", { message: "Please describe your goals (minimum 10 characters)" });
            return false;
          }
        }
        break;
      case "health": // Health (PAR-Q)
        fieldsToValidate = [
          "parq_heart_condition",
          "parq_chest_pain_active",
          "parq_chest_pain_inactive",
          "parq_balance_dizziness",
          "parq_bone_joint_problem",
          "parq_medication",
          "parq_other_reason",
        ];
        break;
      case "legal": // Legal
        fieldsToValidate = ["agreed_terms", "agreed_privacy", "agreed_refund_policy", "agreed_intellectual_property", "agreed_medical_disclaimer"];
        break;
    }

    const result = await form.trigger(fieldsToValidate as any);
    return result;
  };

  const handleNext = async () => {
    if (import.meta.env.DEV) console.log("Validating step:", currentStep);
    const isValid = await validateStep(currentStep);
    if (import.meta.env.DEV) console.log("Step valid:", isValid);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    } else {
      if (import.meta.env.DEV) console.log("Form errors:", form.formState.errors);
    }
  };

  const handleBack = () => {
    setCurrentStep((prev) => Math.max(prev - 1, 0));
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    // Validate date_of_birth is provided
    if (!values.date_of_birth || values.date_of_birth.trim() === '') {
      toast({
        title: "Missing Information",
        description: "Please provide your date of birth to continue.",
        variant: "destructive",
      });
      setCurrentStep(0); // Go back to first step where DOB is
      return;
    }

    setSubmitting(true);
    try {
      if (import.meta.env.DEV) console.log("Submitting onboarding form via secure edge function...");
      if (import.meta.env.DEV) console.log("Form values:", values);

      // Discord is retired — never send it (the DB column stays for old submissions).
      const { discord_username: _discordRetired, ...submitPayload } = values;
      void _discordRetired;

      // Submit through edge function for server-side validation
      const { data, error: functionError } = await supabase.functions.invoke('submit-onboarding', {
        body: submitPayload,
      });

      if (functionError) {
        if (import.meta.env.DEV) console.error("Error submitting form:", functionError);
        throw functionError;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to submit form');
      }

      // Use the status from the edge function to redirect directly to the correct page
      const returnedStatus = data.status as ClientStatus;
      const redirectUrl = getOnboardingRedirect(returnedStatus) || "/dashboard";

      setHasSubmitted(true);

      // Send welcome email (non-blocking)
      try {
        await supabase.functions.invoke('send-welcome-email', {
          body: {
            email: values.email,
            firstName: values.first_name,
            serviceName: values.plan_name,
            status: data.status,
            paymentDeadline: data.paymentDeadline,
            needsMedicalReview: data.needsMedicalReview,
          },
        });
      } catch (emailError) {
        if (import.meta.env.DEV) console.error('Error sending welcome email:', emailError);
      }

      // Clear the draft after successful submission
      await deleteDraft();

      // Show the "You're in" finish screen with a recap; its CTA continues to payment.
      const submittedOneToOne = ["1:1 Online", "1:1 Hybrid", "1:1 In-Person"].includes(values.plan_name);
      setFinished({
        redirectUrl,
        planName: values.plan_name,
        coachLine: submittedOneToOne
          ? values.coach_preference_type === "specific"
            ? "The coach you chose"
            : "Auto-matched to your best-fit coach"
          : null,
        focusCount: (values.focus_areas ?? []).length,
      });

    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Submission error:', error);
      toast({
        title: "Submission Failed",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (fatalError) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <ErrorFallback 
          title="Unable to load registration"
          message="We couldn't load your registration form. Please try refreshing or contact support."
          onRetry={() => window.location.reload()} 
        />
      </div>
    );
  }

  if (finished) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-24">
        <Card className="w-full max-w-md border-border/50 shadow-2xl">
          <CardContent className="p-8 text-center space-y-5">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500/10">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" aria-hidden />
            </div>
            <div>
              <h2 className="text-2xl font-bold">You're in!</h2>
              <p className="text-muted-foreground mt-1">Your registration is submitted.</p>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-left text-sm space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-muted-foreground">Plan</span>
                <span className="font-medium">{finished.planName}</span>
              </div>
              {finished.coachLine && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Coach</span>
                  <span className="font-medium text-right">{finished.coachLine}</span>
                </div>
              )}
              {finished.focusCount > 0 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-muted-foreground">Focus areas</span>
                  <span className="font-medium">{finished.focusCount} selected</span>
                </div>
              )}
            </div>
            <Button className="w-full" onClick={() => navigate(finished.redirectUrl, { replace: true })}>
              Continue to payment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading || hasSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pt-20 pb-24 md:pb-8 px-4">
      <div className="container mx-auto max-w-4xl py-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <button 
              onClick={() => navigate("/")}
              className="p-3 rounded-full bg-gradient-to-r from-primary to-accent hover:opacity-90 transition-opacity cursor-pointer"
              type="button"
            >
              <Dumbbell className="h-8 w-8 text-white" />
            </button>
          </div>
          <h1 className="text-3xl font-bold mb-2">Client Registration</h1>
          <p className="text-muted-foreground">
            Complete all steps to join IGU Coaching
          </p>
        </div>

        <Card className="border-border/50 shadow-2xl">
          <CardContent className="p-6 md:p-8">
            {/* Auto-save indicator */}
            <div className="mb-4 flex items-center justify-end gap-2 text-sm text-muted-foreground">
              {autoSaving ? (
                <>
                  <Save className="h-4 w-4 animate-pulse" />
                  <span>Saving...</span>
                </>
              ) : lastSaved ? (
                <>
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                  <span>
                    Saved {new Date().getTime() - lastSaved.getTime() < 60000 
                      ? 'just now' 
                      : 'at ' + lastSaved.toLocaleTimeString()}
                  </span>
                </>
              ) : null}
            </div>

            <div className="mb-6 p-4 rounded-lg bg-primary/5 border border-primary/10 flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Signing up for</p>
                <p className="text-lg font-semibold text-foreground">
                  {selectedServiceName || "No service selected yet"}
                </p>
              </div>
              {currentStep > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCurrentStep(0)}
                  className="text-primary hover:text-primary"
                >
                  {selectedServiceName ? "Change Service" : "Choose Service"}
                </Button>
              )}
            </div>
            
            <StepIndicator
              currentStep={currentStep}
              totalSteps={steps.length}
              steps={steps.map((s) => s.label)}
              onStepClick={(stepIndex) => setCurrentStep(stepIndex)}
            />

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                if (import.meta.env.DEV) console.error('Form validation errors:', errors);
                // Don't show toast for legal step - it has inline helper text
                if (stepId !== "legal") {
                  toast({
                    title: "Validation Error",
                    description: "Please check all required fields are filled correctly.",
                    variant: "destructive",
                  });
                }
              })} className="space-y-8">
                {stepId === "service" && <ServiceStep form={form} serviceId={searchParams.get('service') || undefined} />}
                {stepId === "details" && <ServiceSpecificStep form={form} selectedService={selectedServiceName} />}
                {stepId === "coach" && <ChooseCoachStep form={form} planName={selectedPlanName} />}
                {stepId === "health" && <ParqStep form={form} />}
                {stepId === "legal" && <LegalStep form={form} />}
                {/* Nav — sticky bottom bar on mobile (Back · progress · Continue),
                    inline on desktop. Content clears it via the container's pb-24. */}
                <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:px-0 md:pt-6 md:pb-0 md:backdrop-blur-none">
                  {/* Compact progress — mobile only (the top StepIndicator covers desktop). */}
                  <div className="mb-2 flex items-center gap-2 md:hidden">
                    <div className="h-1 flex-1 rounded-full bg-muted">
                      <div
                        className="h-1 rounded-full bg-primary transition-all"
                        style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] font-medium text-muted-foreground tabular-nums">
                      {currentStep + 1}/{steps.length}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleBack}
                        disabled={currentStep === 0}
                      >
                        Back
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={async () => {
                          await saveDraft();
                          toast({
                            title: "Progress Saved",
                            description: "You can continue your registration anytime by logging back in.",
                          });
                          navigate("/");
                        }}
                      >
                        <LogOut className="h-4 w-4 sm:mr-2" />
                        <span className="hidden sm:inline">Save & Exit</span>
                      </Button>
                    </div>

                    {currentStep < steps.length - 1 ? (
                      <Button type="button" onClick={handleNext}>
                        Next
                      </Button>
                    ) : (
                      <Button
                        type="submit"
                        disabled={submitting || !allLegalAccepted}
                      >
                        {submitting ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Submitting...
                          </>
                        ) : (
                          "Submit Application"
                        )}
                      </Button>
                    )}
                  </div>
                </div>
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
