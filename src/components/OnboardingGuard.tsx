import { useEffect, useState, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { 
  isOnboardingIncomplete, 
  getOnboardingRedirect,
  hasLimitedAccess,
  ClientStatus 
} from "@/auth/onboarding";
import { PageLoadingSkeleton } from "@/components/ui/loading-skeleton";

interface OnboardingGuardProps {
  children: ReactNode;
  /** 
   * If true, allows users with incomplete onboarding to view the page.
   * Useful for the onboarding pages themselves.
   */
  allowIncomplete?: boolean;
  /**
   * If true, allows users with limited access (suspended, cancelled, etc.)
   * to view the page with restrictions.
   */
  allowLimited?: boolean;
}

interface ProfileStatus {
  status: ClientStatus | null;
  hasSubscription: boolean;
  subscriptionStatus: string | null;
}

/**
 * Guard component that enforces onboarding completion.
 * 
 * Redirects users to the appropriate onboarding step if they haven't
 * completed the required steps.
 * 
 * Usage:
 * ```tsx
 * // For dashboard routes - requires complete onboarding
 * <OnboardingGuard>
 *   <Dashboard />
 * </OnboardingGuard>
 * 
 * // For onboarding routes - allow incomplete
 * <OnboardingGuard allowIncomplete>
 *   <OnboardingForm />
 * </OnboardingGuard>
 * ```
 */
export function OnboardingGuard({ 
  children, 
  allowIncomplete = false,
  allowLimited = true 
}: OnboardingGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkOnboardingStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;

        if (!user) {
          // Not authenticated - AuthGuard should handle this
          navigate("/auth", { replace: true });
          return;
        }

        // Fetch profile status
        const { data: profile, error: profileError } = await supabase
          .from("profiles_public")
          .select("status")
          .eq("id", user.id)
          .single();

        if (profileError) {
          console.error("Error fetching profile:", profileError);
          // Profile doesn't exist - user needs to complete onboarding
          if (mounted) {
            setProfileStatus({ status: "new" as ClientStatus, hasSubscription: false, subscriptionStatus: null });
          }
        } else {
          // Fetch subscription status
          const { data: subscription } = await supabase
            .from("subscriptions")
            .select("status")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (mounted) {
            setProfileStatus({
              status: (profile?.status as ClientStatus) || "new",
              hasSubscription: !!subscription,
              subscriptionStatus: subscription?.status || null,
            });
          }
        }
      } catch (error) {
        console.error("Onboarding check error:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    checkOnboardingStatus();

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        navigate("/auth", { replace: true });
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  // Handle redirects after status is loaded
  useEffect(() => {
    if (loading || !profileStatus) return;

    const { status } = profileStatus;

    // If allowing incomplete, skip redirect logic
    if (allowIncomplete) return;

    // Check if onboarding is incomplete
    if (isOnboardingIncomplete(status)) {
      const redirectUrl = getOnboardingRedirect(status);
      
      // Don't redirect if we're already on the correct onboarding page
      if (redirectUrl && !location.pathname.startsWith(redirectUrl.split("?")[0])) {
        navigate(redirectUrl, { replace: true });
        return;
      }
    }

    // Check limited access
    if (!allowLimited && hasLimitedAccess(status)) {
      // Redirect to a page that shows the restricted state
      navigate("/dashboard?restricted=true", { replace: true });
      return;
    }
  }, [loading, profileStatus, allowIncomplete, allowLimited, navigate, location.pathname]);

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  // If onboarding incomplete and not allowing, don't render children
  // (redirect should happen via useEffect)
  if (!allowIncomplete && profileStatus && isOnboardingIncomplete(profileStatus.status)) {
    return <PageLoadingSkeleton />;
  }

  return <>{children}</>;
}

/**
 * Hook to get current onboarding status.
 * Useful for components that need to show different UI based on status.
 */
export function useOnboardingStatus() {
  const [status, setStatus] = useState<ProfileStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const fetchStatus = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          if (mounted) {
            setStatus(null);
            setLoading(false);
          }
          return;
        }

        const { data: profile } = await supabase
          .from("profiles_public")
          .select("status")
          .eq("id", user.id)
          .single();

        const { data: subscription } = await supabase
          .from("subscriptions")
          .select("status")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (mounted) {
          setStatus({
            status: (profile?.status as ClientStatus) || "new",
            hasSubscription: !!subscription,
            subscriptionStatus: subscription?.status || null,
          });
        }
      } catch (error) {
        console.error("Error fetching onboarding status:", error);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    };

    fetchStatus();

    return () => {
      mounted = false;
    };
  }, []);

  return { 
    ...status, 
    loading,
    isComplete: status ? !isOnboardingIncomplete(status.status) : false,
    isLimited: status ? hasLimitedAccess(status.status) : false,
  };
}
