import { useEffect, useState, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  AlertTriangle,
  RefreshCw,
  ArrowRight
} from "lucide-react";

type VerificationState = 'verifying' | 'success' | 'pending' | 'failed' | 'error';

export default function PaymentReturn() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [state, setState] = useState<VerificationState>('verifying');
  const [message, setMessage] = useState<string>("");
  const [retryCount, setRetryCount] = useState(0);
  const verificationAttemptedRef = useRef(false);
  const maxRetries = 3;

  useEffect(() => {
    // Prevent double verification
    if (verificationAttemptedRef.current) return;
    verificationAttemptedRef.current = true;
    
    verifyPayment();
  }, []);

  const verifyPayment = async () => {
    setState('verifying');
    
    try {
      // Get user session
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setState('error');
        setMessage("Please log in to verify your payment.");
        return;
      }

      // Get TAP charge ID from URL params
      const tapChargeId = searchParams.get('tap_id') || searchParams.get('charge_id');
      
      console.log('Verifying payment...', { userId: user.id, tapChargeId });

      const { data, error } = await supabase.functions.invoke('verify-payment', {
        body: { 
          userId: user.id,
          chargeId: tapChargeId || undefined,
        },
      });

      if (error) {
        console.error('Verification error:', error);
        throw error;
      }

      console.log('Verification response:', data);

      if (data?.status === 'active') {
        // Payment successful!
        setState('success');
        setMessage(data.message || "Your subscription is now active!");
        
        toast({
          title: "🎉 Payment Successful!",
          description: "Welcome to IGU! Your subscription is now active.",
        });
        
        // Redirect to dashboard after showing success
        setTimeout(() => {
          navigate('/dashboard', { replace: true });
        }, 3000);
        return;
      }

      if (data?.status === 'pending' || data?.status === 'no_payment') {
        // Payment still processing or no payment found
        setState('pending');
        setMessage(data.message || "Your payment is being processed. This may take a moment.");
        return;
      }

      if (data?.status === 'failed') {
        // Payment failed
        setState('failed');
        setMessage(data.message || "Payment was not successful. Please try again.");
        return;
      }

      // Unknown status - treat as pending
      setState('pending');
      setMessage("We're verifying your payment status. Please wait a moment.");

    } catch (err: any) {
      console.error('Payment verification error:', err);
      setState('error');
      setMessage("We couldn't verify your payment status. Please try again.");
    }
  };

  const handleRetry = () => {
    if (retryCount < maxRetries) {
      setRetryCount(prev => prev + 1);
      verificationAttemptedRef.current = false;
      verifyPayment();
    }
  };

  const handleGoToDashboard = () => {
    navigate('/dashboard', { replace: true });
  };

  const handleRetryPayment = () => {
    navigate('/billing/pay', { replace: true });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-4">
      <Card className="max-w-md w-full border-2 border-primary/20 shadow-lg">
        <CardHeader className="text-center">
          {state === 'verifying' && (
            <>
              <div className="mx-auto mb-4">
                <Loader2 className="h-16 w-16 animate-spin text-primary" />
              </div>
              <CardTitle className="text-2xl">Verifying Payment</CardTitle>
              <CardDescription>
                Please wait while we confirm your payment...
              </CardDescription>
            </>
          )}

          {state === 'success' && (
            <>
              <div className="mx-auto mb-4">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>
              <CardTitle className="text-2xl text-green-700 dark:text-green-400">
                Payment Successful!
              </CardTitle>
              <CardDescription className="text-base">
                {message}
              </CardDescription>
            </>
          )}

          {state === 'pending' && (
            <>
              <div className="mx-auto mb-4">
                <Loader2 className="h-16 w-16 animate-spin text-yellow-500" />
              </div>
              <CardTitle className="text-2xl text-yellow-700 dark:text-yellow-400">
                Processing Payment
              </CardTitle>
              <CardDescription className="text-base">
                {message}
              </CardDescription>
            </>
          )}

          {state === 'failed' && (
            <>
              <div className="mx-auto mb-4">
                <XCircle className="h-16 w-16 text-destructive" />
              </div>
              <CardTitle className="text-2xl text-destructive">
                Payment Failed
              </CardTitle>
              <CardDescription className="text-base">
                {message}
              </CardDescription>
            </>
          )}

          {state === 'error' && (
            <>
              <div className="mx-auto mb-4">
                <AlertTriangle className="h-16 w-16 text-orange-500" />
              </div>
              <CardTitle className="text-2xl text-orange-700 dark:text-orange-400">
                Verification Error
              </CardTitle>
              <CardDescription className="text-base">
                {message}
              </CardDescription>
            </>
          )}
        </CardHeader>

        <CardContent className="space-y-4">
          {state === 'success' && (
            <div className="text-center space-y-4">
              <p className="text-sm text-muted-foreground">
                Redirecting to your dashboard...
              </p>
              <Button onClick={handleGoToDashboard} variant="gradient" className="w-full">
                Go to Dashboard Now
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {state === 'pending' && (
            <div className="space-y-4">
              <Alert className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
                <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />
                <AlertDescription className="ml-2">
                  Your payment is being processed by the payment provider. 
                  This usually takes a few seconds.
                </AlertDescription>
              </Alert>
              
              <div className="flex gap-3">
                <Button 
                  onClick={handleRetry} 
                  variant="outline" 
                  className="flex-1"
                  disabled={retryCount >= maxRetries}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Check Again
                </Button>
                <Button onClick={handleGoToDashboard} variant="secondary" className="flex-1">
                  Go to Dashboard
                </Button>
              </div>

              {retryCount > 0 && (
                <p className="text-xs text-center text-muted-foreground">
                  Verification attempt {retryCount + 1} of {maxRetries + 1}
                </p>
              )}
            </div>
          )}

          {state === 'failed' && (
            <div className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription className="ml-2">
                  Your payment wasn't completed. No charges were made to your card.
                </AlertDescription>
              </Alert>
              
              <div className="flex gap-3">
                <Button onClick={handleRetryPayment} variant="gradient" className="flex-1">
                  Try Again
                </Button>
                <Button onClick={handleGoToDashboard} variant="outline" className="flex-1">
                  Dashboard
                </Button>
              </div>
            </div>
          )}

          {state === 'error' && (
            <div className="space-y-4">
              <div className="flex gap-3">
                <Button 
                  onClick={handleRetry} 
                  variant="outline" 
                  className="flex-1"
                  disabled={retryCount >= maxRetries}
                >
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Retry
                </Button>
                <Button onClick={handleGoToDashboard} variant="secondary" className="flex-1">
                  Go to Dashboard
                </Button>
              </div>

              <p className="text-xs text-center text-muted-foreground">
                If your payment was successful, your subscription will be activated shortly. 
                Check your dashboard or email for confirmation.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
