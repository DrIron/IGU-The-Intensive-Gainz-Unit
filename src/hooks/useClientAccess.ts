import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface Profile {
  id: string;
  email: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  status: string | null;
  payment_exempt: boolean;
  onboarding_completed_at: string | null;
  activation_completed_at: string | null;
}

interface Service {
  id: string;
  name: string;
  type: string;
  price_kwd: number;
}

interface SubscriptionWithService {
  id: string;
  user_id: string;
  service_id: string;
  coach_id: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  next_billing_date: string | null;
  past_due_since: string | null;
  grace_period_days: number | null;
  billing_amount_kwd: number | null;
  services: Service | null;
}

export interface ClientAccessState {
  loading: boolean;
  error?: string;

  profile: Profile | null;
  subscription: SubscriptionWithService | null;

  // Role flags
  isAdmin: boolean;
  isCoach: boolean;
  isMemberOnly: boolean;

  // Status flags (from profiles.status)
  status: string | null;
  isPending: boolean;
  isNeedsMedicalReview: boolean;
  isPendingCoachApproval: boolean;
  isPendingPayment: boolean; // includes legacy 'approved' mapped to pending_payment
  isActiveStatus: boolean; // profile.status === 'active'
  isInactiveStatus: boolean; // inactive / cancelled / expired
  isSuspended: boolean;

  // Subscription flags (from subscriptions.status)
  subStatus: string | null;
  hasSubscription: boolean;
  hasActiveSubscription: boolean; // profile.status === 'active' && subscription.status === 'active'
  
  // Grace period / billing flags (NEW)
  isPastDue: boolean; // subscription.status === 'past_due'
  isInGracePeriod: boolean; // past_due + profile still active
  isHardLocked: boolean; // both profile and subscription inactive
  gracePeriodDaysRemaining: number | null;

  // Convenience
  isActiveClient: boolean; // true only for active paying client (not admin/coach-only)
  isStaff: boolean; // isAdmin || isCoach
  
  // Access control (derived from status)
  canAccessContent: boolean; // Can view workouts, nutrition, etc.
  canBookSessions: boolean;
  canModifySubscription: boolean;
}

const initialState: ClientAccessState = {
  loading: true,
  error: undefined,
  profile: null,
  subscription: null,
  isAdmin: false,
  isCoach: false,
  isMemberOnly: false,
  status: null,
  isPending: false,
  isNeedsMedicalReview: false,
  isPendingCoachApproval: false,
  isPendingPayment: false,
  isActiveStatus: false,
  isInactiveStatus: false,
  isSuspended: false,
  subStatus: null,
  hasSubscription: false,
  hasActiveSubscription: false,
  isPastDue: false,
  isInGracePeriod: false,
  isHardLocked: false,
  gracePeriodDaysRemaining: null,
  isActiveClient: false,
  isStaff: false,
  canAccessContent: false,
  canBookSessions: false,
  canModifySubscription: false,
};

export function useClientAccess(): ClientAccessState {
  const [state, setState] = useState<ClientAccessState>(initialState);

  useEffect(() => {
    let isMounted = true;

    const fetchAccessData = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user) {
          if (isMounted) {
            setState({
              ...initialState,
              loading: false,
              error: "Not authenticated",
            });
          }
          return;
        }

        const userId = session.user.id;

        // Fetch profile, subscription, and roles in parallel
        // Use profiles_public + profiles_private for client's own data (RLS protected)
        const [profilePublicResult, profilePrivateResult, subscriptionResult, rolesResult] = await Promise.all([
          supabase
            .from("profiles_public")
            .select("id, first_name, display_name, status, payment_exempt, onboarding_completed_at, activation_completed_at")
            .eq("id", userId)
            .single(),
          supabase
            .from("profiles_private")
            .select("email, last_name, full_name")
            .eq("profile_id", userId)
            .single(),
          supabase
            .from("subscriptions")
            .select(`
              id,
              user_id,
              service_id,
              coach_id,
              status,
              start_date,
              end_date,
              next_billing_date,
              past_due_since,
              grace_period_days,
              billing_amount_kwd,
              services (id, name, type, price_kwd)
            `)
            .eq("user_id", userId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", userId),
        ]);

        if (profilePublicResult.error && profilePublicResult.error.code !== "PGRST116") {
          throw new Error(profilePublicResult.error.message);
        }

        // Combine public and private profile data
        const profile = (profilePublicResult.data && profilePrivateResult.data) ? {
          id: profilePublicResult.data.id,
          email: profilePrivateResult.data.email,
          first_name: profilePublicResult.data.first_name,
          last_name: profilePrivateResult.data.last_name,
          full_name: profilePrivateResult.data.full_name,
          display_name: profilePublicResult.data.display_name,
          status: profilePublicResult.data.status,
          payment_exempt: profilePublicResult.data.payment_exempt,
          onboarding_completed_at: profilePublicResult.data.onboarding_completed_at,
          activation_completed_at: profilePublicResult.data.activation_completed_at,
        } as Profile | null : null;
        const subscription = subscriptionResult.data as SubscriptionWithService | null;
        const roles = rolesResult.data || [];

        // Derive role flags
        const isAdmin = roles.some((r: { role: string }) => r.role === "admin");
        const isCoach = roles.some((r: { role: string }) => r.role === "coach");
        const isStaff = isAdmin || isCoach;

        // Derive status from profile
        const status = profile?.status || null;
        const subStatus = subscription?.status || null;

        // Profile status flags (matches ClientDashboardLayout logic)
        const isPending = status === "pending";
        const isNeedsMedicalReview = status === "needs_medical_review";
        const isPendingCoachApproval = status === "pending_coach_approval";
        const isLegacyApproved = status === "approved"; // legacy status, treat as pending_payment
        const isPendingPayment = status === "pending_payment" || isLegacyApproved;
        const isActiveStatus = status === "active";
        const isSuspended = status === "suspended";
        const isInactiveStatus =
          status === "inactive" ||
          status === "cancelled" ||
          status === "expired";

        // Subscription flags
        const hasSubscription = !!subscription;
        const hasActiveSubscription = isActiveStatus && subStatus === "active";
        
        // Grace period / billing flags
        const isPastDue = subStatus === "past_due";
        const isInGracePeriod = isPastDue && isActiveStatus; // Profile still active during grace
        const isHardLocked = (status === "inactive" && subStatus === "inactive") || isSuspended;
        
        // Calculate grace period days remaining
        let gracePeriodDaysRemaining: number | null = null;
        if (subscription?.past_due_since && subscription?.grace_period_days) {
          const pastDueDate = new Date(subscription.past_due_since);
          const graceDeadline = new Date(pastDueDate);
          graceDeadline.setDate(graceDeadline.getDate() + subscription.grace_period_days);
          gracePeriodDaysRemaining = Math.max(0, Math.ceil((graceDeadline.getTime() - Date.now()) / (1000 * 60 * 60 * 24)));
        }

        // Determine if user is a regular active client (not just staff)
        // An active client has both profile.status === 'active' AND subscription.status === 'active'
        const isActiveClient = hasActiveSubscription && !isStaff;

        // For staff-only accounts (admin/coach with no active client subscription),
        // isMemberOnly would be true only if they're NOT staff
        const isMemberOnly = !isStaff && hasActiveSubscription;
        
        // Access control flags
        // Can access content: active OR in grace period (soft lock allows viewing)
        const canAccessContent = hasActiveSubscription || isInGracePeriod || isStaff;
        // Can book sessions: only when fully active (not during grace period)
        const canBookSessions = hasActiveSubscription;
        // Can modify subscription: only when fully active
        const canModifySubscription = hasActiveSubscription;

        if (isMounted) {
          setState({
            loading: false,
            error: undefined,
            profile,
            subscription,
            isAdmin,
            isCoach,
            isMemberOnly,
            status,
            isPending,
            isNeedsMedicalReview,
            isPendingCoachApproval,
            isPendingPayment,
            isActiveStatus,
            isInactiveStatus,
            isSuspended,
            subStatus,
            hasSubscription,
            hasActiveSubscription,
            isPastDue,
            isInGracePeriod,
            isHardLocked,
            gracePeriodDaysRemaining,
            isActiveClient,
            isStaff,
            canAccessContent,
            canBookSessions,
            canModifySubscription,
          });
        }
      } catch (error: any) {
        console.error("Error fetching client access data:", error);
        if (isMounted) {
          setState({
            ...initialState,
            loading: false,
            error: error.message || "Failed to load access information",
          });
        }
      }
    };

    fetchAccessData();

    return () => {
      isMounted = false;
    };
  }, []);

  return state;
}

/**
 * Helper to get appropriate access denial message based on status
 */
export function getAccessDeniedMessage(state: ClientAccessState): string {
  if (state.isPending) {
    return "Your subscription is not active yet. Please complete the required steps on your dashboard.";
  }
  if (state.isNeedsMedicalReview) {
    return "Your account is under medical review. Please wait for approval.";
  }
  if (state.isPendingCoachApproval) {
    return "Your account is pending coach approval. Please wait for confirmation.";
  }
  if (state.isPendingPayment) {
    return "Please complete your payment to access this content.";
  }
  if (state.isSuspended) {
    return "Your account has been suspended. Please contact support.";
  }
  if (state.isHardLocked) {
    return "Your subscription is inactive due to non-payment. Please renew to regain access.";
  }
  if (state.isInGracePeriod) {
    return "Your payment is past due. Some features are temporarily restricted until payment is received.";
  }
  if (state.isInactiveStatus) {
    return "Your subscription is inactive. Reactivate or sign up again to access this content.";
  }
  if (!state.hasSubscription) {
    return "You don't have an active subscription. Please sign up for a plan.";
  }
  return "Your account must be active to access this content.";
}
