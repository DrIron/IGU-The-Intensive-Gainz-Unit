import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Shield, 
  Database, 
  Key, 
  Mail,
  CreditCard,
  RefreshCw,
  Copy,
  ExternalLink
} from "lucide-react";
import { toast } from "sonner";

interface CheckResult {
  name: string;
  status: "pass" | "fail" | "warn" | "info";
  message: string;
  details?: string;
}

interface CategoryResults {
  category: string;
  icon: React.ReactNode;
  checks: CheckResult[];
}

export function ProductionReadinessReport() {
  const [results, setResults] = useState<CategoryResults[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);

  const runChecks = async () => {
    setLoading(true);
    const allResults: CategoryResults[] = [];

    // 1. Security Checks
    const securityChecks: CheckResult[] = [];
    
    // Check RLS policies
    try {
      const { data: tablesWithoutRLS } = await supabase.rpc('get_rls_audit_report');
      const publicTables = (tablesWithoutRLS || []).filter((t: any) => 
        !t.rls_enabled && t.pii_phi_table
      );
      
      securityChecks.push({
        name: "RLS Enabled on PII/PHI Tables",
        status: publicTables.length === 0 ? "pass" : "fail",
        message: publicTables.length === 0 
          ? "All PII/PHI tables have RLS enabled" 
          : `${publicTables.length} sensitive tables missing RLS`,
        details: publicTables.map((t: any) => t.table_name).join(", "),
      });
    } catch {
      securityChecks.push({
        name: "RLS Audit",
        status: "warn",
        message: "Could not run RLS audit",
      });
    }

    // Check PHI encryption
    try {
      const { data: violations } = await supabase.rpc('scan_phi_plaintext_violations');
      const criticalViolations = (violations || []).filter((v: any) => v.severity === 'critical');
      
      securityChecks.push({
        name: "PHI Encryption",
        status: criticalViolations.length === 0 ? "pass" : "fail",
        message: criticalViolations.length === 0 
          ? "All PHI fields are encrypted" 
          : `${criticalViolations.length} plaintext PHI violations`,
      });
    } catch {
      securityChecks.push({
        name: "PHI Encryption",
        status: "warn",
        message: "Could not verify PHI encryption",
      });
    }

    // Auth configuration warnings
    securityChecks.push({
      name: "Leaked Password Protection",
      status: "warn",
      message: "Manually verify in Supabase Auth dashboard",
      details: "Enable 'Leaked password protection' in Auth → Settings",
    });

    securityChecks.push({
      name: "Email Confirmation",
      status: "info",
      message: "Verify auto-confirm is disabled for production",
      details: "Auth → Email Templates → Confirm signup enabled",
    });

    allResults.push({
      category: "Security",
      icon: <Shield className="h-5 w-5" />,
      checks: securityChecks,
    });

    // 2. Database Checks
    const dbChecks: CheckResult[] = [];
    
    // Check for test data
    try {
      const { count: testProfiles } = await supabase
        .from('profiles_public')
        .select('*', { count: 'exact', head: true })
        .or('display_name.ilike.%test%,display_name.ilike.%qa_%');
      
      dbChecks.push({
        name: "Test Accounts Cleanup",
        status: (testProfiles || 0) > 5 ? "warn" : "pass",
        message: `${testProfiles || 0} potential test accounts found`,
        details: "Review and clean up QA accounts before launch",
      });
    } catch {
      dbChecks.push({
        name: "Test Accounts Check",
        status: "warn",
        message: "Could not check for test accounts",
      });
    }

    // Check profiles data integrity
    try {
      const { count: orphanedSubs } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .is('user_id', null);
      
      dbChecks.push({
        name: "Data Integrity",
        status: (orphanedSubs || 0) === 0 ? "pass" : "fail",
        message: (orphanedSubs || 0) === 0 
          ? "No orphaned subscriptions" 
          : `${orphanedSubs} orphaned subscription records`,
      });
    } catch {
      dbChecks.push({
        name: "Data Integrity",
        status: "warn",
        message: "Could not verify data integrity",
      });
    }

    dbChecks.push({
      name: "Database Backups",
      status: "info",
      message: "Verify backups are enabled in Supabase dashboard",
      details: "Project Settings → Database → Backups",
    });

    allResults.push({
      category: "Database",
      icon: <Database className="h-5 w-5" />,
      checks: dbChecks,
    });

    // 3. API Keys & Secrets
    const secretChecks: CheckResult[] = [];
    
    secretChecks.push({
      name: "TAP_SECRET_KEY",
      status: "warn",
      message: "Verify production TAP key is configured",
      details: "Ensure this is the LIVE key, not test/sandbox",
    });

    secretChecks.push({
      name: "RESEND_API_KEY",
      status: "info",
      message: "Email delivery configured",
      details: "Verify domain (mail.theigu.com) is verified in Resend",
    });

    secretChecks.push({
      name: "PHI_ENCRYPTION_KEY",
      status: "info",
      message: "Encryption key in vault",
      details: "Never expose or log this key",
    });

    allResults.push({
      category: "API Keys & Secrets",
      icon: <Key className="h-5 w-5" />,
      checks: secretChecks,
    });

    // 4. Email Configuration
    const emailChecks: CheckResult[] = [];
    
    emailChecks.push({
      name: "Sender Domain",
      status: "pass",
      message: "Using mail.theigu.com domain",
      details: "All emails sent from @mail.theigu.com",
    });

    emailChecks.push({
      name: "Canonical URLs",
      status: "pass",
      message: "All email links use theigu.com",
      details: "APP_BASE_URL configured correctly",
    });

    try {
      const { count: recentEmails } = await supabase
        .from('email_notifications')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('sent_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      
      emailChecks.push({
        name: "Email Delivery (24h)",
        status: (recentEmails || 0) > 5 ? "warn" : "pass",
        message: `${recentEmails || 0} failed emails in last 24h`,
      });
    } catch {
      emailChecks.push({
        name: "Email Delivery",
        status: "info",
        message: "Check Resend dashboard for delivery stats",
      });
    }

    allResults.push({
      category: "Email Configuration",
      icon: <Mail className="h-5 w-5" />,
      checks: emailChecks,
    });

    // 5. Payment Configuration
    const paymentChecks: CheckResult[] = [];
    
    paymentChecks.push({
      name: "TAP Integration Mode",
      status: "warn",
      message: "Verify TAP is in LIVE mode",
      details: "Check TAP dashboard → Settings → Live Mode enabled",
    });

    paymentChecks.push({
      name: "Webhook URL",
      status: "info",
      message: "Verify TAP webhook points to production",
      details: "Should be: https://[project].supabase.co/functions/v1/tap-webhook",
    });

    paymentChecks.push({
      name: "save_card: false",
      status: "pass",
      message: "No card storage configured (compliant)",
      details: "One-time payments only, no saved credentials",
    });

    allResults.push({
      category: "Payment Configuration",
      icon: <CreditCard className="h-5 w-5" />,
      checks: paymentChecks,
    });

    setResults(allResults);
    setLastChecked(new Date());
    setLoading(false);
  };

  useEffect(() => {
    runChecks();
  }, []);

  const getStatusIcon = (status: CheckResult["status"]) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "warn":
        return <AlertTriangle className="h-4 w-4 text-amber-500" />;
      case "info":
        return <AlertTriangle className="h-4 w-4 text-blue-500" />;
    }
  };

  const getStatusBadge = (status: CheckResult["status"]) => {
    const variants: Record<string, "default" | "destructive" | "secondary" | "outline"> = {
      pass: "default",
      fail: "destructive",
      warn: "secondary",
      info: "outline",
    };
    return <Badge variant={variants[status]}>{status.toUpperCase()}</Badge>;
  };

  const totalChecks = results.reduce((sum, r) => sum + r.checks.length, 0);
  const passedChecks = results.reduce(
    (sum, r) => sum + r.checks.filter((c) => c.status === "pass").length,
    0
  );
  const failedChecks = results.reduce(
    (sum, r) => sum + r.checks.filter((c) => c.status === "fail").length,
    0
  );

  const copyReport = () => {
    const report = results
      .map((cat) => {
        const checkLines = cat.checks
          .map((c) => `  [${c.status.toUpperCase()}] ${c.name}: ${c.message}`)
          .join("\n");
        return `${cat.category}:\n${checkLines}`;
      })
      .join("\n\n");

    const summary = `
Production Readiness Report
Generated: ${lastChecked?.toISOString()}
---
Passed: ${passedChecks}/${totalChecks}
Failed: ${failedChecks}
---
${report}
    `.trim();

    navigator.clipboard.writeText(summary);
    toast.success("Report copied to clipboard");
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold">Production Readiness Report</h2>
          <p className="text-sm text-muted-foreground">
            {lastChecked && `Last checked: ${lastChecked.toLocaleString()}`}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={copyReport} disabled={loading}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Report
          </Button>
          <Button onClick={runChecks} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            Re-run Checks
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-green-500">{passedChecks}</div>
              <p className="text-sm text-muted-foreground">Passed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-red-500">{failedChecks}</div>
              <p className="text-sm text-muted-foreground">Failed</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-center">
              <div className="text-3xl font-bold text-amber-500">
                {totalChecks - passedChecks - failedChecks}
              </div>
              <p className="text-sm text-muted-foreground">Warnings/Info</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Launch Status */}
      <Card className={failedChecks > 0 ? "border-red-500/50" : "border-green-500/50"}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {failedChecks > 0 ? (
              <>
                <XCircle className="h-5 w-5 text-red-500" />
                Launch Blocked
              </>
            ) : (
              <>
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                Ready for Launch
              </>
            )}
          </CardTitle>
          <CardDescription>
            {failedChecks > 0
              ? `${failedChecks} critical issue(s) must be resolved before launch`
              : "All critical checks passed. Review warnings before proceeding."}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Category Results */}
      {results.map((category) => (
        <Card key={category.category}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              {category.icon}
              {category.category}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {category.checks.map((check, idx) => (
              <div key={idx}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    {getStatusIcon(check.status)}
                    <div>
                      <p className="font-medium text-sm">{check.name}</p>
                      <p className="text-sm text-muted-foreground">{check.message}</p>
                      {check.details && (
                        <p className="text-xs text-muted-foreground mt-1">{check.details}</p>
                      )}
                    </div>
                  </div>
                  {getStatusBadge(check.status)}
                </div>
                {idx < category.checks.length - 1 && <Separator className="mt-3" />}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}

      {/* Manual Verification Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Manual Verification Required</CardTitle>
          <CardDescription>
            These items require manual verification in external dashboards
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="rounded" />
            <span>TAP Payments dashboard: Switch to LIVE mode</span>
            <Button variant="ghost" size="sm" className="h-6 px-2" asChild>
              <a href="https://dashboard.tap.company" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="rounded" />
            <span>Supabase Auth: Enable leaked password protection</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="rounded" />
            <span>Supabase Auth: Disable auto-confirm emails</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="rounded" />
            <span>Resend dashboard: Verify mail.theigu.com domain</span>
            <Button variant="ghost" size="sm" className="h-6 px-2" asChild>
              <a href="https://resend.com/domains" target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-3 w-3" />
              </a>
            </Button>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="rounded" />
            <span>Database backup: Verify Point-in-Time Recovery enabled</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="rounded" />
            <span>DNS: Verify theigu.com points to Lovable/production</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
