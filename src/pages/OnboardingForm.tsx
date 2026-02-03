import { useState, useEffect, useCallback, useRef } from "react";
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
import { Dumbbell, Loader2, Save, CheckCircle2 } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ErrorFallback } from "@/components/ui/error-fallback";

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
  discord_username: z.string().optional(),
  plan_name: z.string().min(1, "Please select a plan"),
  focus_areas: z.array(z.string()).optional(),
  heard_about_us: z.string().min(1, "Please tell us how you heard about us"),
  heard_about_us_other: z.string().optional(),
  
  // Coach Preference (1:1 plans only)
  coach_preference_type: z.enum(["auto", "specific"]).default("auto"),
  requested_coach_id: z.string().nullable().optional(),
});

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
  
  const steps = ["Service", "Service Details", "Health", "Legal"];

  const loadServiceName = useCallback(async () => {
    try {
      const serviceId = searchParams.get('service');
      console.log('Service ID from URL:', serviceId);
      if (!serviceId) return;

      // First, try to resolve by ID
      const { data, error } = await supabase
        .from('services')
        .select('name')
        .eq('id', serviceId)
        .maybeSingle();

      console.log('Service by ID:', data, 'Error:', error);

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

      console.log('Service by name:', byName, 'Error:', byNameError);
      if (byName?.name) {
        setSelectedServiceName(byName.name);
        form.setValue('plan_name', byName.name);
      }
    } catch (error) {
      console.error('Error loading service:', error);
    }
  }, [searchParams, form]);

  const checkAuth = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
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

      // Check for active subscriptions - users with active subscriptions cannot sign up for another
      const { data: activeSubscriptions } = await supabase
        .from('subscriptions')
        .select('id, status, services(name)')
        .eq('user_id', user.id)
        .eq('status', 'active');

      if (activeSubscriptions && activeSubscriptions.length > 0) {
        toast({
          title: "Active Subscription Found",
          description: `You already have an active subscription (${activeSubscriptions[0].services?.name}). Please cancel your current subscription before signing up for another service.`,
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
        supabase.from('profiles_public').select('first_name').eq('id', user.id).single(),
        supabase.from('profiles_private').select('email, phone, full_name, last_name').eq('profile_id', user.id).single()
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
      console.error("Error during auth check:", err);
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
        // Restore form data
        Object.keys(draft.form_data).forEach((key) => {
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
      console.error('Error loading draft:', error);
    }
  }, [userId, form, toast]);

  const saveDraft = useCallback(async () => {
    if (!userId || hasSubmitted || submitting) return;

    setAutoSaving(true);
    try {
      const formData = form.getValues();

      const { error } = await supabase
        .from('onboarding_drafts')
        .upsert({
          user_id: userId,
          form_data: formData,
          current_step: currentStep,
        }, {
          onConflict: 'user_id',
        });

      if (error) throw error;

      setLastSaved(new Date());
    } catch (error: any) {
      console.error('Error saving draft:', error);
    } finally {
      setAutoSaving(false);
    }
  }, [userId, currentStep, hasSubmitted, submitting, form]);

  useEffect(() => {
    checkAuth();
    loadServiceName();
  }, [checkAuth, loadServiceName]);

  useEffect(() => {
    loadDraft();
  }, [loadDraft]);

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
      await supabase
        .from('onboarding_drafts')
        .delete()
        .eq('user_id', userId);
    } catch (error: any) {
      console.error('Error deleting draft:', error);
    }
  };

  const validateStep = async (step: number): Promise<boolean> => {
    let fieldsToValidate: string[] = [];
    const serviceName = form.getValues("plan_name");

    switch (step) {
      case 0: {
        // Service
        fieldsToValidate = ["first_name", "last_name", "email", "phone_number", "plan_name", "heard_about_us"];
        // Validate focus_areas for 1:1 services
        const currentPlan = form.getValues("plan_name");
        const isOneToOne = currentPlan === "1:1 Online" || currentPlan === "1:1 In-Person" || currentPlan === "1:1 Hybrid";
        if (isOneToOne) {
          const focusAreas = form.getValues("focus_areas") || [];
          if (focusAreas.length === 0) {
            form.setError("focus_areas", { message: "Please select at least one area of focus" });
            return false;
          }
          // Validate coach selection if "specific" is chosen
          const coachPreferenceType = form.getValues("coach_preference_type");
          const requestedCoachId = form.getValues("requested_coach_id");
          if (coachPreferenceType === "specific" && !requestedCoachId) {
            form.setError("requested_coach_id", { message: "Please select a coach or choose auto-match" });
            return false;
          }
        }
        break;
      }
      case 1: // Service Details
        if (serviceName === "Fe Squad" || serviceName === "Bunz of Steel") {
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
      case 2: // Health (PAR-Q)
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
      case 3: // Legal
        fieldsToValidate = ["agreed_terms", "agreed_privacy", "agreed_refund_policy", "agreed_intellectual_property", "agreed_medical_disclaimer"];
        break;
    }

    const result = await form.trigger(fieldsToValidate as any);
    return result;
  };

  const handleNext = async () => {
    console.log("Validating step:", currentStep);
    const isValid = await validateStep(currentStep);
    console.log("Step valid:", isValid);
    if (isValid) {
      setCurrentStep((prev) => Math.min(prev + 1, steps.length - 1));
    } else {
      console.log("Form errors:", form.formState.errors);
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
      console.log("Submitting onboarding form via secure edge function...");
      console.log("Form values:", values);

      // Submit through edge function for server-side validation
      const { data, error: functionError } = await supabase.functions.invoke('submit-onboarding', {
        body: values,
      });

      if (functionError) {
        console.error("Error submitting form:", functionError);
        throw functionError;
      }

      if (!data?.success) {
        throw new Error(data?.error || 'Failed to submit form');
      }

      // Always redirect to dashboard, regardless of plan type
      // The dashboard will handle the appropriate next steps:
      // - For needs_medical_review: show medical review message
      // - For pending_coach_approval: show waiting for coach message
      // - For pending_payment: show payment card with countdown
      toast({
        title: "Registration submitted successfully!",
        description: "Redirecting to your dashboard...",
      });

      setHasSubmitted(true);
      
      // Send welcome email
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
        console.error('Error sending welcome email:', emailError);
        // Don't fail the whole process if email fails
      }

      // Clear the draft after successful submission
      await deleteDraft();
      
      // Redirect to dashboard where the appropriate card will be shown
      setTimeout(() => {
        navigate('/dashboard');
      }, 1000);

    } catch (error: any) {
      console.error('Submission error:', error);
      toast({
        title: "Submission Failed",
        description: error.message || "Failed to submit application. Please try again.",
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

  if (loading || hasSubmitted) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pt-20 pb-4 px-4">
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
              steps={steps}
            />

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit, (errors) => {
                console.error('Form validation errors:', errors);
                // Don't show toast for legal step - it has inline helper text
                if (currentStep !== 3) {
                  toast({
                    title: "Validation Error",
                    description: "Please check all required fields are filled correctly.",
                    variant: "destructive",
                  });
                }
              })} className="space-y-8">
                {currentStep === 0 && <ServiceStep form={form} serviceId={searchParams.get('service') || undefined} />}
                {currentStep === 1 && <ServiceSpecificStep form={form} selectedService={selectedServiceName} />}
                {currentStep === 2 && <ParqStep form={form} />}
                {currentStep === 3 && <LegalStep form={form} />}
                <div className="flex justify-between pt-6">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleBack}
                    disabled={currentStep === 0}
                  >
                    Back
                  </Button>

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
              </form>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
