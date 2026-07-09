import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ClickableCard } from "@/components/ui/clickable-card";
import { ShieldCheck, UserCheck, CreditCard, Calculator, Loader2, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type OnboardingStatusKey = "needs_medical_review" | "pending_coach_approval" | "pending_payment";

interface OnboardingStatusScreenProps {
  status: OnboardingStatusKey;
  /** Greeting name, from profiles_public.first_name. */
  clientName?: string;
  /** Only pending_payment (non-exempt). Wired to the create-tap-payment path. */
  onPay?: () => void;
  /** Spinner on the pay CTA. */
  isPaying?: boolean;
}

interface StatusConfig {
  icon: LucideIcon;
  /** Icon-chip tone (bg + text) per status. */
  tone: string;
  title: string;
  subtext: string;
}

/**
 * Onboarding Part D — one calm, branded status screen for the post-submit waiting
 * states (medical review / coach approval) and the payment-exempt neutral state.
 * Read-only: it renders profiles_public.status as passed; it never fetches or
 * writes status. Mockup ref: ONBOARDING_REDESIGN_MOCKUPS.html L398-406.
 */
export function OnboardingStatusScreen({ status, clientName, onPay, isPaying }: OnboardingStatusScreenProps) {
  const navigate = useNavigate();

  // pending_payment splits on payability: a payment-exempt client (no onPay) must
  // NEVER see a pay CTA -- they get a neutral "you're all set" state instead.
  const isPayable = status === "pending_payment" && typeof onPay === "function";

  const config: Record<OnboardingStatusKey, StatusConfig> = {
    needs_medical_review: {
      icon: ShieldCheck,
      tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      title: "We're reviewing your health form",
      subtext:
        "You flagged something on the PAR-Q, so a coach is giving it a quick look -- usually within a day. We'll email you.",
    },
    pending_coach_approval: {
      icon: UserCheck,
      tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
      title: "Your coach is reviewing your info",
      subtext:
        "We're pairing you with the right coach -- usually within a day. We'll email you when you're cleared to start.",
    },
    pending_payment: {
      icon: CreditCard,
      tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
      title: isPayable ? "You're almost in" : "You're all set",
      subtext: isPayable
        ? "Your spot is ready -- activate your plan to get started."
        : "Your spot is ready -- we're activating your plan for you. No payment needed.",
    },
  };

  const cfg = config[status];
  const Icon = cfg.icon;

  return (
    <div className="min-h-[60vh] flex items-center justify-center px-4 pb-24 md:pb-8 safe-area-bottom">
      <div className="w-full max-w-md text-center space-y-5">
        <div
          className={cn(
            "mx-auto flex h-[60px] w-[60px] items-center justify-center rounded-2xl",
            cfg.tone,
          )}
        >
          <Icon className="h-7 w-7" aria-hidden />
        </div>

        <div className="space-y-2">
          {clientName && <p className="text-sm text-muted-foreground">Hi {clientName},</p>}
          <h1 className="font-display text-xl md:text-2xl font-bold">{cfg.title}</h1>
          <p className="text-muted-foreground">{cfg.subtext}</p>
        </div>

        {/* "While you wait" — only links to what's actually reachable during
            incomplete onboarding. OnboardingGuard bounces non-dashboard client
            routes (exercise library, educational videos) back to /dashboard, so
            those would dead-bounce. The calorie calculator is a public route and
            works. (Reaching the library during waiting would need a deliberate
            OnboardingGuard allowlist change -- out of scope here.) */}
        <ClickableCard
          ariaLabel="Open the calorie calculator"
          onClick={() => navigate("/calorie-calculator")}
          className="p-4 text-left"
        >
          <div className="flex items-center gap-3">
            <Calculator className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">While you wait</p>
              <p className="text-sm">Explore the calorie calculator.</p>
            </div>
          </div>
        </ClickableCard>

        {isPayable && (
          <div className="pt-1">
            <Button className="w-full" onClick={onPay} disabled={isPaying}>
              {isPaying ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                "Continue to payment"
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
