import { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar, getClientMobileNavItems } from "./ClientSidebar";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { OnboardingStatus } from "@/components/OnboardingStatus";
import { PaymentButton } from "@/components/PaymentButton";
import { SubscriptionManagement } from "@/components/SubscriptionManagement";
import { NewClientOverview } from "./NewClientOverview";
import { PaymentStatusDashboard } from "@/components/PaymentStatusDashboard";
import { CancelledSubscriptionCard } from "./CancelledSubscriptionCard";
import { GracePeriodBanner } from "./GracePeriodBanner";
import { WelcomeModal } from "./WelcomeModal";
import { User, CreditCard, Calendar, AlertCircle, Dumbbell, Calculator, Apple, Loader2, Lock } from "lucide-react";
import { formatProfileStatus, getProfileStatusVariant } from "@/lib/statusUtils";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ClientDashboardLayoutProps {
  user: any;
  profile: any;
  subscription: any;
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

export function ClientDashboardLayout({ 
  user, 
  profile, 
  subscription,
  activeSection: externalActiveSection,
  onSectionChange: externalOnSectionChange
}: ClientDashboardLayoutProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [internalActiveSection, setInternalActiveSection] = useState("overview");
  const [verifying, setVerifying] = useState(false);
  const navigate = useNavigate();
  const { toast } = useToast();

  // Sync section from URL on mount and changes
  useEffect(() => {
    const sectionParam = searchParams.get("section");
    if (sectionParam && sectionParam !== internalActiveSection) {
      setInternalActiveSection(sectionParam);
    }
  }, [searchParams, internalActiveSection]);

  const activeSection = externalActiveSection || internalActiveSection;
  
  const setActiveSection = (section: string) => {
    if (externalOnSectionChange) {
      externalOnSectionChange(section);
    } else {
      setInternalActiveSection(section);
      // Update URL param for persistence
      const newParams = new URLSearchParams(searchParams);
      if (section === "overview") {
        newParams.delete("section");
      } else {
        newParams.set("section", section);
      }
      setSearchParams(newParams, { replace: true });
    }
  };

  // Strict state machine - derived from profile + subscription status
  const status = profile?.status;
  const hasSubscription = !!subscription;
  const subStatus = subscription?.status;
  const isCancelled = status === 'cancelled' || subStatus === 'cancelled';
  const isExpired = status === 'expired' || subStatus === 'expired';

  const isPending = status === "pending";
  const isNeedsMedicalReview = status === "needs_medical_review";
  const isPendingCoachApproval = status === "pending_coach_approval";
  const isLegacyApproved = status === "approved";
  const isPendingPayment = status === "pending_payment" || isLegacyApproved;
  const isActive = status === "active" && subStatus === "active";
  const isInactiveLike = status === "inactive" || subStatus === "inactive";
  const isSuspended = status === "suspended";
  
  // Grace period state: subscription past_due but profile still active
  const isPastDue = subStatus === "past_due";
  const isInGracePeriod = isPastDue && status === "active";
  const isHardLocked = status === "inactive" && subStatus === "inactive";

  // Fallback verify-payment check on mount (handles edge cases like returning from payment gateway)
  useEffect(() => {
    const verifyPaymentFallback = async () => {
      // Only run if we have a pending payment status but subscription might be stale
      if (!user?.id || isActive) return;
      
      // Check URL for payment return indicators
      const urlParams = new URLSearchParams(window.location.search);
      const hasTapId = urlParams.get('tap_id') || urlParams.get('charge_id');
      
      if (hasTapId) {
        setVerifying(true);
        try {
          const { data, error } = await supabase.functions.invoke('verify-payment', {
            body: { userId: user.id },
          });
          
          if (!error && data?.status === 'active') {
            toast({
              title: "Payment Verified",
              description: "Your subscription is now active!",
            });
            // Navigate to refresh the dashboard with new subscription status
            navigate('/dashboard', { replace: true });
          }
        } catch (err) {
          console.error('Fallback payment verification failed:', err);
        } finally {
          setVerifying(false);
        }
      }
    };

    verifyPaymentFallback();
  }, [user?.id, isActive, navigate, toast]);

  // 0. Verifying payment fallback - show loading
  if (verifying) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto p-8">
            <div className="max-w-7xl mx-auto flex flex-col items-center justify-center gap-4 py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-muted-foreground">Verifying payment status...</p>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 1. No profile → loading
  if (!profile) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto p-8">
            <div className="max-w-7xl mx-auto space-y-4">
              <div className="h-8 bg-muted animate-pulse rounded" />
              <div className="h-64 bg-muted animate-pulse rounded" />
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 2. isPending && !hasSubscription → Complete onboarding
  if (isPending && !hasSubscription) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <Alert className="border-primary/50 bg-primary/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Complete Your Registration</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>Please complete your onboarding form to continue with your membership.</p>
                    <Button onClick={() => navigate('/onboarding')} className="mt-2">
                      Complete Sign-Up Form
                    </Button>
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 3. isNeedsMedicalReview → Medical review required
  if (isNeedsMedicalReview) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} isPendingApproval={true} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <Alert className="border-amber-500/50 bg-amber-500/10">
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                  <AlertTitle>Medical Review Required</AlertTitle>
                  <AlertDescription>
                    Your application requires medical clearance based on your PAR-Q responses. Our team will review your information and contact you shortly. This typically takes 24-48 hours.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 4. isPendingCoachApproval && hasSubscription && subStatus === "pending" → Waiting for coach approval
  if (isPendingCoachApproval && hasSubscription && subStatus === "pending") {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} isPendingApproval={true} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <Alert className="border-blue-500/50 bg-blue-500/10">
                  <AlertCircle className="h-4 w-4 text-blue-500" />
                  <AlertTitle>Waiting for Coach Approval</AlertTitle>
                  <AlertDescription>
                    Your application is under review by your coach. You'll receive a notification once approved. This typically takes 24-48 hours.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 5. isPendingPayment && hasSubscription && subStatus === "pending" → Payment required
  if (isPendingPayment && hasSubscription && subStatus === "pending") {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <PaymentStatusDashboard userId={user.id} />
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 6. isSuspended → Account suspended
  if (isSuspended) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <Alert className="border-destructive/50 bg-destructive/10">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Account Suspended</AlertTitle>
                  <AlertDescription>
                    Your account has been suspended. Please contact support for more information.
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 7. Both profile and subscription cancelled → Dedicated membership cancelled UI
  const isCancelledBoth = status === "cancelled" && subStatus === "cancelled";
  if (isCancelledBoth) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <Card className="border-amber-500/50 bg-amber-500/10">
                  <CardHeader>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-amber-500" />
                      <CardTitle>Membership Cancelled</CardTitle>
                    </div>
                    <CardDescription className="text-foreground/80">
                      Your previous plan has been cancelled. You can rejoin anytime by choosing a new plan.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-col sm:flex-row gap-3">
                      <Button 
                        onClick={() => navigate('/services')}
                        className="flex-1"
                      >
                        Browse Plans
                      </Button>
                      <Button 
                        onClick={() => window.location.href = 'mailto:support@theigu.com'}
                        variant="outline"
                        className="flex-1"
                      >
                        Contact Support
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 8. isCancelled || isExpired → Other cancelled/expired cases
  if (isCancelled || isExpired) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <CancelledSubscriptionCard
                  status={status}
                  subStatus={subStatus}
                />
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 9. isHardLocked → Account locked due to non-payment (Day 8+)
  if (isHardLocked && !isCancelled && !isExpired) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <Alert className="border-destructive/50 bg-destructive/10">
                  <Lock className="h-5 w-5" />
                  <AlertTitle className="text-lg">Subscription Inactive</AlertTitle>
                  <AlertDescription className="space-y-4 mt-2">
                    <p className="text-base">
                      Your subscription is inactive due to non-payment. 
                      Renew now to regain instant access to all your coaching features.
                    </p>
                    <div className="flex flex-wrap gap-3 mt-4">
                      <Button onClick={() => navigate('/billing/pay')} variant="gradient">
                        <CreditCard className="h-4 w-4 mr-2" />
                        Renew Now
                      </Button>
                      <Button onClick={() => window.location.href = 'mailto:support@theigu.com'} variant="outline">
                        Contact Support
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }
  
  // 9b. isInactiveLike but not hard locked → Other inactive states
  if (isInactiveLike && !isCancelled && !isExpired && !isHardLocked) {
    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
          <main className="flex-1 overflow-auto">
            <div className="p-4 md:p-6">
              <div className="max-w-7xl mx-auto">
                <Alert className="border-warning/50 bg-warning/10">
                  <AlertCircle className="h-4 w-4 text-warning" />
                  <AlertTitle>Subscription Inactive</AlertTitle>
                  <AlertDescription className="space-y-3">
                    <p>Your subscription is currently inactive. This may be due to a payment issue or account change.</p>
                    <div className="flex gap-2 mt-4">
                      <Button onClick={() => navigate('/billing/pay')}>
                        Reactivate Subscription
                      </Button>
                      <Button onClick={() => window.location.href = 'mailto:support@theigu.com'} variant="outline">
                        Contact Support
                      </Button>
                    </div>
                  </AlertDescription>
                </Alert>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    );
  }

  // 10. isActive OR isInGracePeriod → Full client dashboard (with banner during grace)
  // Grace period allows full viewing access but restricts some actions
  if (isActive || isInGracePeriod) {
    const renderContent = () => {
      switch (activeSection) {
        case "overview":
          return <NewClientOverview 
            user={user}
            profile={profile} 
            subscription={subscription}
          />;
        case "subscription":
          return <SubscriptionSection subscription={subscription} user={user} profile={profile} navigate={navigate} />;
        case "nutrition":
          navigate("/nutrition");
          return null;
        case "sessions":
          // During grace period, show message instead of navigating
          if (isInGracePeriod) {
            return (
              <Alert className="border-warning/50 bg-warning/10">
                <AlertCircle className="h-4 w-4 text-warning" />
                <AlertTitle>Session Booking Restricted</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>New session bookings are temporarily unavailable while your payment is past due.</p>
                  <Button onClick={() => navigate('/billing/pay')} variant="gradient" size="sm">
                    <CreditCard className="h-4 w-4 mr-2" />
                    Pay Now to Resume Booking
                  </Button>
                </AlertDescription>
              </Alert>
            );
          }
          navigate("/sessions");
          return null;
        case "exercises":
          navigate("/workout-library");
          return null;
        case "educational-videos":
          navigate("/educational-videos");
          return null;
        case "profile":
          return <ProfileSection profile={profile} />;
        default:
          return <NewClientOverview 
            user={user}
            profile={profile} 
            subscription={subscription}
          />;
      }
    };

    const getSectionTitle = (section: string): string => {
      const titles: Record<string, string> = {
        overview: "Track your progress and access resources",
        subscription: "Manage your subscription and billing",
        profile: "View and edit your profile information",
      };
      return titles[section] || "Track your progress and access resources";
    };

    return (
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <ClientSidebar 
            activeSection={activeSection} 
            onSectionChange={setActiveSection}
            isPendingApproval={false}
            profile={profile}
            subscription={subscription}
            sessionBookingEnabled={subscription?.session_booking_enabled === true}
          />
          <main className="flex-1 overflow-auto">
            {/* Welcome modal — shown once on first active dashboard load */}
            {isActive && user?.id && (
              <WelcomeModal
                userId={user.id}
                firstName={profile?.first_name || profile?.full_name || ""}
                subscription={subscription}
              />
            )}
            <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 md:p-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="md:hidden" />
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl md:text-3xl font-bold truncate">Welcome, {profile?.first_name || profile?.full_name}!</h1>
                  <p className="text-sm text-muted-foreground truncate">
                    {getSectionTitle(activeSection)}
                  </p>
                </div>
              </div>
            </div>
            <div className="p-4 md:p-6 pb-24 md:pb-8 safe-area-bottom">
              <div className="max-w-7xl mx-auto">
                {/* Grace Period Banner - shows during soft lock */}
                {isInGracePeriod && (
                  <GracePeriodBanner subscription={subscription} profile={profile} />
                )}
                {renderContent()}
              </div>
            </div>
          </main>
          {/* Mobile Bottom Navigation */}
          <MobileBottomNav items={getClientMobileNavItems()} />
        </div>
      </SidebarProvider>
    );
  }

  // 11. Unexpected state → Generic error
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
        <ClientSidebar activeSection={activeSection} onSectionChange={setActiveSection} profile={profile} subscription={subscription} />
        <main className="flex-1 overflow-auto">
          <div className="p-4 md:p-6 pb-8 safe-area-bottom">
            <div className="max-w-7xl mx-auto">
              <Alert className="border-destructive/50 bg-destructive/10">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Subscription Issue Detected</AlertTitle>
                <AlertDescription className="space-y-3">
                  <p>We detected an unexpected account state. Please contact support or restart onboarding.</p>
                  <p className="text-xs text-muted-foreground">Status: {formatProfileStatus(status)}, Subscription: {subStatus ? formatProfileStatus(subStatus) : 'none'}</p>
                  <div className="flex gap-2 mt-4">
                    <Button onClick={() => navigate('/onboarding')} variant="outline">
                      Restart Onboarding
                    </Button>
                    <Button onClick={() => window.location.href = 'mailto:support@theigu.com'}>
                      Contact Support
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}


function OverviewSection({ profile, subscription, user, needsOnboarding, navigate, setActiveSection }: any) {
  const isPending = profile?.status === "pending";
  const fullName = profile?.first_name || profile?.full_name;

  return (
    <div className="space-y-6">
      {needsOnboarding && subscription?.service_id && (
        <>
          <Alert className="border-accent/50 bg-accent/10">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Complete Payment</AlertTitle>
            <AlertDescription>
              Please complete your payment to activate your subscription.
            </AlertDescription>
          </Alert>
          
          <Card className="border-border/50 shadow-2xl">
            <CardHeader className="text-center">
              <div className="flex justify-center mb-4">
                <div className="p-3 rounded-full bg-gradient-to-r from-primary to-accent">
                  <Dumbbell className="h-8 w-8 text-white" />
                </div>
              </div>
              <CardTitle className="text-2xl font-bold">Complete Your Payment</CardTitle>
              <CardDescription>
                Activate your {subscription.services.name} subscription
              </CardDescription>
            </CardHeader>
            <CardContent className="text-center">
              <div className="mb-6">
                <p className="text-2xl font-bold mb-2">{subscription.services.price_kwd} KWD/month</p>
                <p className="text-muted-foreground">{subscription.services.name}</p>
              </div>
              {user && (
              <PaymentButton
                  serviceId={subscription.service_id}
                  userId={user.id}
                  userEmail={user.email || ''}
                  userName={fullName || ''}
                  className="w-full max-w-md mx-auto"
                />
              )}
            </CardContent>
          </Card>
        </>
      )}

      {subscription?.status === "active" && profile?.status === "pending" && (
        <Alert className="border-primary/50 bg-primary/10">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Onboarding Submitted</AlertTitle>
          <AlertDescription>
            Thank you for submitting your onboarding form! A coach will review your information and activate your account shortly.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Account Status</CardTitle>
            <User className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={getProfileStatusVariant(profile?.status)} className="mt-2">
              {formatProfileStatus(profile?.status)}
            </Badge>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Plan</CardTitle>
            <CreditCard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {subscription ? (
              <div className="mt-2">
                <p className="text-lg font-bold">{subscription.services.name}</p>
                <p className="text-sm text-muted-foreground">{subscription.services.price_kwd} KWD/month</p>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">No active subscription</p>
            )}
          </CardContent>
        </Card>

        <Card 
          className="border-border/50 hover:border-primary/50 transition-colors cursor-pointer"
          onClick={() => setActiveSection("subscription")}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Next Billing</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {subscription?.next_billing_date ? (
              <p className="text-lg font-bold mt-2">
                {new Date(subscription.next_billing_date).toLocaleDateString()}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground mt-2">N/A</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        <Card 
          className={`border-border/50 transition-colors ${
            profile?.status === 'active' && subscription?.status === 'active' 
              ? 'hover:border-primary/50 cursor-pointer' 
              : 'opacity-50 cursor-not-allowed'
          }`}
          onClick={() => {
            if (profile?.status === 'active' && subscription?.status === 'active') {
              navigate("/nutrition");
            }
          }}
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <Apple className="h-5 w-5 text-primary" />
              <CardTitle>Nutrition & Calculator</CardTitle>
            </div>
            <CardDescription>
              {profile?.status === 'active' && subscription?.status === 'active'
                ? 'Track nutrition and calculate calories'
                : 'Available after subscription activation'}
            </CardDescription>
          </CardHeader>
        </Card>

        <Card 
          className={`border-border/50 transition-colors ${
            profile?.status === 'active' && subscription?.status === 'active' 
              ? 'hover:border-primary/50 cursor-pointer' 
              : 'opacity-50 cursor-not-allowed'
          }`}
          onClick={() => {
            if (profile?.status === 'active' && subscription?.status === 'active') {
              navigate("/workout-library");
            }
          }}
        >
          <CardHeader>
            <div className="flex items-center gap-2">
              <Dumbbell className="h-5 w-5 text-primary" />
              <CardTitle>Exercise Library</CardTitle>
            </div>
            <CardDescription>
              {profile?.status === 'active' && subscription?.status === 'active'
                ? 'Access exercise demonstrations'
                : 'Available after subscription activation'}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    </div>
  );
}

function SubscriptionSection({ subscription, user, profile, navigate }: any) {
  return (
    <div className="space-y-6">
      {subscription && (subscription.status === 'active' || subscription.cancel_at_period_end) && user && (
        <SubscriptionManagement 
          subscription={subscription} 
          userId={user.id}
        />
      )}
      
      {profile?.status !== 'active' && <OnboardingStatus />}
      
      {!subscription && (
        <Card>
          <CardHeader>
            <CardTitle>No Active Subscription</CardTitle>
            <CardDescription>You don't have an active subscription yet.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => navigate("/services")}>
              Browse Services
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}


function ProfileSection({ profile }: any) {
  const fullName = `${profile?.first_name || ''} ${profile?.last_name || ''}`.trim() || profile?.full_name;
  
  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Information</CardTitle>
        <CardDescription>View your account details</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Full Name</p>
          <p className="text-lg">{fullName}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Email</p>
          <p className="text-lg">{profile?.email}</p>
        </div>
        <div>
          <p className="text-sm font-medium text-muted-foreground">Account Status</p>
          <Badge variant={getProfileStatusVariant(profile?.status)}>
            {formatProfileStatus(profile?.status)}
          </Badge>
        </div>
      </CardContent>
    </Card>
  );
}
