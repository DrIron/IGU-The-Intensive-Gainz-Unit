import { useState, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Loader2 } from "lucide-react";

interface PaymentButtonProps {
  serviceId: string;
  userId: string;
  userEmail: string;
  userName: string;
  className?: string;
  isRenewal?: boolean;
  onPaymentStart?: () => void;
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
  const isSubmittingRef = useRef(false); // Prevent double-click race conditions
  const { toast } = useToast();

  const handlePayment = useCallback(async () => {
    // Prevent double submission with ref check
    if (loading || isSubmittingRef.current) {
      console.log('Payment already in progress, ignoring click');
      return;
    }

    isSubmittingRef.current = true;
    setLoading(true);
    onPaymentStart?.();

    try {
      console.log('Initiating TAP payment...', { serviceId, userId, isRenewal });

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
      console.error('Payment error:', error);
      toast({
        title: "Payment Error",
        description: error.message || "We couldn't start your payment session. Please try again.",
        variant: "destructive",
      });
      setLoading(false);
      isSubmittingRef.current = false;
    }
  }, [loading, serviceId, userId, userEmail, userName, isRenewal, onPaymentStart, toast]);

  return (
    <Button
      onClick={handlePayment}
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
  );
}
