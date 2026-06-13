import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Loader2, UserCheck } from "lucide-react";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';
import { LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";

interface PaymentButtonProps {
  serviceId: string;
  userId: string;
  userEmail: string;
  userName: string;
  className?: string;
  isRenewal?: boolean;
  onPaymentStart?: () => void;
}

// Resolved level-based price for the client's own subscription (get_subscription_price_quote RPC).
interface PriceQuote {
  price_kwd: number;
  coach_level: ProfessionalLevel | null;
  coach_display_name: string | null;
  coach_assigned: boolean;
  service_name: string | null;
  service_slug: string | null;
}

export function PaymentButton({
  serviceId,
  userId,
  userEmail,
  userName,
  className,
  isRenewal = false,
  onPaymentStart
}: PaymentButtonProps) {
  const [loading, setLoading] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [quote, setQuote] = useState<PriceQuote | null>(null);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const isSubmittingRef = useRef(false); // Prevent double-click race conditions
  const { toast } = useToast();

  // Build B: before charging, resolve + show the assigned coach and the level-based
  // price (which depends on that coach's level), and require explicit confirmation.
  const openConfirm = useCallback(async () => {
    setConfirmed(false);
    setQuote(null);
    setConfirmOpen(true);
    setQuoteLoading(true);
    try {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("id")
        .eq("user_id", userId)
        .eq("service_id", serviceId)
        .maybeSingle();
      if (sub?.id) {
        const { data, error } = await supabase
          .rpc("get_subscription_price_quote", { p_subscription_id: sub.id });
        if (!error && data) setQuote(data as unknown as PriceQuote);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error("Error resolving price quote:", error);
    } finally {
      setQuoteLoading(false);
    }
  }, [userId, serviceId]);

  const handlePayment = useCallback(async () => {
    // Prevent double submission with ref check
    if (loading || isSubmittingRef.current) {
      if (import.meta.env.DEV) console.log('Payment already in progress, ignoring click');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    onPaymentStart?.();

    try {
      if (import.meta.env.DEV) console.log('Initiating TAP payment...', { serviceId, userId, isRenewal });

      const { data, error } = await supabase.functions.invoke('create-tap-payment', {
        body: {
          serviceId,
          userId,
          customerEmail: userEmail,
          customerName: userName,
          isRenewal,
        },
      });

      if (error) throw error;

      if (data.success && data.paymentUrl) {
        // Keep loading state while redirecting - user will leave page
        toast({
          title: "Redirecting to payment...",
          description: "You'll be taken to TAP Payments to complete your transaction.",
        });

        // Small delay to show toast before redirect
        setTimeout(() => {
          window.location.href = data.paymentUrl;
        }, 300);
      } else {
        throw new Error(data.error || 'Failed to create payment');
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }, [loading, serviceId, userId, userEmail, userName, isRenewal, onPaymentStart, toast]);

  const priceLabel = quote ? `${quote.price_kwd} KWD` : null;

  return (
    <>
      <Button
        onClick={openConfirm}
        disabled={loading}
        variant="gradient"
        className={className}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Redirecting...
          </>
        ) : (
          <>
            <CreditCard className="mr-2 h-4 w-4" />
            Complete Payment
          </>
        )}
      </Button>

      <Dialog open={confirmOpen} onOpenChange={(open) => !loading && setConfirmOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5 text-primary" />
              Confirm your coaching plan
            </DialogTitle>
            <DialogDescription>
              {quoteLoading
                ? "Resolving your price..."
                : quote
                  ? quote.coach_assigned
                    ? `You've been matched with ${quote.coach_display_name || "your coach"}${
                        quote.coach_level ? ` (${LEVEL_LABELS[quote.coach_level] ?? quote.coach_level} coach)` : ""
                      }. Your price for ${quote.service_name || "this plan"} is ${priceLabel}/month.`
                    : `Your price for ${quote.service_name || "this plan"} is ${priceLabel}/month.`
                  : "Please confirm to continue to payment."}
            </DialogDescription>
          </DialogHeader>

          <label className="flex items-start gap-2 cursor-pointer py-2">
            <Checkbox
              checked={confirmed}
              onCheckedChange={(v) => setConfirmed(v === true)}
              disabled={quoteLoading}
              className="mt-0.5"
            />
            <span className="text-sm">
              I understand and agree to be charged{priceLabel ? ` ${priceLabel}` : ""} for this month.
            </span>
          </label>

          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={loading}>
              Cancel
            </Button>
            <Button
              onClick={handlePayment}
              disabled={loading || quoteLoading || !confirmed}
              variant="gradient"
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Redirecting...
                </>
              ) : (
                <>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Confirm &amp; Pay
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
