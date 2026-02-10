import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  AlertTriangle, 
  CheckCircle2, 
  ChevronDown, 
  ChevronUp, 
  RefreshCw,
  Users,
  UserCog,
  ClipboardList,
  CreditCard,
  Loader2,
  ExternalLink,
  AlertCircle,
  Info,
  Shield,
  ShieldAlert
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { format, differenceInDays } from "date-fns";
import { SecurityRegressionChecks } from "./SecurityRegressionChecks";
import { SecuritySmokeTests } from "./SecuritySmokeTests";
import { PreLaunchSecurityGate } from "./PreLaunchSecurityGate";

type Severity = "critical" | "warning" | "info";

interface Issue {
  id: string;
  severity: Severity;
  [key: string]: any;
}

interface IssueCounts {
  total: number;
  critical: number;
  warning: number;
}

type SeverityFilter = "all" | "critical" | "warning" | "info";

export function SystemHealthView() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("all");

  // Account & Subscription Issues
  const [activeProfileNoSub, setActiveProfileNoSub] = useState<Issue[]>([]);
  const [activeSubNoProfile, setActiveSubNoProfile] = useState<Issue[]>([]);
  const [pendingPaymentOld, setPendingPaymentOld] = useState<Issue[]>([]);
  const [activeNoNextBilling, setActiveNoNextBilling] = useState<Issue[]>([]);

  // Coach Assignment Issues
  const [oneToOneNoCoach, setOneToOneNoCoach] = useState<Issue[]>([]);
  const [coachesAtCapacity, setCoachesAtCapacity] = useState<Issue[]>([]);
  const [coachesOverCapacity, setCoachesOverCapacity] = useState<Issue[]>([]);

  // Onboarding & Medical Issues
  const [medicalReviewStuck, setMedicalReviewStuck] = useState<Issue[]>([]);
  const [coachApprovalStuck, setCoachApprovalStuck] = useState<Issue[]>([]);
  const [oldDrafts, setOldDrafts] = useState<Issue[]>([]);

  // Discount & Billing Issues
  const [negativeDiscountCycles, setNegativeDiscountCycles] = useState<Issue[]>([]);
  const [orphanedRedemptions, setOrphanedRedemptions] = useState<Issue[]>([]);
  const [discountWithExempt, setDiscountWithExempt] = useState<Issue[]>([]);

  // PHI Compliance Issues
  const [phiViolations, setPhiViolations] = useState<Issue[]>([]);
  const [legacyTableViolations, setLegacyTableViolations] = useState<Issue[]>([]);

  const [loadingStates, setLoadingStates] = useState({
    accountSub: true,
    coachAssignment: true,
    onboardingMedical: true,
    discountBilling: true,
    phiCompliance: true,
  });

  const loadAllData = useCallback(async () => {
    setLoading(true);
    await Promise.all([
      loadAccountSubscriptionIssues(),
      loadCoachAssignmentIssues(),
      loadOnboardingMedicalIssues(),
      loadDiscountBillingIssues(),
      loadPhiComplianceIssues(),
    ]);
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const refresh = async () => {
    setRefreshing(true);
    await loadAllData();
    setRefreshing(false);
  };

  // Helper to compute severity based on days
  const getSeverityByDays = (days: number, warningThreshold: number, criticalThreshold: number): Severity => {
    if (days > criticalThreshold) return "critical";
    if (days > warningThreshold) return "warning";
    return "info";
  };

  // ===================== Account & Subscription Issues =====================
  const loadAccountSubscriptionIssues = async () => {
    setLoadingStates(prev => ({ ...prev, accountSub: true }));
    try {
      // 1. Active profile with no active subscription
      // Admin uses profiles view (security_invoker=true, admin has access via RLS)
      const { data: activeProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, first_name, last_name, status, payment_exempt")
        .eq("status", "active");

      const activeProfilesNoSub: Issue[] = [];
      for (const profile of activeProfiles || []) {
        // Skip admin/coach users — they have active profiles without client subscriptions
        const { data: roles } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", profile.id);
        const roleList = (roles || []).map(r => r.role);
        if (roleList.includes("admin") || roleList.includes("coach")) continue;

        const { data: subs } = await supabase
          .from("subscriptions")
          .select("id, status")
          .eq("user_id", profile.id);

        const hasActiveSub = subs?.some(s => s.status === "active");
        if (!hasActiveSub) {
          const subStatuses = subs?.map(s => s.status).join(", ") || "none";
          activeProfilesNoSub.push({
            id: profile.id,
            severity: "critical", // Always critical - status mismatch
            name: profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown",
            email: profile.email,
            profileStatus: profile.status,
            subscriptionStatuses: subStatuses,
            paymentExempt: profile.payment_exempt,
          });
        }
      }
      setActiveProfileNoSub(activeProfilesNoSub);

      // 2. Active subscription with non-active profile
      const { data: activeSubs } = await supabase
        .from("subscriptions")
        .select(`
          id, user_id, status, start_date,
          services (name)
        `)
        .eq("status", "active");

      // Fetch profiles separately (profiles is a VIEW, FK joins fail)
      const activeSubUserIds = [...new Set((activeSubs || []).map(s => s.user_id))];
      const { data: activeSubProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, first_name, last_name, status")
        .in("id", activeSubUserIds);
      const activeSubProfileMap = new Map((activeSubProfiles || []).map(p => [p.id, p]));

      const activeSubNoProfileArr: Issue[] = (activeSubs || [])
        .filter((sub: any) => {
          const profile = activeSubProfileMap.get(sub.user_id);
          return profile && profile.status !== "active";
        })
        .map((sub: any) => {
          const profile = activeSubProfileMap.get(sub.user_id);
          return {
            id: sub.id,
            severity: "critical" as Severity,
            name: profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Unknown",
            email: profile?.email,
            profileStatus: profile?.status,
            serviceName: sub.services?.name || "Unknown",
            subscriptionStatus: sub.status,
            startDate: sub.start_date,
          };
        });
      setActiveSubNoProfile(activeSubNoProfileArr);

      // 3. Pending payment - now with severity based on days (3-7 = warning, >7 = critical)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      // Admin uses profiles view (security_invoker=true, RLS-protected)
      const { data: pendingPaymentProfiles } = await supabase
        .from("profiles")
        .select(`
          id, email, full_name, first_name, last_name, status, payment_deadline, onboarding_completed_at
        `)
        .eq("status", "pending_payment");

      const pendingPaymentOldArr: Issue[] = [];
      for (const profile of pendingPaymentProfiles || []) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select(`
            id, status, created_at,
            services (name),
            coaches:coach_id (first_name, last_name)
          `)
          .eq("user_id", profile.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);

        const sub = subs?.[0];
        const approvalDate = profile.onboarding_completed_at || sub?.created_at;
        if (approvalDate && new Date(approvalDate) < threeDaysAgo) {
          const daysSince = differenceInDays(new Date(), new Date(approvalDate));
          pendingPaymentOldArr.push({
            id: profile.id,
            severity: getSeverityByDays(daysSince, 3, 7), // 3-7 = warning, >7 = critical
            name: profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown",
            email: profile.email,
            daysPending: daysSince,
            planName: sub?.services?.name || "Unknown",
            coachName: sub?.coaches ? `${(sub.coaches as any).first_name || ""} ${(sub.coaches as any).last_name || ""}`.trim() : "None",
            deadline: profile.payment_deadline,
          });
        }
      }
      setPendingPaymentOld(pendingPaymentOldArr);

      // 4. Active subscriptions with null next_billing_date (excluding payment_exempt)
      const { data: noNextBilling } = await supabase
        .from("subscriptions")
        .select(`
          id, user_id, status, start_date, tap_customer_id, tap_card_id,
          services (name)
        `)
        .eq("status", "active")
        .is("next_billing_date", null);

      // Fetch profiles separately and filter out payment_exempt
      const noBillingUserIds = [...new Set((noNextBilling || []).map(s => s.user_id))];
      const { data: noBillingProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, first_name, last_name, payment_exempt")
        .in("id", noBillingUserIds);
      const noBillingProfileMap = new Map((noBillingProfiles || []).map(p => [p.id, p]));

      const noNextBillingArr: Issue[] = (noNextBilling || [])
        .filter((sub: any) => {
          const profile = noBillingProfileMap.get(sub.user_id);
          return !profile?.payment_exempt;
        })
        .map((sub: any) => {
          const profile = noBillingProfileMap.get(sub.user_id);
          return {
            id: sub.id,
            severity: "critical" as Severity,
            userId: sub.user_id,
            name: profile?.full_name || `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim() || "Unknown",
            email: profile?.email,
            serviceName: sub.services?.name || "Unknown",
            startDate: sub.start_date,
            tapCustomerId: sub.tap_customer_id || "Not set",
            tapCardId: sub.tap_card_id || "Not set",
          };
        });
      setActiveNoNextBilling(noNextBillingArr);

    } catch (error) {
      console.error("Error loading account/subscription issues:", error);
    }
    setLoadingStates(prev => ({ ...prev, accountSub: false }));
  };

  // ===================== Coach Assignment Issues =====================
  const loadCoachAssignmentIssues = async () => {
    setLoadingStates(prev => ({ ...prev, coachAssignment: true }));
    try {
      // 1. 1:1 subscriptions without coach
      const { data: noCoachSubs } = await supabase
        .from("subscriptions")
        .select(`
          id, user_id, status, created_at, start_date,
          services!inner (id, name, type)
        `)
        .eq("services.type", "one_to_one")
        .in("status", ["pending", "active"])
        .is("coach_id", null);

      // Fetch profiles separately for no-coach subs
      const noCoachUserIds = [...new Set((noCoachSubs || []).map(s => s.user_id))];
      const { data: noCoachProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, first_name, last_name")
        .in("id", noCoachUserIds);
      const noCoachProfileMap = new Map((noCoachProfiles || []).map(p => [p.id, p]));

      const noCoachArr: Issue[] = [];
      for (const sub of noCoachSubs || []) {
        const { data: formSubmission } = await supabase
          .from("form_submissions")
          .select("preferred_coach_id, coaches:preferred_coach_id (first_name, last_name)")
          .eq("user_id", (sub as any).user_id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        // Active 1:1 without coach is critical, pending is warning
        const severity: Severity = (sub as any).status === "active" ? "critical" : "warning";

        const ncProfile = noCoachProfileMap.get((sub as any).user_id);
        noCoachArr.push({
          id: (sub as any).id,
          severity,
          name: ncProfile?.full_name || `${ncProfile?.first_name || ""} ${ncProfile?.last_name || ""}`.trim() || "Unknown",
          email: ncProfile?.email,
          serviceName: (sub as any).services?.name || "Unknown",
          subscriptionStatus: (sub as any).status,
          createdAt: (sub as any).created_at,
          preferredCoach: formSubmission?.coaches
            ? `${(formSubmission.coaches as any).first_name || ""} ${(formSubmission.coaches as any).last_name || ""}`.trim()
            : "None specified",
        });
      }
      setOneToOneNoCoach(noCoachArr);

      // 2. Coach capacity checks
      const { data: serviceLimits } = await supabase
        .from("coach_service_limits")
        .select(`
          id, coach_id, service_id, max_clients,
          coaches!inner (id, user_id, first_name, last_name),
          services!inner (id, name, type)
        `);

      const atCapacity: Issue[] = [];
      const overCapacity: Issue[] = [];

      for (const limit of serviceLimits || []) {
        const { count } = await supabase
          .from("subscriptions")
          .select("id", { count: "exact", head: true })
          .eq("coach_id", (limit as any).coaches?.user_id)
          .eq("service_id", (limit as any).service_id)
          .eq("status", "active");

        const activeClients = count || 0;
        const maxClients = (limit as any).max_clients;
        const coachName = `${(limit as any).coaches?.first_name || ""} ${(limit as any).coaches?.last_name || ""}`.trim();
        const serviceName = (limit as any).services?.name || "Unknown";

        if (activeClients > maxClients) {
          overCapacity.push({
            id: (limit as any).id,
            severity: "critical", // Over capacity is critical
            coachName,
            serviceName,
            maxClients,
            activeClients,
            overBy: activeClients - maxClients,
          });
        } else if (activeClients === maxClients && maxClients > 0) {
          atCapacity.push({
            id: (limit as any).id,
            severity: "warning", // At capacity is warning
            coachName,
            serviceName,
            maxClients,
            activeClients,
          });
        }
      }
      setCoachesAtCapacity(atCapacity);
      setCoachesOverCapacity(overCapacity);

    } catch (error) {
      console.error("Error loading coach assignment issues:", error);
    }
    setLoadingStates(prev => ({ ...prev, coachAssignment: false }));
  };

  // ===================== Onboarding & Medical Issues =====================
  const loadOnboardingMedicalIssues = async () => {
    setLoadingStates(prev => ({ ...prev, onboardingMedical: true }));
    try {
      // 1. Needs medical review with no reviewer
      // Admin uses profiles view (security_invoker=true, RLS-protected)
      const { data: medicalReviewProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, first_name, last_name, status, created_at")
        .eq("status", "needs_medical_review");

      const medicalStuck: Issue[] = [];
      for (const profile of medicalReviewProfiles || []) {
        const { data: formSubmission } = await supabase
          .from("form_submissions")
          .select("id, created_at, needs_medical_review, documents_verified, verified_at")
          .eq("user_id", profile.id)
          .eq("needs_medical_review", true)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (formSubmission && !formSubmission.verified_at) {
          const daysPending = differenceInDays(new Date(), new Date(formSubmission.created_at));
          medicalStuck.push({
            id: profile.id,
            severity: getSeverityByDays(daysPending, 3, 7), // 3-7 = warning, >7 = critical
            name: profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown",
            email: profile.email,
            submissionDate: formSubmission.created_at,
            daysPending,
          });
        }
      }
      setMedicalReviewStuck(medicalStuck);

      // 2. Pending coach approval - now with severity (3-7 = warning, >7 = critical)
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

      const { data: coachApprovalProfiles } = await supabase
        .from("profiles")
        .select("id, email, full_name, first_name, last_name, status, onboarding_completed_at")
        .eq("status", "pending_coach_approval");

      const coachApprovalStuckArr: Issue[] = [];
      for (const profile of coachApprovalProfiles || []) {
        const { data: subs } = await supabase
          .from("subscriptions")
          .select(`
            id, status, created_at,
            coaches:coach_id (first_name, last_name)
          `)
          .eq("user_id", profile.id)
          .eq("status", "pending")
          .order("created_at", { ascending: false })
          .limit(1);

        const sub = subs?.[0];
        const pendingSince = profile.onboarding_completed_at || sub?.created_at;
        if (pendingSince && new Date(pendingSince) < threeDaysAgo) {
          const daysPending = differenceInDays(new Date(), new Date(pendingSince));
          coachApprovalStuckArr.push({
            id: profile.id,
            severity: getSeverityByDays(daysPending, 3, 7), // 3-7 = warning, >7 = critical
            name: profile.full_name || `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Unknown",
            email: profile.email,
            daysPending,
            coachAssigned: sub?.coaches 
              ? `${(sub.coaches as any).first_name || ""} ${(sub.coaches as any).last_name || ""}`.trim() 
              : "None",
          });
        }
      }
      setCoachApprovalStuck(coachApprovalStuckArr);

      // 3. Onboarding drafts - now with severity (7-30 = warning, >30 = critical)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: oldDraftsData } = await supabase
        .from("onboarding_drafts")
        .select("id, user_id, created_at, updated_at")
        .lt("updated_at", sevenDaysAgo.toISOString());

      const oldDraftsArr: Issue[] = [];
      for (const draft of oldDraftsData || []) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", draft.user_id)
          .maybeSingle();

        const daysOld = differenceInDays(new Date(), new Date(draft.updated_at));
        oldDraftsArr.push({
          id: draft.id,
          severity: getSeverityByDays(daysOld, 7, 30), // 7-30 = warning (warm), >30 = critical (cold)
          userId: draft.user_id,
          email: profile?.email || "Unknown",
          createdAt: draft.created_at,
          updatedAt: draft.updated_at,
          daysOld,
        });
      }
      setOldDrafts(oldDraftsArr);

    } catch (error) {
      console.error("Error loading onboarding/medical issues:", error);
    }
    setLoadingStates(prev => ({ ...prev, onboardingMedical: false }));
  };

  // ===================== Discount & Billing Issues =====================
  const loadDiscountBillingIssues = async () => {
    setLoadingStates(prev => ({ ...prev, discountBilling: true }));
    try {
      // 1. Negative cycles_remaining
      const { data: negativeCycles } = await supabase
        .from("discount_redemptions")
        .select(`
          id, subscription_id, user_id, cycles_remaining, status,
          discount_codes (code),
          profiles:user_id (email, full_name, first_name, last_name)
        `)
        .lt("cycles_remaining", 0);

      const negativeCyclesArr: Issue[] = (negativeCycles || []).map((r: any) => ({
        id: r.id,
        severity: "critical" as Severity, // Data integrity issue
        name: r.profiles?.full_name || `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || "Unknown",
        email: r.profiles?.email,
        subscriptionId: r.subscription_id,
        discountCode: r.discount_codes?.code || "Unknown",
        cyclesRemaining: r.cycles_remaining,
        status: r.status,
      }));
      setNegativeDiscountCycles(negativeCyclesArr);

      // 2. Active redemptions with no linked subscription
      const { data: allRedemptions } = await supabase
        .from("discount_redemptions")
        .select(`
          id, subscription_id, user_id, status,
          discount_codes (code),
          profiles:user_id (email, full_name, first_name, last_name)
        `)
        .eq("status", "active");

      const orphanedArr: Issue[] = [];
      for (const redemption of allRedemptions || []) {
        const { data: sub } = await supabase
          .from("subscriptions")
          .select("id")
          .eq("id", (redemption as any).subscription_id)
          .maybeSingle();

        if (!sub) {
          orphanedArr.push({
            id: (redemption as any).id,
            severity: "warning" as Severity, // Not urgent but needs cleanup
            name: (redemption as any).profiles?.full_name || `${(redemption as any).profiles?.first_name || ""} ${(redemption as any).profiles?.last_name || ""}`.trim() || "Unknown",
            email: (redemption as any).profiles?.email,
            subscriptionId: (redemption as any).subscription_id,
            discountCode: (redemption as any).discount_codes?.code || "Unknown",
          });
        }
      }
      setOrphanedRedemptions(orphanedArr);

      // 3. Subscriptions with discount but payment_exempt
      const { data: discountWithExemptData } = await supabase
        .from("discount_redemptions")
        .select(`
          id, subscription_id, user_id, status,
          discount_codes (code),
          profiles:user_id (email, full_name, first_name, last_name, payment_exempt)
        `)
        .eq("status", "active");

      const exemptWithDiscount: Issue[] = (discountWithExemptData || [])
        .filter((r: any) => r.profiles?.payment_exempt === true)
        .map((r: any) => ({
          id: r.id,
          severity: "info" as Severity, // Not urgent, just cleanup
          name: r.profiles?.full_name || `${r.profiles?.first_name || ""} ${r.profiles?.last_name || ""}`.trim() || "Unknown",
          email: r.profiles?.email,
          discountCode: r.discount_codes?.code || "Unknown",
        }));
      setDiscountWithExempt(exemptWithDiscount);

    } catch (error) {
      console.error("Error loading discount/billing issues:", error);
    }
    setLoadingStates(prev => ({ ...prev, discountBilling: false }));
  };

  // ===================== PHI Compliance Issues =====================
  const loadPhiComplianceIssues = async () => {
    setLoadingStates(prev => ({ ...prev, phiCompliance: true }));
    try {
      // Call the database function to scan for PHI violations
      const { data: scanResults, error } = await supabase.rpc('scan_phi_plaintext_violations');
      
      if (error) {
        console.error("Error scanning PHI violations:", error);
        setPhiViolations([]);
      } else {
        // Filter to only show actual violations (not 'ok' status)
        const violations: Issue[] = (scanResults || [])
          .filter((r: any) => r.severity !== 'ok' && r.record_count > 0)
          .map((r: any, index: number) => ({
            id: `phi-${r.field_name}-${index}`,
            severity: r.severity === 'critical' ? 'critical' as Severity : 'warning' as Severity,
            fieldName: r.field_name,
            violationType: r.violation_type,
            recordCount: r.record_count,
            description: r.description,
          }));

        setPhiViolations(violations);

        // Log the scan result to the compliance table
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const criticalCount = violations.filter(v => v.severity === 'critical').length;
          const warningCount = violations.filter(v => v.severity === 'warning').length;
          
          await supabase.from('phi_compliance_scans').insert({
            scanned_by: user.id,
            total_violations: violations.length,
            critical_violations: criticalCount,
            warning_violations: warningCount,
            scan_results: scanResults,
          });
        }
      }

      // Check for legacy table security issues (non-admin access to profiles_legacy, coaches)
      const { data: legacyResults, error: legacyError } = await supabase.rpc('check_legacy_table_security');
      
      if (legacyError) {
        console.error("Error checking legacy table security:", legacyError);
        setLegacyTableViolations([]);
      } else {
        const legacyViolations: Issue[] = (legacyResults || [])
          .filter((r: any) => r.allows_non_admin)
          .map((r: any, index: number) => ({
            id: `legacy-${r.table_name}-${r.policy_name}-${index}`,
            severity: 'critical' as Severity,
            tableName: r.table_name,
            policyName: r.policy_name,
            description: r.issue_description,
          }));

        setLegacyTableViolations(legacyViolations);
      }
    } catch (error) {
      console.error("Error loading PHI compliance issues:", error);
    }
    setLoadingStates(prev => ({ ...prev, phiCompliance: false }));
  };

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "N/A";
    return format(new Date(date), "MMM d, yyyy");
  };

  // Filter issues by severity
  const filterBySeverity = (issues: Issue[]): Issue[] => {
    if (severityFilter === "all") return issues;
    return issues.filter(i => i.severity === severityFilter);
  };

  // Count issues by severity
  const countSeverity = (issues: Issue[]): IssueCounts => {
    return {
      total: issues.length,
      critical: issues.filter(i => i.severity === "critical").length,
      warning: issues.filter(i => i.severity === "warning").length,
    };
  };

  // Get severity icon
  const SeverityBadge = ({ severity }: { severity: Severity }) => {
    if (severity === "critical") {
      return (
        <Badge variant="destructive" className="text-xs gap-1">
          <AlertCircle className="h-3 w-3" />
          Critical
        </Badge>
      );
    }
    if (severity === "warning") {
      return (
        <Badge className="text-xs gap-1 bg-amber-500 hover:bg-amber-600">
          <AlertTriangle className="h-3 w-3" />
          Warning
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="text-xs gap-1">
        <Info className="h-3 w-3" />
        Info
      </Badge>
    );
  };

  // Render severity summary in card header
  const SeveritySummary = ({ counts }: { counts: IssueCounts }) => {
    if (counts.total === 0) {
      return (
        <div className="flex items-center gap-2 text-green-600">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">No issues</span>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2">
        {counts.critical > 0 && (
          <Badge variant="destructive" className="text-xs">
            {counts.critical} critical
          </Badge>
        )}
        {counts.warning > 0 && (
          <Badge className="text-xs bg-amber-500 hover:bg-amber-600">
            {counts.warning} warning
          </Badge>
        )}
        {counts.total - counts.critical - counts.warning > 0 && (
          <Badge variant="secondary" className="text-xs">
            {counts.total - counts.critical - counts.warning} info
          </Badge>
        )}
      </div>
    );
  };

  const renderIssueCard = (
    id: string,
    title: string,
    description: string,
    icon: React.ReactNode,
    issues: Issue[],
    columns: { key: string; label: string; render?: (value: any, row: Issue) => React.ReactNode }[],
    isLoading: boolean,
    actionConfig?: { label: string; path: string; section?: string }
  ) => {
    // Apply severity filter
    const filteredIssues = filterBySeverity(issues);
    const counts = countSeverity(filteredIssues);
    const isExpanded = expandedCategories.has(id);

    // Don't show card if no issues match the filter
    if (severityFilter !== "all" && counts.total === 0) {
      return null;
    }

    return (
      <Card key={id} className="border-border/50">
        <Collapsible open={isExpanded} onOpenChange={() => toggleCategory(id)}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${counts.critical > 0 ? "bg-destructive/10" : counts.warning > 0 ? "bg-amber-500/10" : counts.total > 0 ? "bg-muted" : "bg-green-500/10"}`}>
                  {icon}
                </div>
                <div>
                  <CardTitle className="text-lg">{title}</CardTitle>
                  <CardDescription>{description}</CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-3">
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <SeveritySummary counts={counts} />
                )}
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" size="sm" disabled={counts.total === 0}>
                    {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
              </div>
            </div>
          </CardHeader>

          <CollapsibleContent>
            <CardContent className="pt-0">
              {counts.total === 0 ? (
                <div className="flex items-center gap-2 text-green-600 py-4">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>All good — no issues found</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Summary action bar */}
                  {actionConfig && (
                    <div className="flex items-center justify-between bg-muted/50 rounded-lg p-3">
                      <span className="text-sm text-muted-foreground">
                        {counts.total} record{counts.total === 1 ? "" : "s"} affected
                      </span>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => navigate(actionConfig.path)}
                      >
                        <ExternalLink className="h-4 w-4 mr-2" />
                        {actionConfig.label}
                      </Button>
                    </div>
                  )}
                  
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[100px]">Severity</TableHead>
                          {columns.map(col => (
                            <TableHead key={col.key}>{col.label}</TableHead>
                          ))}
                          <TableHead className="w-[80px]">Action</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {/* Sort by severity: critical first, then warning, then info */}
                        {[...filteredIssues]
                          .sort((a, b) => {
                            const order = { critical: 0, warning: 1, info: 2 };
                            return order[a.severity] - order[b.severity];
                          })
                          .slice(0, 20) // Limit to 20 rows for performance
                          .map((issue) => (
                            <TableRow key={issue.id}>
                              <TableCell>
                                <SeverityBadge severity={issue.severity} />
                              </TableCell>
                              {columns.map(col => (
                                <TableCell key={col.key}>
                                  {col.render ? col.render(issue[col.key], issue) : issue[col.key] || "—"}
                                </TableCell>
                              ))}
                              <TableCell>
                                {actionConfig ? (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                      // If the issue has an email, navigate to diagnostics
                                      if (issue.email) {
                                        navigate(`/admin/client-diagnostics?email=${encodeURIComponent(issue.email)}`);
                                      } else {
                                        navigate(actionConfig.path);
                                      }
                                    }}
                                    title="View details"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                ) : (
                                  <Button 
                                    variant="ghost" 
                                    size="sm"
                                    onClick={() => {
                                      if (issue.email) {
                                        navigate(`/admin/client-diagnostics?email=${encodeURIComponent(issue.email)}`);
                                      }
                                    }}
                                    disabled={!issue.email}
                                    title="View client diagnostics"
                                  >
                                    <ExternalLink className="h-4 w-4" />
                                  </Button>
                                )}
                              </TableCell>
                            </TableRow>
                          ))}
                      </TableBody>
                    </Table>
                    {filteredIssues.length > 20 && (
                      <p className="text-sm text-muted-foreground text-center py-2">
                        Showing 20 of {filteredIssues.length} records. {actionConfig && (
                          <Button variant="link" className="p-0 h-auto" onClick={() => navigate(actionConfig.path)}>
                            View all in {actionConfig.label.replace("Open ", "")}
                          </Button>
                        )}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
    );
  };

  // Compute category-level counts
  const accountSubIssues = [...activeProfileNoSub, ...activeSubNoProfile, ...pendingPaymentOld, ...activeNoNextBilling];
  const coachIssues = [...oneToOneNoCoach, ...coachesOverCapacity, ...coachesAtCapacity];
  const onboardingIssues = [...medicalReviewStuck, ...coachApprovalStuck, ...oldDrafts];
  const discountIssues = [...negativeDiscountCycles, ...orphanedRedemptions, ...discountWithExempt];
  const phiIssues = [...phiViolations, ...legacyTableViolations];

  const accountSubCounts = countSeverity(accountSubIssues);
  const coachCounts = countSeverity(coachIssues);
  const onboardingCounts = countSeverity(onboardingIssues);
  const discountCounts = countSeverity(discountIssues);
  const phiCounts = countSeverity(phiIssues);

  const totalCounts: IssueCounts = {
    total: accountSubCounts.total + coachCounts.total + onboardingCounts.total + discountCounts.total + phiCounts.total,
    critical: accountSubCounts.critical + coachCounts.critical + onboardingCounts.critical + discountCounts.critical + phiCounts.critical,
    warning: accountSubCounts.warning + coachCounts.warning + onboardingCounts.warning + discountCounts.warning + phiCounts.warning,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Data Integrity Checks</h2>
          <p className="text-sm text-muted-foreground">
            {totalCounts.total === 0 
              ? "All systems healthy — no issues detected" 
              : `${totalCounts.total} issue${totalCounts.total === 1 ? "" : "s"} found across all categories`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Severity Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted-foreground mr-2">Show:</span>
        <div className="flex gap-1">
          <Button 
            variant={severityFilter === "all" ? "default" : "outline"} 
            size="sm"
            onClick={() => setSeverityFilter("all")}
          >
            All ({totalCounts.total})
          </Button>
          <Button 
            variant={severityFilter === "critical" ? "destructive" : "outline"} 
            size="sm"
            onClick={() => setSeverityFilter("critical")}
            disabled={totalCounts.critical === 0}
          >
            Critical ({totalCounts.critical})
          </Button>
          <Button 
            variant={severityFilter === "warning" ? "default" : "outline"} 
            size="sm"
            onClick={() => setSeverityFilter("warning")}
            disabled={totalCounts.warning === 0}
            className={severityFilter === "warning" ? "bg-amber-500 hover:bg-amber-600" : ""}
          >
            Warnings ({totalCounts.warning})
          </Button>
          <Button 
            variant={severityFilter === "info" ? "secondary" : "outline"} 
            size="sm"
            onClick={() => setSeverityFilter("info")}
            disabled={totalCounts.total - totalCounts.critical - totalCounts.warning === 0}
          >
            Info ({totalCounts.total - totalCounts.critical - totalCounts.warning})
          </Button>
        </div>
      </div>

      {/* Summary Badge */}
      <Card className={`border-2 ${totalCounts.critical > 0 ? "border-destructive/30 bg-destructive/5" : totalCounts.warning > 0 ? "border-amber-500/30 bg-amber-500/5" : "border-green-500/30 bg-green-500/5"}`}>
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {totalCounts.critical > 0 ? (
                <AlertCircle className="h-6 w-6 text-destructive" />
              ) : totalCounts.warning > 0 ? (
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              ) : (
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              )}
              <div>
                <p className="font-medium">
                  {totalCounts.total > 0 
                    ? `${totalCounts.total} data integrity issue${totalCounts.total === 1 ? "" : "s"} require attention`
                    : "All data integrity checks passed"}
                </p>
                <p className="text-sm text-muted-foreground">
                  Last checked: {format(new Date(), "MMM d, yyyy 'at' h:mm a")}
                </p>
              </div>
            </div>
            {totalCounts.total > 0 && (
              <div className="flex gap-2">
                {totalCounts.critical > 0 && (
                  <Badge variant="destructive" className="text-sm px-3 py-1">
                    {totalCounts.critical} Critical
                  </Badge>
                )}
                {totalCounts.warning > 0 && (
                  <Badge className="text-sm px-3 py-1 bg-amber-500 hover:bg-amber-600">
                    {totalCounts.warning} Warning
                  </Badge>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Account & Subscription Issues */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            Account & Subscription Issues
          </h3>
          <SeveritySummary counts={accountSubCounts} />
        </div>
        
        {renderIssueCard(
          "active-profile-no-sub",
          "Active Profile, No Active Subscription",
          "Profiles marked as 'active' but have no active subscription",
          <AlertCircle className="h-5 w-5 text-destructive" />,
          activeProfileNoSub,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "profileStatus", label: "Profile Status" },
            { key: "subscriptionStatuses", label: "Sub Statuses" },
            { key: "paymentExempt", label: "Payment Exempt", render: (v) => v ? "Yes" : "No" },
          ],
          loadingStates.accountSub,
          { label: "Open All Clients", path: "/dashboard?view=clients&tab=active" }
        )}

        {renderIssueCard(
          "active-sub-no-profile",
          "Active Subscription, Non-Active Profile",
          "Subscriptions marked as 'active' but profile status disagrees",
          <AlertCircle className="h-5 w-5 text-destructive" />,
          activeSubNoProfile,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "profileStatus", label: "Profile Status" },
            { key: "serviceName", label: "Service" },
            { key: "startDate", label: "Start Date", render: (v) => formatDate(v) },
          ],
          loadingStates.accountSub,
          { label: "Open All Clients", path: "/dashboard?view=clients&tab=active" }
        )}

        {renderIssueCard(
          "pending-payment-old",
          "Pending Payment Stuck",
          "Clients in 'pending_payment' for 3+ days (warning: 3-7d, critical: >7d)",
          <AlertTriangle className="h-5 w-5 text-amber-500" />,
          pendingPaymentOld,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "daysPending", label: "Days Pending" },
            { key: "planName", label: "Plan" },
            { key: "coachName", label: "Coach" },
          ],
          loadingStates.accountSub,
          { label: "Open All Clients", path: "/dashboard?view=clients&tab=pending" }
        )}

        {renderIssueCard(
          "no-next-billing",
          "Active Sub, No Next Billing Date",
          "Active subscriptions missing next_billing_date (paying clients only)",
          <AlertCircle className="h-5 w-5 text-destructive" />,
          activeNoNextBilling,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "serviceName", label: "Service" },
            { key: "startDate", label: "Start Date", render: (v) => formatDate(v) },
            { key: "tapCustomerId", label: "Tap Customer" },
          ],
          loadingStates.accountSub,
          { label: "Open All Clients", path: "/dashboard?view=clients&tab=active" }
        )}
      </div>

      {/* Coach Assignment Issues */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <UserCog className="h-5 w-5 text-primary" />
            Coach Assignment Issues
          </h3>
          <SeveritySummary counts={coachCounts} />
        </div>

        {renderIssueCard(
          "no-coach-1to1",
          "1:1 Clients Without Coach",
          "One-to-one subscriptions with no assigned coach (active=critical, pending=warning)",
          <AlertTriangle className="h-5 w-5 text-amber-500" />,
          oneToOneNoCoach,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "serviceName", label: "Service" },
            { key: "subscriptionStatus", label: "Status" },
            { key: "preferredCoach", label: "Preferred Coach" },
          ],
          loadingStates.coachAssignment,
          { label: "Open All Clients", path: "/dashboard?view=clients" }
        )}

        {renderIssueCard(
          "coach-over-capacity",
          "Coaches Over Capacity",
          "Coaches with more active clients than their limit allows",
          <AlertCircle className="h-5 w-5 text-destructive" />,
          coachesOverCapacity,
          [
            { key: "coachName", label: "Coach" },
            { key: "serviceName", label: "Service" },
            { key: "maxClients", label: "Max" },
            { key: "activeClients", label: "Active" },
            { key: "overBy", label: "Over By" },
          ],
          loadingStates.coachAssignment,
          { label: "Open Coaches", path: "/dashboard?view=coaches" }
        )}

        {renderIssueCard(
          "coach-at-capacity",
          "Coaches At Capacity",
          "Coaches at exactly their client limit (no new assignments possible)",
          <AlertTriangle className="h-5 w-5 text-amber-500" />,
          coachesAtCapacity,
          [
            { key: "coachName", label: "Coach" },
            { key: "serviceName", label: "Service" },
            { key: "maxClients", label: "Max" },
            { key: "activeClients", label: "Active" },
          ],
          loadingStates.coachAssignment,
          { label: "Open Coaches", path: "/dashboard?view=coaches" }
        )}
      </div>

      {/* Onboarding & Medical Issues */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Onboarding & Medical Issues
          </h3>
          <SeveritySummary counts={onboardingCounts} />
        </div>

        {renderIssueCard(
          "medical-review-stuck",
          "Medical Review Pending",
          "Clients awaiting medical review (warning: 3-7d, critical: >7d)",
          <AlertTriangle className="h-5 w-5 text-amber-500" />,
          medicalReviewStuck,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "submissionDate", label: "Submitted", render: (v) => formatDate(v) },
            { key: "daysPending", label: "Days Waiting" },
          ],
          loadingStates.onboardingMedical,
          { label: "Open All Clients", path: "/dashboard?view=clients&tab=pending" }
        )}

        {renderIssueCard(
          "coach-approval-stuck",
          "Coach Approval Stuck",
          "Clients waiting for coach approval (warning: 3-7d, critical: >7d)",
          <AlertTriangle className="h-5 w-5 text-amber-500" />,
          coachApprovalStuck,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "daysPending", label: "Days Waiting" },
            { key: "coachAssigned", label: "Assigned Coach" },
          ],
          loadingStates.onboardingMedical,
          { label: "Open All Clients", path: "/dashboard?view=clients&tab=pending" }
        )}

        {renderIssueCard(
          "old-drafts",
          "Stale Onboarding Drafts",
          "Incomplete drafts (warning: 7-30d warm lead, critical: >30d cold)",
          <AlertTriangle className="h-5 w-5 text-amber-500" />,
          oldDrafts,
          [
            { key: "email", label: "Email" },
            { key: "createdAt", label: "Created", render: (v) => formatDate(v) },
            { key: "updatedAt", label: "Last Updated", render: (v) => formatDate(v) },
            { key: "daysOld", label: "Days Old" },
          ],
          loadingStates.onboardingMedical,
          { label: "Open All Clients", path: "/dashboard?view=clients" }
        )}
      </div>

      {/* Discount & Billing Issues */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            Discount & Billing Issues
          </h3>
          <SeveritySummary counts={discountCounts} />
        </div>

        {renderIssueCard(
          "negative-discount-cycles",
          "Negative Discount Cycles",
          "Discount redemptions with cycles_remaining < 0",
          <AlertCircle className="h-5 w-5 text-destructive" />,
          negativeDiscountCycles,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "discountCode", label: "Code" },
            { key: "cyclesRemaining", label: "Cycles Remaining" },
            { key: "status", label: "Status" },
          ],
          loadingStates.discountBilling,
          { label: "Open All Clients", path: "/dashboard?view=clients" }
        )}

        {renderIssueCard(
          "orphaned-redemptions",
          "Orphaned Discount Redemptions",
          "Active redemptions with no linked subscription",
          <AlertTriangle className="h-5 w-5 text-amber-500" />,
          orphanedRedemptions,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "discountCode", label: "Code" },
            { key: "subscriptionId", label: "Subscription ID" },
          ],
          loadingStates.discountBilling,
          { label: "Open All Clients", path: "/dashboard?view=clients" }
        )}

        {renderIssueCard(
          "discount-with-exempt",
          "Discount on Payment-Exempt Client",
          "Active discounts applied to payment-exempt accounts",
          <Info className="h-5 w-5 text-muted-foreground" />,
          discountWithExempt,
          [
            { key: "name", label: "Name" },
            { key: "email", label: "Email" },
            { key: "discountCode", label: "Discount Code" },
          ],
          loadingStates.discountBilling,
          { label: "Open All Clients", path: "/dashboard?view=clients" }
        )}
      </div>

      {/* PHI Compliance Issues */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" />
            PHI Compliance & Data Security
          </h3>
          <SeveritySummary counts={phiCounts} />
        </div>

        {phiCounts.total === 0 && !loadingStates.phiCompliance ? (
          <Card className="border-green-500/30 bg-green-500/5">
            <CardContent className="py-4">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium text-green-700">All PHI data is properly encrypted</p>
                  <p className="text-sm text-muted-foreground">
                    No plaintext PHI detected in form_submissions. Database triggers prevent future violations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <>
            {phiViolations.length > 0 && renderIssueCard(
              "phi-plaintext-violations",
              "Plaintext PHI Detected",
              "Critical: Unencrypted sensitive data found in database. These should be encrypted immediately.",
              <ShieldAlert className="h-5 w-5 text-destructive" />,
              phiViolations,
              [
                { key: "fieldName", label: "Field" },
                { key: "violationType", label: "Type" },
                { key: "recordCount", label: "Records Affected" },
                { key: "description", label: "Details" },
              ],
              loadingStates.phiCompliance
            )}
          </>
        )}

        {renderIssueCard(
          "legacy-table-security",
          "Legacy Table Access Violations",
          "RLS policies allowing non-admin access to profiles_legacy or coaches tables. These should be admin-only.",
          <ShieldAlert className="h-5 w-5 text-destructive" />,
          legacyTableViolations,
          [
            { key: "tableName", label: "Table" },
            { key: "policyName", label: "Policy Name" },
            { key: "description", label: "Issue" },
          ],
          loadingStates.phiCompliance
        )}

        {/* Pre-Launch Security Gate - Comprehensive security validation */}
        <PreLaunchSecurityGate />

        {/* Security Smoke Tests - Verify anon access is blocked */}
        <SecuritySmokeTests />

        {/* Security Regression Checks - Admin only */}
        <SecurityRegressionChecks />
      </div>
    </div>
  );
}
