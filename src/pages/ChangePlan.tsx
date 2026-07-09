import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Form } from "@/components/ui/form";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { StepIndicator } from "@/components/onboarding/StepIndicator";
import { GoalsStep } from "@/components/onboarding/GoalsStep";
import { Dumbbell, Loader2, CheckCircle2, ArrowRight, UserCheck, CalendarClock } from "lucide-react";
import { CLIENT_PRICE_PER_LEVEL, type ProfessionalLevel } from "@/auth/roles";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { format } from "date-fns";

const TEAM_TYPES = new Set(["team"]);
const ONE_TO_ONE_WITH_GOALS = ["1:1 Online", "1:1 Hybrid", "1:1 In-Person"];

interface CurrentSub {
  id: string;
  service_id: string;
  coach_id: string | null;
  next_billing_date: string | null;
  coach_level: ProfessionalLevel;
  service_name: string;
  service_slug: string;
  service_type: string;
  coach_name: string | null;
  payment_exempt: boolean;
}

interface TargetService {
  id: string;
  name: string;
  slug: string;
  type: string;
  price_kwd: number;
}

interface ScheduledRequest {
  id: string;
  target_service_id: string;
  target_price_kwd: number | null;
  effective_at: string;
  status: string;
}

// The change flow is a thin dedicated shell (dedicated /change-plan, not the
// onboarding wizard) -- an ACTIVE client from billing schedules a plan change
// that takes effect at their next due date. No payment now; no PAR-Q/legal (on
// file). CP2 scope: 1:1 <-> 1:1. Terminal action is change-service:schedule.
export default function ChangePlan() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [current, setCurrent] = useState<CurrentSub | null>(null);
  const [services, setServices] = useState<TargetService[]>([]);
  const [scheduled, setScheduled] = useState<ScheduledRequest | null>(null);
  const [currentStep, setCurrentStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [result, setResult] = useState<
    | { kind: "scheduled" | "needs_admin"; serviceName: string; priceKwd: number | null; effectiveAt: string; appliesAtNextPayment: boolean; paymentExempt: boolean }
    | null
  >(null);

  const form = useForm<{
    plan_name: string;
    focus_areas: string[];
    coach_preference_type: "keep" | "auto";
  }>({
    defaultValues: { plan_name: "", focus_areas: [], coach_preference_type: "keep" },
  });

  const selectedPlanName = form.watch("plan_name");
  const coachPref = form.watch("coach_preference_type");

  const hasFetched = useRef(false);
  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate("/auth"); return; }

      // Current ACTIVE subscription — only active clients can change plan.
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id, service_id, coach_id, next_billing_date, coach_level_at_purchase, status, services(name, slug, type)")
        .eq("user_id", user.id)
        .eq("status", "active")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!sub) {
        toast({ title: "No active plan", description: "You need an active plan to change it.", variant: "destructive" });
        navigate("/billing/pay");
        return;
      }

      const svc = (sub as any).services;
      // Coach name via the client-safe view; level from the purchase snapshot.
      let coachName: string | null = null;
      if (sub.coach_id) {
        const { data: c } = await supabase
          .from("coaches_client_safe")
          .select("first_name")
          .eq("user_id", sub.coach_id)
          .maybeSingle();
        coachName = c?.first_name?.trim() || null;
      }
      const { data: pub } = await supabase
        .from("profiles_public").select("payment_exempt").eq("id", user.id).maybeSingle();

      setCurrent({
        id: sub.id,
        service_id: sub.service_id,
        coach_id: sub.coach_id,
        next_billing_date: sub.next_billing_date,
        coach_level: ((sub as any).coach_level_at_purchase as ProfessionalLevel) || "junior",
        service_name: svc?.name ?? "Your plan",
        service_slug: svc?.slug ?? "",
        service_type: svc?.type ?? "",
        coach_name: coachName,
        payment_exempt: pub?.payment_exempt === true,
      });

      // Already-scheduled change? Surface it (cancel-only) instead of the wizard.
      const { data: existing } = await supabase
        .from("subscription_change_requests")
        .select("id, target_service_id, target_price_kwd, effective_at, status")
        .eq("user_id", user.id)
        .eq("status", "scheduled")
        .maybeSingle();
      if (existing) setScheduled(existing);

      // Valid targets: active 1:1 services except the current one (CP2 = 1:1<->1:1).
      const { data: svcs } = await supabase
        .from("services")
        .select("id, name, slug, type, price_kwd")
        .eq("is_active", true)
        .order("price_kwd");
      setServices(
        (svcs ?? []).filter((s) => !TEAM_TYPES.has(s.type) && s.id !== sub.service_id) as TargetService[],
      );

      // Prefill focus areas from the last submission (change may re-confirm them).
      const { data: fs } = await supabase
        .from("form_submissions")
        .select("focus_areas")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fs?.focus_areas) form.setValue("focus_areas", fs.focus_areas);
    } catch (err) {
      if (import.meta.env.DEV) console.error("change-plan load error", err);
      toast({ title: "Couldn't load", description: "Please try again.", variant: "destructive" });
      navigate("/billing/pay");
    } finally {
      setLoading(false);
    }
  }, [navigate, toast, form]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  const targetService = services.find((s) => s.name === selectedPlanName) || null;
  const isOneToOneTarget = ONE_TO_ONE_WITH_GOALS.includes(selectedPlanName);

  // 1:1 -> 1:1: plan -> [goals] -> coach -> confirm. (Gym/details re-ask is a
  // later refinement; CP2 keeps focus + coach.)
  const steps = useMemo(
    () => [
      { id: "plan", label: "New plan" },
      ...(isOneToOneTarget ? [{ id: "goals", label: "Goals" }] : []),
      { id: "coach", label: "Coach" },
      { id: "confirm", label: "Confirm" },
    ],
    [isOneToOneTarget],
  );
  const stepId = steps[currentStep]?.id;

  useEffect(() => {
    if (currentStep > steps.length - 1) setCurrentStep(steps.length - 1);
  }, [currentStep, steps.length]);

  const targetPriceKwd = useMemo(() => {
    if (!current || !targetService) return null;
    if (current.payment_exempt) return 0;
    return CLIENT_PRICE_PER_LEVEL[targetService.slug]?.[current.coach_level] ?? targetService.price_kwd;
  }, [current, targetService]);

  const effectiveLabel = useMemo(() => {
    const nbd = current?.next_billing_date ? new Date(current.next_billing_date) : null;
    if (!nbd || nbd <= new Date()) return "your next payment";
    return format(nbd, "d MMM yyyy");
  }, [current]);

  const canNext = () => {
    if (stepId === "plan") return !!targetService;
    if (stepId === "goals") return (form.getValues("focus_areas") || []).length > 0;
    return true;
  };

  const handleSchedule = async () => {
    if (!targetService) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke("change-service", {
        body: {
          action: "schedule",
          targetServiceId: targetService.id,
          coachPreference: coachPref,
          focusAreas: form.getValues("focus_areas") || [],
        },
      });
      if (error) throw error;
      if (data?.code === "already_scheduled") {
        toast({ title: "Already scheduled", description: "You already have a plan change scheduled.", variant: "destructive" });
        setScheduled(data.existing ?? null);
        return;
      }
      if (!data?.success) throw new Error(data?.error || "Could not schedule the change");

      setResult({
        kind: data.status === "needs_admin" ? "needs_admin" : "scheduled",
        serviceName: data.targetServiceName,
        priceKwd: data.targetPriceKwd ?? null,
        effectiveAt: data.effectiveAt,
        appliesAtNextPayment: !!data.appliesAtNextPayment,
        paymentExempt: !!data.paymentExempt,
      });
    } catch (error) {
      toast({ title: "Couldn't schedule", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelScheduled = async () => {
    if (!scheduled) return;
    setCancelling(true);
    try {
      // RLS allows the owner to flip their own scheduled -> cancelled.
      const { error } = await supabase
        .from("subscription_change_requests")
        .update({ status: "cancelled" })
        .eq("id", scheduled.id);
      if (error) throw error;
      toast({ title: "Change cancelled", description: "Your plan stays the same." });
      setScheduled(null);
    } catch (error) {
      toast({ title: "Couldn't cancel", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setCancelling(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // ---- Result screen (scheduled / needs_admin) ----
  if (result) {
    const admin = result.kind === "needs_admin";
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-24">
        <Card className="w-full max-w-md border-border/50 shadow-2xl">
          <CardContent className="p-8 text-center space-y-5">
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full ${admin ? "bg-amber-500/10" : "bg-emerald-500/10"}`}>
              {admin ? <UserCheck className="h-8 w-8 text-amber-500" aria-hidden /> : <CalendarClock className="h-8 w-8 text-emerald-500" aria-hidden />}
            </div>
            <div>
              <h2 className="text-2xl font-bold">{admin ? "We'll review this change" : "Change scheduled"}</h2>
              <p className="text-muted-foreground mt-1">
                {admin
                  ? "This change needs a quick review from our team -- we'll follow up shortly. Your current plan stays active."
                  : result.paymentExempt
                    ? `Your plan changes to ${result.serviceName} on ${result.appliesAtNextPayment ? "your next payment" : format(new Date(result.effectiveAt), "d MMM yyyy")}. No payment needed.`
                    : `Your plan changes to ${result.serviceName} on ${result.appliesAtNextPayment ? "your next payment" : format(new Date(result.effectiveAt), "d MMM yyyy")}. You'll pay ${result.priceKwd} KWD then. Nothing changes until then.`}
              </p>
            </div>
            <Button className="w-full" onClick={() => navigate("/billing/pay")}>Back to billing</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Already-scheduled: manage (cancel) instead of starting a new change ----
  if (scheduled) {
    const svc = services.find((s) => s.id === scheduled.target_service_id);
    return (
      <div className="min-h-screen bg-background flex items-center justify-center px-4 py-24">
        <Card className="w-full max-w-md border-border/50 shadow-2xl">
          <CardContent className="p-8 space-y-5">
            <div className="flex items-center gap-3">
              <CalendarClock className="h-6 w-6 text-primary" aria-hidden />
              <h2 className="text-xl font-bold">You have a scheduled change</h2>
            </div>
            <div className="rounded-lg border bg-muted/30 p-4 text-sm space-y-2">
              <div className="flex justify-between"><span className="text-muted-foreground">Changing to</span><span className="font-medium">{svc?.name ?? "New plan"}</span></div>
              {scheduled.target_price_kwd != null && (
                <div className="flex justify-between"><span className="text-muted-foreground">New price</span><span className="font-medium">{scheduled.target_price_kwd} KWD</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">Effective</span><span className="font-medium">{format(new Date(scheduled.effective_at), "d MMM yyyy")}</span></div>
            </div>
            <p className="text-sm text-muted-foreground">Only one change can be scheduled at a time. Cancel this to start a different one.</p>
            <div className="flex flex-col gap-2">
              <Button variant="outline" className="w-full" onClick={handleCancelScheduled} disabled={cancelling}>
                {cancelling ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Cancelling...</> : "Cancel scheduled change"}
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => navigate("/billing/pay")}>Back to billing</Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ---- Wizard ----
  return (
    <div className="min-h-screen bg-background pt-20 pb-24 md:pb-8 px-4 safe-area-bottom">
      <div className="container mx-auto max-w-3xl py-8">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-gradient-to-r from-primary to-accent">
              <Dumbbell className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">Change your plan</h1>
          <p className="text-muted-foreground">
            You're on <span className="font-medium text-foreground">{current?.service_name}</span>. Pick a new plan --
            it takes effect on {effectiveLabel}, no payment now.
          </p>
        </div>

        <Card className="border-border/50 shadow-2xl">
          <CardContent className="p-6 md:p-8">
            <StepIndicator
              currentStep={currentStep}
              totalSteps={steps.length}
              steps={steps.map((s) => s.label)}
              onStepClick={(i) => setCurrentStep(i)}
            />

            <Form {...form}>
              <div className="space-y-8">
                {stepId === "plan" && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">Choose your new plan</h2>
                      <p className="text-muted-foreground">Only plans different from your current one are shown.</p>
                    </div>
                    <div className="space-y-3">
                      {services.map((s) => {
                        const isSel = selectedPlanName === s.name;
                        const price = current ? CLIENT_PRICE_PER_LEVEL[s.slug]?.[current.coach_level] ?? s.price_kwd : s.price_kwd;
                        return (
                          <ClickableCard
                            key={s.id}
                            ariaLabel={`Select ${s.name}`}
                            onClick={() => form.setValue("plan_name", s.name)}
                            className={`relative p-4 ${isSel ? "border-primary ring-2 ring-primary/20 bg-primary/5" : ""}`}
                          >
                            {isSel && <CheckCircle2 className="absolute top-3 right-3 h-5 w-5 text-primary" aria-hidden />}
                            <div className="font-semibold">{s.name}</div>
                            <div className="text-lg font-bold text-primary mt-1">
                              {current?.payment_exempt ? "Included" : `${price} KWD/month`}
                            </div>
                          </ClickableCard>
                        );
                      })}
                      {services.length === 0 && (
                        <p className="text-muted-foreground text-sm">No other plans are available to switch to right now.</p>
                      )}
                    </div>
                  </div>
                )}

                {stepId === "goals" && <GoalsStep form={form as any} />}

                {stepId === "coach" && (
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">Your coach</h2>
                      <p className="text-muted-foreground">Keep your current coach if they offer the new plan, or we'll match you with the best fit.</p>
                    </div>
                    <div className="space-y-3">
                      {current?.coach_id && (
                        <ClickableCard
                          ariaLabel="Keep my current coach"
                          onClick={() => form.setValue("coach_preference_type", "keep")}
                          className={`p-4 ${coachPref === "keep" ? "border-primary ring-2 ring-primary/20 bg-primary/5" : ""}`}
                        >
                          <div className="font-semibold">Keep {current.coach_name || "my current coach"}</div>
                          <div className="text-sm text-muted-foreground">If they offer the new plan and have space, you stay together.</div>
                        </ClickableCard>
                      )}
                      <ClickableCard
                        ariaLabel="Match me with a coach"
                        onClick={() => form.setValue("coach_preference_type", "auto")}
                        className={`p-4 ${coachPref === "auto" ? "border-primary ring-2 ring-primary/20 bg-primary/5" : ""}`}
                      >
                        <div className="font-semibold">Match me with the best-fit coach</div>
                        <div className="text-sm text-muted-foreground">We'll assign the right coach for your new plan.</div>
                      </ClickableCard>
                    </div>
                  </div>
                )}

                {stepId === "confirm" && current && targetService && (
                  <div className="space-y-5">
                    <div>
                      <h2 className="text-2xl font-bold mb-2">Confirm your change</h2>
                      <p className="text-muted-foreground">Nothing changes until it takes effect -- you can cancel anytime before then.</p>
                    </div>
                    <div className="rounded-lg border p-4 space-y-3">
                      <div className="flex items-center justify-center gap-3 text-center">
                        <span className="font-medium">{current.service_name}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden />
                        <span className="font-semibold text-primary">{targetService.name}</span>
                      </div>
                      <div className="border-t pt-3 space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">New price</span>
                          <span className="font-medium">{current.payment_exempt ? "Included (no payment)" : `${targetPriceKwd} KWD/month`}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Effective</span>
                          <span className="font-medium">{effectiveLabel}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Coach</span>
                          <span className="font-medium">{coachPref === "keep" ? `Keeping ${current.coach_name || "your coach"}` : "New match"}</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {current.payment_exempt
                        ? "No payment is taken now or at the change."
                        : "No payment now -- you'll pay the new price on your next billing date."}
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-between gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => (currentStep === 0 ? navigate("/billing/pay") : setCurrentStep((s) => s - 1))}>
                    {currentStep === 0 ? "Cancel" : "Back"}
                  </Button>
                  {stepId === "confirm" ? (
                    <Button type="button" onClick={handleSchedule} disabled={submitting}>
                      {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Scheduling...</> : "Schedule change"}
                    </Button>
                  ) : (
                    <Button type="button" onClick={() => canNext() && setCurrentStep((s) => Math.min(s + 1, steps.length - 1))} disabled={!canNext()}>
                      Next
                    </Button>
                  )}
                </div>
              </div>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
