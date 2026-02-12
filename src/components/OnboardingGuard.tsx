import { useEffect, useState, ReactNode } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuthGuardSession } from "@/components/AuthGuard";
import {
  isOnboardingIncomplete,
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
 * Consumes the authenticated session from AuthGuard via context
 * (avoids a redundant getSession() call).
 *
 * Fetches profile + subscription status in parallel for faster loading.
 */
export function OnboardingGuard({
  children,
  allowIncomplete = false,
  allowLimited = true
}: OnboardingGuardProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useAuthGuardSession();
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<ProfileStatus | null>(null);

  useEffect(() => {
    let mounted = true;

    const checkOnboardingStatus = async () => {
      const user = session?.user;

      if (!user) {
        // Not authenticated - AuthGuard should handle this
        navigate("/auth", { replace: true });
        return;
      }

      try {
        // Fetch profile and subscription in parallel (saves ~300ms)
        const [profileResult, subscriptionResult] = await Promise.all([
          supabase
            .from("profiles_public")
            .select("status")
            .eq("id", user.id)
            .single(),
          supabase
            .from("subscriptions")
            .select("status")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (!mounted) return;

        if (profileResult.error) {
          console.error("Error fetching profile:", profileResult.error);
          setProfileStatus({ status: "new" as ClientStatus, hasSubscription: false, subscriptionStatus: null });
        } else {
          setProfileStatus({
            status: (profileResult.data?.status as ClientStatus) || "new",
            hasSubscription: !!subscriptionResult.data,
            subscriptionStatus: subscriptionResult.data?.status || null,
          });
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
  }, [navigate, session]);

  // Handle redirects after status is loaded
  useEffect(() => {
    if (loading || !profileStatus) return;

    const { status } = profileStatus;

    // If allowing incomplete, skip redirect logic
    if (allowIncomplete) return;

    // Check if onboarding is incomplete
    if (isOnboardingIncomplete(status)) {
      // Skip redirect if user just completed payment verification — DB status
      // may still be stale (pending_payment) due to replication lag
      const navState = location.state as { paymentVerified?: boolean } | null;
      if (navState?.paymentVerified && status === "pending_payment") {
        return;
      }

      // Allow dashboard paths — ClientDashboardLayout handles limited UI
      const isDashboardPath = ["/dashboard", "/client", "/client/dashboard"].includes(location.pathname);
      if (isDashboardPath) {
        return;
      }

      // For non-dashboard routes, redirect TO dashboard (not to onboarding)
      navigate("/dashboard", { replace: true });
      return;
    }

    // Check limited access
    if (!allowLimited && hasLimitedAccess(status)) {
      // Redirect to a page that shows the restricted state
      navigate("/dashboard?restricted=true", { replace: true });
      return;
    }
  }, [loading, profileStatus, allowIncomplete, allowLimited, navigate, location.pathname, location.state]);

  if (loading) {
    return <PageLoadingSkeleton />;
  }

  // If onboarding incomplete and not allowing, don't render children
  // (redirect should happen via useEffect)
  // Exceptions: paymentVerified state (DB lag) or dashboard paths (limited UI)
  const navState = location.state as { paymentVerified?: boolean } | null;
  const isDashboardPath = ["/dashboard", "/client", "/client/dashboard"].includes(location.pathname);
  if (!allowIncomplete && profileStatus && isOnboardingIncomplete(profileStatus.status)) {
    if (!(navState?.paymentVerified && profileStatus.status === "pending_payment") && !isDashboardPath) {
      return <PageLoadingSkeleton />;
    }
  }

  return <>{children}</>;
}

/**
 * Hook to get current onboarding status.
 * Useful for components that need to show different UI based on status.
 */
// eslint-disable-next-line react-refresh/only-export-components
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

        // Fetch profile and subscription in parallel
        const [profileResult, subscriptionResult] = await Promise.all([
          supabase
            .from("profiles_public")
            .select("status")
            .eq("id", user.id)
            .single(),
          supabase
            .from("subscriptions")
            .select("status")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (mounted) {
          setStatus({
            status: (profileResult.data?.status as ClientStatus) || "new",
            hasSubscription: !!subscriptionResult.data,
            subscriptionStatus: subscriptionResult.data?.status || null,
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
