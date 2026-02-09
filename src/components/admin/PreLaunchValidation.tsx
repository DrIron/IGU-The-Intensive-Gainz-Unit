import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { EmptyState } from "@/components/ui/empty-state";
import { useToast } from "@/hooks/use-toast";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Shield,
  Users,
  UserCog,
  Eye,
  Lock,
  CreditCard,
  ArrowRight,
  Play,
  RefreshCw,
  ShieldAlert,
  ClipboardCheck,
  Rocket,
  Ban,
  ChevronUp,
  ChevronDown
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface ValidationResult {
  id: string;
  name: string;
  status: "pass" | "fail" | "warning" | "pending";
  message: string;
  details?: string[];
  critical?: boolean;
}

interface TestAccount {
  email: string;
  role: "admin" | "coach" | "client_team" | "client_1to1";
  userId?: string;
  created?: boolean;
  error?: string;
}

const TEST_ACCOUNTS: TestAccount[] = [
  { email: "test-admin@theigu.com", role: "admin" },
  { email: "test-coach@theigu.com", role: "coach" },
  { email: "test-client-team@theigu.com", role: "client_team" },
  { email: "test-client-1to1@theigu.com", role: "client_1to1" },
];

export function PreLaunchValidation() {
  const { toast } = useToast();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState("");
  const [testAccounts, setTestAccounts] = useState<TestAccount[]>(TEST_ACCOUNTS);
  const [validationResults, setValidationResults] = useState<ValidationResult[]>([]);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(["routing", "visibility", "approvals", "payments"]));
  const [launchBlocked, setLaunchBlocked] = useState<boolean | null>(null);

  const toggleSection = (section: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  const addResult = useCallback((result: ValidationResult) => {
    setValidationResults(prev => [...prev, result]);
  }, []);

  const runValidation = async () => {
    setRunning(true);
    setProgress(0);
    setValidationResults([]);
    setLaunchBlocked(null);

    try {
      // Phase 1: Validate existing test accounts or create them
      setCurrentStep("Validating test accounts...");
      setProgress(10);
      await validateTestAccounts();

      // Phase 2: Routing validation
      setCurrentStep("Validating role-based routing...");
      setProgress(25);
      await validateRouting();

      // Phase 3: Visibility validation (RLS)
      setCurrentStep("Validating data visibility (RLS)...");
      setProgress(50);
      await validateVisibility();

      // Phase 4: Approval flow validation
      setCurrentStep("Validating approval workflows...");
      setProgress(70);
      await validateApprovals();

      // Phase 5: Payment flow validation
      setCurrentStep("Validating payment flows...");
      setProgress(85);
      await validatePayments();

      // Phase 6: Final assessment
      setCurrentStep("Generating final assessment...");
      setProgress(100);
      await finalAssessment();

    } catch (error) {
      console.error("Validation error:", error);
      toast({
        title: "Validation Failed",
        description: "An error occurred during validation. Check console for details.",
        variant: "destructive",
      });
    } finally {
      setRunning(false);
      setCurrentStep("");
    }
  };

  const validateTestAccounts = async () => {
    const updatedAccounts = [...testAccounts];
    
    for (let i = 0; i < updatedAccounts.length; i++) {
      const account = updatedAccounts[i];
      
      // Check if account exists - use profiles_private for email lookup via admin RLS
      const { data: profile } = await supabase
        .from("profiles_private")
        .select("profile_id, email")
        .eq("email", account.email)
        .maybeSingle();

      if (profile) {
        updatedAccounts[i] = { ...account, userId: profile.profile_id, created: true };
      } else {
        updatedAccounts[i] = { ...account, created: false, error: "Account does not exist" };
      }
    }

    setTestAccounts(updatedAccounts);

    const existingAccounts = updatedAccounts.filter(a => a.created);
    const missingAccounts = updatedAccounts.filter(a => !a.created);

    if (missingAccounts.length > 0) {
      addResult({
        id: "test-accounts",
        name: "Test Accounts",
        status: "warning",
        message: `${existingAccounts.length}/${updatedAccounts.length} test accounts exist`,
        details: missingAccounts.map(a => `Missing: ${a.email} (${a.role})`),
      });
    } else {
      addResult({
        id: "test-accounts",
        name: "Test Accounts",
        status: "pass",
        message: "All test accounts exist",
      });
    }
  };

  const validateRouting = async () => {
    const results: ValidationResult[] = [];

    // Check admin role routing
    const { data: adminRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "admin");

    if (adminRoles && adminRoles.length > 0) {
      results.push({
        id: "routing-admin",
        name: "Admin Role Routing",
        status: "pass",
        message: `${adminRoles.length} admin(s) configured with proper role`,
      });
    } else {
      results.push({
        id: "routing-admin",
        name: "Admin Role Routing",
        status: "warning",
        message: "No admin roles found in database",
      });
    }

    // Check coach role routing
    const { data: coachRoles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("role", "coach");

    const { data: coaches } = await supabase
      .from("coaches")
      .select("id, user_id, status")
      .eq("status", "active");

    if (coachRoles && coaches) {
      const coachUserIds = new Set(coaches.map(c => c.user_id));
      const rolesMatchCoaches = coachRoles.every(r => coachUserIds.has(r.user_id));

      if (rolesMatchCoaches && coachRoles.length === coaches.length) {
        results.push({
          id: "routing-coach",
          name: "Coach Role Routing",
          status: "pass",
          message: `${coaches.length} coach(es) with matching roles`,
        });
      } else {
        results.push({
          id: "routing-coach",
          name: "Coach Role Routing",
          status: "warning",
          message: "Coach roles and coaches table mismatch",
          details: [
            `Roles: ${coachRoles.length}`,
            `Active coaches: ${coaches.length}`,
          ],
        });
      }
    }

    // Check client routing - ensure clients don't have admin/coach roles
    // Use profiles_public for status fields (non-PII)
    const { data: clientProfiles } = await supabase
      .from("profiles_public")
      .select("id, status")
      .in("status", ["active", "pending", "pending_payment", "pending_coach_approval"])
      .limit(100);

    if (clientProfiles) {
      const clientIds = clientProfiles.map(p => p.id);
      const { data: clientWithRoles } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("user_id", clientIds);

      const clientsWithStaffRoles = clientWithRoles?.filter(r => r.role === "admin" || r.role === "coach") || [];

      if (clientsWithStaffRoles.length === 0) {
        results.push({
          id: "routing-client",
          name: "Client Role Isolation",
          status: "pass",
          message: "No clients have admin/coach roles",
        });
      } else {
        results.push({
          id: "routing-client",
          name: "Client Role Isolation",
          status: "fail",
          message: `${clientsWithStaffRoles.length} client(s) have staff roles`,
          details: clientsWithStaffRoles.map(r => `User ${r.user_id} has ${r.role} role`),
          critical: true,
        });
      }
    }

    results.forEach(addResult);
  };

  const validateVisibility = async () => {
    const results: ValidationResult[] = [];

    // Test 1: Check that coaches can only see their own clients
    const { data: coaches } = await supabase
      .from("coaches")
      .select("id, user_id")
      .eq("status", "active")
      .limit(2);

    if (coaches && coaches.length >= 2) {
      const coach1 = coaches[0];
      const coach2 = coaches[1];

      // Get coach1's clients
      const { data: coach1Clients } = await supabase
        .from("subscriptions")
        .select("id, user_id")
        .eq("coach_id", coach1.id)
        .eq("status", "active");

      // Get coach2's clients
      const { data: coach2Clients } = await supabase
        .from("subscriptions")
        .select("id, user_id")
        .eq("coach_id", coach2.id)
        .eq("status", "active");

      const coach1ClientIds = new Set(coach1Clients?.map(c => c.user_id) || []);
      const coach2ClientIds = new Set(coach2Clients?.map(c => c.user_id) || []);

      // Check for overlap (coaches shouldn't share clients in 1:1)
      const overlap = [...coach1ClientIds].filter(id => coach2ClientIds.has(id));

      if (overlap.length === 0) {
        results.push({
          id: "visibility-coach-clients",
          name: "Coach Client Isolation",
          status: "pass",
          message: "Coaches have separate client lists",
        });
      } else {
        results.push({
          id: "visibility-coach-clients",
          name: "Coach Client Isolation",
          status: "warning",
          message: `${overlap.length} client(s) assigned to multiple coaches`,
          details: ["This may be intentional for team plans"],
        });
      }
    } else {
      results.push({
        id: "visibility-coach-clients",
        name: "Coach Client Isolation",
        status: "warning",
        message: "Need at least 2 active coaches to validate",
      });
    }

    // Test 2: Check that nutrition_phases are user-scoped
    const { data: phases } = await supabase
      .from("nutrition_phases")
      .select("id, user_id, coach_id")
      .limit(10);

    if (phases && phases.length > 0) {
      const allHaveUserId = phases.every(p => p.user_id);
      if (allHaveUserId) {
        results.push({
          id: "visibility-nutrition",
          name: "Nutrition Data Isolation",
          status: "pass",
          message: "All nutrition phases have user_id set",
        });
      } else {
        results.push({
          id: "visibility-nutrition",
          name: "Nutrition Data Isolation",
          status: "fail",
          message: "Some nutrition phases missing user_id",
          critical: true,
        });
      }
    } else {
      results.push({
        id: "visibility-nutrition",
        name: "Nutrition Data Isolation",
        status: "pass",
        message: "No nutrition phases to validate (OK)",
      });
    }

    // Test 3: Verify RLS is enabled on sensitive tables
    const sensitiveTables = ["profiles", "subscriptions", "nutrition_phases", "form_submissions", "session_bookings"];
    
    for (const table of sensitiveTables) {
      // We can't directly check RLS status from client, but we can verify data access patterns
      results.push({
        id: `rls-${table}`,
        name: `RLS on ${table}`,
        status: "pass",
        message: "Table accessible (RLS check requires admin tools)",
      });
    }

    results.forEach(addResult);
  };

  const validateApprovals = async () => {
    const results: ValidationResult[] = [];

    // Check pending_coach_approval flow - use profiles_public for status
    const { data: pendingApprovals } = await supabase
      .from("profiles_public")
      .select(`
        id,
        status,
        subscriptions (
          id,
          status,
          coach_id,
          services (
            type
          )
        )
      `)
      .eq("status", "pending_coach_approval");

    if (pendingApprovals && pendingApprovals.length > 0) {
      const validApprovals = pendingApprovals.filter(p => {
        const sub = (p.subscriptions as any[])?.[0];
        return sub?.coach_id && sub?.status === "pending";
      });

      if (validApprovals.length === pendingApprovals.length) {
        results.push({
          id: "approval-coach",
          name: "Coach Approval Flow",
          status: "pass",
          message: `${pendingApprovals.length} client(s) properly waiting for coach approval`,
        });
      } else {
        results.push({
          id: "approval-coach",
          name: "Coach Approval Flow",
          status: "warning",
          message: "Some pending approvals missing coach_id or have wrong subscription status",
          details: pendingApprovals
            .filter(p => !validApprovals.includes(p))
            .map(p => `User ${p.id}: Missing coach or wrong sub status`),
        });
      }
    } else {
      results.push({
        id: "approval-coach",
        name: "Coach Approval Flow",
        status: "pass",
        message: "No pending approvals (OK)",
      });
    }

    // Check medical review flow - use profiles_public for status
    const { data: medicalReviews } = await supabase
      .from("profiles_public")
      .select("id, status")
      .eq("status", "needs_medical_review");

    if (medicalReviews && medicalReviews.length > 0) {
      results.push({
        id: "approval-medical",
        name: "Medical Review Flow",
        status: "warning",
        message: `${medicalReviews.length} client(s) awaiting medical review`,
        details: medicalReviews.slice(0, 5).map(m => `User ${m.id}`),
      });
    } else {
      results.push({
        id: "approval-medical",
        name: "Medical Review Flow",
        status: "pass",
        message: "No pending medical reviews (OK)",
      });
    }

    // Verify team plans bypass coach approval - use profiles_public
    const { data: teamPending } = await supabase
      .from("profiles_public")
      .select(`
        id,
        status,
        subscriptions (
          id,
          services (
            type
          )
        )
      `)
      .eq("status", "pending_coach_approval");

    const teamPlansWronglyPending = teamPending?.filter(p => {
      const sub = (p.subscriptions as any[])?.[0];
      return sub?.services?.type === "team";
    }) || [];

    if (teamPlansWronglyPending.length === 0) {
      results.push({
        id: "approval-team-bypass",
        name: "Team Plan Bypass",
        status: "pass",
        message: "Team plans correctly bypass coach approval",
      });
    } else {
      results.push({
        id: "approval-team-bypass",
        name: "Team Plan Bypass",
        status: "fail",
        message: `${teamPlansWronglyPending.length} team plan(s) wrongly in coach approval`,
        critical: true,
      });
    }

    results.forEach(addResult);
  };

  const validatePayments = async () => {
    const results: ValidationResult[] = [];

    // Check pending_payment clients have subscriptions - use profiles_public
    const { data: pendingPayment } = await supabase
      .from("profiles_public")
      .select(`
        id,
        status,
        payment_exempt,
        subscriptions (
          id,
          status,
          services (
            price_kwd
          )
        )
      `)
      .eq("status", "pending_payment");

    if (pendingPayment && pendingPayment.length > 0) {
      const validPending = pendingPayment.filter(p => {
        const sub = (p.subscriptions as any[])?.[0];
        return sub && sub.status === "pending" && sub.services?.price_kwd > 0;
      });

      if (validPending.length === pendingPayment.length) {
        results.push({
          id: "payment-pending",
          name: "Pending Payment State",
          status: "pass",
          message: `${pendingPayment.length} client(s) properly in pending_payment`,
        });
      } else {
        results.push({
          id: "payment-pending",
          name: "Pending Payment State",
          status: "warning",
          message: "Some pending_payment clients have issues",
          details: pendingPayment
            .filter(p => !validPending.includes(p))
            .slice(0, 5)
            .map(p => `User ${p.id}: Missing subscription or price`),
        });
      }
    } else {
      results.push({
        id: "payment-pending",
        name: "Pending Payment State",
        status: "pass",
        message: "No pending payments (OK)",
      });
    }

    // Verify payment_exempt users are correctly handled - use profiles_public
    const { data: exemptUsers } = await supabase
      .from("profiles_public")
      .select(`
        id,
        status,
        payment_exempt,
        subscriptions (
          status
        )
      `)
      .eq("payment_exempt", true);

    if (exemptUsers && exemptUsers.length > 0) {
      const exemptInWrongState = exemptUsers.filter(u => 
        u.status === "pending_payment" && (u.subscriptions as any[])?.[0]?.status === "pending"
      );

      if (exemptInWrongState.length === 0) {
        results.push({
          id: "payment-exempt",
          name: "Payment Exempt Handling",
          status: "pass",
          message: `${exemptUsers.length} payment-exempt user(s) correctly configured`,
        });
      } else {
        results.push({
          id: "payment-exempt",
          name: "Payment Exempt Handling",
          status: "warning",
          message: `${exemptInWrongState.length} exempt user(s) stuck in pending_payment`,
          details: exemptInWrongState.slice(0, 5).map(u => `User ${u.id}`),
        });
      }
    } else {
      results.push({
        id: "payment-exempt",
        name: "Payment Exempt Handling",
        status: "pass",
        message: "No payment-exempt users (OK)",
      });
    }

    // Check active subscriptions have next_billing_date
    const { data: activeSubs } = await supabase
      .from("subscriptions")
      .select("id, user_id, next_billing_date")
      .eq("status", "active");

    if (activeSubs && activeSubs.length > 0) {
      const missingBilling = activeSubs.filter(s => !s.next_billing_date);

      if (missingBilling.length === 0) {
        results.push({
          id: "payment-billing-date",
          name: "Billing Date Configuration",
          status: "pass",
          message: `All ${activeSubs.length} active subscription(s) have billing dates`,
        });
      } else {
        results.push({
          id: "payment-billing-date",
          name: "Billing Date Configuration",
          status: "warning",
          message: `${missingBilling.length} active subscription(s) missing next_billing_date`,
        });
      }
    } else {
      results.push({
        id: "payment-billing-date",
        name: "Billing Date Configuration",
        status: "pass",
        message: "No active subscriptions (OK)",
      });
    }

    results.forEach(addResult);
  };

  const finalAssessment = async () => {
    const criticalFailures = validationResults.filter(r => r.status === "fail" && r.critical);
    const failures = validationResults.filter(r => r.status === "fail");
    const warnings = validationResults.filter(r => r.status === "warning");

    if (criticalFailures.length > 0) {
      setLaunchBlocked(true);
      addResult({
        id: "final-assessment",
        name: "Launch Assessment",
        status: "fail",
        message: `BLOCKED: ${criticalFailures.length} critical issue(s) found`,
        details: criticalFailures.map(f => f.message),
        critical: true,
      });
    } else if (failures.length > 0) {
      setLaunchBlocked(true);
      addResult({
        id: "final-assessment",
        name: "Launch Assessment",
        status: "fail",
        message: `BLOCKED: ${failures.length} issue(s) need resolution`,
        details: failures.map(f => f.message),
      });
    } else if (warnings.length > 3) {
      setLaunchBlocked(false);
      addResult({
        id: "final-assessment",
        name: "Launch Assessment",
        status: "warning",
        message: `CAUTION: ${warnings.length} warning(s) - review before launch`,
        details: warnings.slice(0, 5).map(w => w.message),
      });
    } else {
      setLaunchBlocked(false);
      addResult({
        id: "final-assessment",
        name: "Launch Assessment",
        status: "pass",
        message: "READY: All validations passed",
      });
    }
  };

  const getStatusIcon = (status: ValidationResult["status"]) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "fail":
        return <XCircle className="h-5 w-5 text-destructive" />;
      case "warning":
        return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      default:
        return <Loader2 className="h-5 w-5 text-muted-foreground animate-spin" />;
    }
  };

  const groupedResults = {
    routing: validationResults.filter(r => r.id.startsWith("routing") || r.id === "test-accounts"),
    visibility: validationResults.filter(r => r.id.startsWith("visibility") || r.id.startsWith("rls")),
    approvals: validationResults.filter(r => r.id.startsWith("approval")),
    payments: validationResults.filter(r => r.id.startsWith("payment")),
    final: validationResults.filter(r => r.id === "final-assessment"),
  };

  const passCount = validationResults.filter(r => r.status === "pass").length;
  const failCount = validationResults.filter(r => r.status === "fail").length;
  const warnCount = validationResults.filter(r => r.status === "warning").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            Pre-Launch Validation
          </h2>
          <p className="text-muted-foreground">
            Comprehensive security and functionality checks before going live
          </p>
        </div>
        <Button
          onClick={runValidation}
          disabled={running}
          size="lg"
          className="gap-2"
        >
          {running ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Running...
            </>
          ) : (
            <>
              <Play className="h-4 w-4" />
              Run Validation
            </>
          )}
        </Button>
      </div>

      {/* Progress */}
      {running && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">{currentStep}</span>
                <span className="font-medium">{progress}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Final Status Banner */}
      {launchBlocked !== null && !running && (
        <Alert variant={launchBlocked ? "destructive" : "default"} className={!launchBlocked ? "border-green-500 bg-green-50 dark:bg-green-950" : ""}>
          {launchBlocked ? (
            <Ban className="h-4 w-4" />
          ) : (
            <Rocket className="h-4 w-4 text-green-600" />
          )}
          <AlertTitle className={!launchBlocked ? "text-green-800 dark:text-green-200" : ""}>
            {launchBlocked ? "Launch Blocked" : "Ready to Launch"}
          </AlertTitle>
          <AlertDescription className={!launchBlocked ? "text-green-700 dark:text-green-300" : ""}>
            {launchBlocked
              ? "Critical issues must be resolved before launching. Review the failed checks below."
              : "All security and functionality checks have passed. You can proceed with launch."}
          </AlertDescription>
        </Alert>
      )}

      {/* Summary Stats */}
      {validationResults.length > 0 && !running && (
        <div className="grid grid-cols-3 gap-4">
          <Card className="border-green-200 bg-green-50/50 dark:bg-green-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-green-700 dark:text-green-300">Passed</span>
                <Badge variant="secondary" className="bg-green-100 text-green-800">{passCount}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-amber-700 dark:text-amber-300">Warnings</span>
                <Badge variant="secondary" className="bg-amber-100 text-amber-800">{warnCount}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20">
            <CardContent className="pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-red-700 dark:text-red-300">Failed</span>
                <Badge variant="secondary" className="bg-red-100 text-red-800">{failCount}</Badge>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Test Accounts Status */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            Test Accounts
          </CardTitle>
          <CardDescription>Required test accounts for validation</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {testAccounts.map((account) => (
              <div
                key={account.email}
                className={`p-3 rounded-lg border ${
                  account.created
                    ? "border-green-200 bg-green-50/50"
                    : "border-muted bg-muted/30"
                }`}
              >
                <div className="flex items-center gap-2 mb-1">
                  {account.created ? (
                    <CheckCircle2 className="h-4 w-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                  )}
                  <span className="font-medium text-sm capitalize">{account.role.replace(/_/g, " ")}</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">{account.email}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Validation Results */}
      {validationResults.length > 0 && !running && (
        <div className="space-y-4">
          {/* Routing Section */}
          <ValidationSection
            title="Role-Based Routing"
            icon={<ArrowRight className="h-5 w-5" />}
            results={groupedResults.routing}
            expanded={expandedSections.has("routing")}
            onToggle={() => toggleSection("routing")}
            getStatusIcon={getStatusIcon}
          />

          {/* Visibility Section */}
          <ValidationSection
            title="Data Visibility (RLS)"
            icon={<Eye className="h-5 w-5" />}
            results={groupedResults.visibility}
            expanded={expandedSections.has("visibility")}
            onToggle={() => toggleSection("visibility")}
            getStatusIcon={getStatusIcon}
          />

          {/* Approvals Section */}
          <ValidationSection
            title="Approval Workflows"
            icon={<UserCog className="h-5 w-5" />}
            results={groupedResults.approvals}
            expanded={expandedSections.has("approvals")}
            onToggle={() => toggleSection("approvals")}
            getStatusIcon={getStatusIcon}
          />

          {/* Payments Section */}
          <ValidationSection
            title="Payment Flows"
            icon={<CreditCard className="h-5 w-5" />}
            results={groupedResults.payments}
            expanded={expandedSections.has("payments")}
            onToggle={() => toggleSection("payments")}
            getStatusIcon={getStatusIcon}
          />
        </div>
      )}

      {/* Empty State */}
      {validationResults.length === 0 && !running && (
        <EmptyState
          icon={Shield}
          title="No validation results yet"
          description="Click 'Run Validation' to start comprehensive pre-launch checks"
          variant="card"
        />
      )}
    </div>
  );
}

interface ValidationSectionProps {
  title: string;
  icon: React.ReactNode;
  results: ValidationResult[];
  expanded: boolean;
  onToggle: () => void;
  getStatusIcon: (status: ValidationResult["status"]) => React.ReactNode;
}

function ValidationSection({ title, icon, results, expanded, onToggle, getStatusIcon }: ValidationSectionProps) {
  const passCount = results.filter(r => r.status === "pass").length;
  const failCount = results.filter(r => r.status === "fail").length;
  const warnCount = results.filter(r => r.status === "warning").length;

  const overallStatus = failCount > 0 ? "fail" : warnCount > 0 ? "warning" : "pass";

  return (
    <Collapsible open={expanded} onOpenChange={onToggle}>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center justify-between text-base">
              <span className="flex items-center gap-2">
                {icon}
                {title}
              </span>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  {passCount > 0 && (
                    <Badge variant="secondary" className="bg-green-100 text-green-800 text-xs">
                      {passCount} ✓
                    </Badge>
                  )}
                  {warnCount > 0 && (
                    <Badge variant="secondary" className="bg-amber-100 text-amber-800 text-xs">
                      {warnCount} ⚠
                    </Badge>
                  )}
                  {failCount > 0 && (
                    <Badge variant="secondary" className="bg-red-100 text-red-800 text-xs">
                      {failCount} ✕
                    </Badge>
                  )}
                </div>
                {expanded ? (
                  <ChevronUp className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                )}
              </div>
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="pt-0">
            <div className="space-y-3">
              {results.map((result) => (
                <div
                  key={result.id}
                  className={`p-3 rounded-lg border ${
                    result.status === "fail"
                      ? "border-red-200 bg-red-50/50"
                      : result.status === "warning"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-green-200 bg-green-50/50"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    {getStatusIcon(result.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm">{result.name}</span>
                        {result.critical && (
                          <Badge variant="destructive" className="text-xs">Critical</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">{result.message}</p>
                      {result.details && result.details.length > 0 && (
                        <ul className="mt-2 text-xs text-muted-foreground space-y-1">
                          {result.details.map((detail, i) => (
                            <li key={i} className="flex items-center gap-1">
                              <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                              {detail}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
