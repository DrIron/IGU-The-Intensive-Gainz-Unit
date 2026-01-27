import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, AlertCircle, FileText, CreditCard } from "lucide-react";
import { PaymentButton } from "./PaymentButton";
import { EnhancedProgressTracker } from "./EnhancedProgressTracker";
import { formatProfileStatus, getProfileStatusVariant } from "@/lib/statusUtils";

export function OnboardingStatus() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<{
    formSubmitted: boolean;
    documentsUploaded: boolean;
    documentsVerified: boolean;
    paymentEnabled: boolean;
    paymentExempt: boolean;
    profileStatus: string;
    serviceId?: string;
    planName?: string;
    planType?: string;
    subscriptionStatus?: string;
    tapSubscriptionStatus?: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    loadStatus();
    
    // Set up interval to refresh status every 3 seconds
    const interval = setInterval(loadStatus, 3000);
    
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setUser(user);

      // Use profiles_public for client-facing status check (RLS protected)
      const { data: profile } = await supabase
        .from('profiles_public')
        .select('status, payment_exempt')
        .eq('id', user.id)
        .single();

      const { data: submission } = await supabase
        .from('form_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Get latest subscription with status and service details
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select('service_id, status, tap_subscription_status, services(name, type)')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      // Profile status is synced server-side via RLS and triggers
      // Client cannot directly update their own status
      let profileStatus = profile?.status || 'pending';

      // Resolve serviceId fallback by plan name if needed (useful for fresh team plan submissions)
      let resolvedServiceId: string | undefined = subscription?.service_id as string | undefined;
      const planName = submission?.plan_name as string | undefined;
      if (!resolvedServiceId && planName) {
        const { data: serviceByName } = await supabase
          .from('services')
          .select('id')
          .eq('name', planName)
          .maybeSingle();
        if (serviceByName?.id) resolvedServiceId = serviceByName.id;
      }

      const planNameResolved = submission?.plan_name || (subscription as any)?.services?.name;
      const planTypeResolved = (subscription as any)?.services?.type as string | undefined;

      setStatus({
        formSubmitted: !!submission,
        documentsUploaded: false, // No longer tracking document uploads
        documentsVerified: true, // Auto-verify since no documents needed
        paymentEnabled: submission?.payment_enabled || false,
        paymentExempt: profile?.payment_exempt || false, // Check if exempt from payment
        profileStatus: profileStatus,
        serviceId: resolvedServiceId,
        planName: planNameResolved,
        planType: planTypeResolved,
        subscriptionStatus: subscription?.status as string | undefined,
        tapSubscriptionStatus: subscription?.tap_subscription_status as string | undefined,
      });
    } catch (error) {
      console.error('Error loading status:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return null;
  if (!status) return null;

  const isTeamPlan = ['fe squad', 'bunz of steel'].includes((status.planName || '').toLowerCase()) || (status.planType === 'team');
  
  const getStatusIcon = (completed: boolean) => {
    return completed ? (
      <CheckCircle2 className="h-5 w-5 text-green-600" />
    ) : (
      <Clock className="h-5 w-5 text-muted-foreground" />
    );
  };

  // Determine if payment button should be shown
  const paymentFailed = status.subscriptionStatus === 'failed' || status.tapSubscriptionStatus === 'FAILED';
  const paymentCancelled = status.subscriptionStatus === 'cancelled' || status.tapSubscriptionStatus === 'CANCELLED';
  const paymentDeclined = status.tapSubscriptionStatus === 'DECLINED';
  const needsPayment = status.profileStatus === 'pending_payment' || paymentFailed || paymentCancelled || paymentDeclined;
  
  // For team plans: show payment when form submitted and needs payment
  const showPaymentForTeamPlan = isTeamPlan && status.formSubmitted && needsPayment;

  const getStatusBadge = () => {
    return (
      <Badge variant={getProfileStatusVariant(status.profileStatus)}>
        {formatProfileStatus(status.profileStatus)}
      </Badge>
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Registration Status</CardTitle>
          {getStatusBadge()}
        </div>
        <CardDescription>
          Track your onboarding progress
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Enhanced Progress Tracker - Different for team plans */}
        <EnhancedProgressTracker
          formSubmitted={status.formSubmitted}
          documentsUploaded={isTeamPlan ? true : status.documentsUploaded}
          documentsVerified={isTeamPlan ? true : status.documentsVerified}
          paymentCompleted={status.profileStatus === 'active'}
          currentStatus={status.profileStatus}
          isTeamPlan={isTeamPlan}
        />

        {/* Detailed steps */}
        <div className="space-y-4">
          <div className="flex items-center gap-3">
          {getStatusIcon(status.formSubmitted)}
          <div className="flex-1">
            <p className="font-medium">Registration Form</p>
            <p className="text-sm text-muted-foreground">
              {status.formSubmitted ? 'Completed' : 'Not submitted'}
            </p>
          </div>
          {!status.formSubmitted && (
            <Button size="sm" onClick={() => navigate('/onboarding')}>
              Start
            </Button>
          )}
        </div>

        {!isTeamPlan && (
          <div className="flex items-center gap-3">
            {getStatusIcon(status.documentsUploaded)}
            <div className="flex-1">
              <p className="font-medium">Documents Upload</p>
              <p className="text-sm text-muted-foreground">
                {status.documentsUploaded ? 'Both documents uploaded' : 'Required documents pending'}
              </p>
            </div>
          </div>
        )}

        {!isTeamPlan && (
          <div className="flex items-center gap-3">
            {getStatusIcon(status.documentsVerified)}
            <div className="flex-1">
              <p className="font-medium">Coach Verification</p>
              <p className="text-sm text-muted-foreground">
                {status.documentsVerified ? 'Documents approved' : 'Awaiting coach review'}
              </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {getStatusIcon(status.profileStatus === 'active')}
          <div className="flex-1">
            <p className="font-medium">Payment & Activation</p>
            <p className="text-sm text-muted-foreground">
              {status.profileStatus === 'active' ? 'Account active' : 
               isTeamPlan ? (status.formSubmitted ? 'Complete payment to activate' : 'Complete form first') :
               status.paymentEnabled ? 'Ready for payment' : 'Payment pending verification'}
            </p>
          </div>
        </div>

        {status.profileStatus === 'needs_medical_review' && (
          <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-yellow-900 dark:text-yellow-100">Medical Review Required</p>
                <p className="text-sm text-yellow-800 dark:text-yellow-200 mt-1">
                  Your PAR-Q responses require medical clearance before proceeding. A coach will contact you shortly.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Payment Failed/Cancelled Notification */}
        {(paymentFailed || paymentCancelled || paymentDeclined) && status.profileStatus !== 'active' && (
          <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-red-900 dark:text-red-100">
                  {paymentCancelled ? 'Payment Cancelled' : 'Payment Failed'}
                </p>
                <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                  {paymentCancelled 
                    ? 'Your payment was cancelled. Please complete the payment to activate your account.'
                    : 'Your payment could not be processed. Please try again or contact support if the issue persists.'}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Show payment button when needed - hide if payment exempt */}
        {!status.paymentExempt && ((isTeamPlan && showPaymentForTeamPlan) || (!isTeamPlan && needsPayment)) && 
         status.serviceId && user && status.profileStatus !== 'active' && (
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <CreditCard className="h-5 w-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-medium text-blue-900 dark:text-blue-100">
                  {paymentFailed || paymentCancelled || paymentDeclined ? 'Retry Payment' : 'Payment Required'}
                </p>
                <p className="text-sm text-blue-800 dark:text-blue-200 mt-1 mb-3">
                  {paymentFailed || paymentCancelled || paymentDeclined
                    ? `Please retry your payment to activate your ${status.planName} subscription.`
                    : isTeamPlan 
                      ? `Complete your payment to activate your ${status.planName} subscription. You'll be added to TrueCoach within 48 hours.`
                      : `Complete your payment to activate your ${status.planName} subscription.`
                  }
                </p>
                <PaymentButton
                  serviceId={status.serviceId}
                  userId={user.id}
                  userEmail={user.email || ''}
                  userName={user.user_metadata?.full_name || ''}
                  className="w-full sm:w-auto"
                />
              </div>
            </div>
          </div>
        )}

        {status.profileStatus === 'active' && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 mt-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-green-900 dark:text-green-100">Account Active</p>
                <p className="text-sm text-green-800 dark:text-green-200 mt-1">
                  {isTeamPlan 
                    ? "Your account is active! You'll be added to TrueCoach within 48 hours. Please download the TrueCoach app from the App Store. If you're not added within 48 hours, contact Dr. Iron."
                    : "Your account has been activated! You will be added to TrueCoach within 48 hours. Please download the TrueCoach app from the App Store. If you're not added within 48 hours, contact Dr. Iron."
                  }
                </p>
              </div>
            </div>
          </div>
        )}
        </div>
      </CardContent>
    </Card>
  );
}
