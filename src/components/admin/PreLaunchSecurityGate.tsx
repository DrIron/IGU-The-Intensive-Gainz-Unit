import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Shield, 
  ShieldAlert, 
  ShieldCheck, 
  RefreshCw, 
  ChevronDown, 
  ChevronUp,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2
} from "lucide-react";
import { toast } from "sonner";

interface FailedItem {
  table?: string;
  policy?: string;
  view?: string;
  issue: string;
}

interface SecurityCheck {
  id: string;
  name: string;
  category: string;
  status: "PASS" | "FAIL" | "WARN";
  details: string;
  failedItems?: FailedItem[];
}

interface SecurityGateResponse {
  ran_at: string;
  overall_status: "PASS" | "FAIL";
  checks: SecurityCheck[];
  summary: {
    total: number;
    passed: number;
    failed: number;
    warnings: number;
  };
}

export function PreLaunchSecurityGate() {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SecurityGateResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedChecks, setExpandedChecks] = useState<Set<string>>(new Set());

  const runSecurityGate = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        throw new Error("Not authenticated");
      }

      const { data, error: fnError } = await supabase.functions.invoke("pre-launch-security-gate", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        throw new Error(fnError.message || "Failed to run security gate");
      }

      setResults(data as SecurityGateResponse);
      
      if (data.overall_status === "PASS") {
        toast.success("Security Gate Passed", {
          description: `All ${data.summary.total} checks passed`
        });
      } else {
        toast.error("Security Gate Failed", {
          description: `${data.summary.failed} check(s) failed - review required`
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      toast.error("Security Gate Error", { description: message });
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (checkId: string) => {
    setExpandedChecks(prev => {
      const newSet = new Set(prev);
      if (newSet.has(checkId)) {
        newSet.delete(checkId);
      } else {
        newSet.add(checkId);
      }
      return newSet;
    });
  };

  const getStatusIcon = (status: "PASS" | "FAIL" | "WARN") => {
    switch (status) {
      case "PASS":
        return <CheckCircle2 className="h-5 w-5 text-green-500" />;
      case "FAIL":
        return <XCircle className="h-5 w-5 text-red-500" />;
      case "WARN":
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
    }
  };

  const getStatusBadge = (status: "PASS" | "FAIL" | "WARN") => {
    switch (status) {
      case "PASS":
        return <Badge variant="default" className="bg-green-500">PASS</Badge>;
      case "FAIL":
        return <Badge variant="destructive">FAIL</Badge>;
      case "WARN":
        return <Badge variant="secondary" className="bg-yellow-500 text-black">WARN</Badge>;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case "RLS Policies":
        return "text-blue-600";
      case "Anonymous Access":
        return "text-orange-600";
      case "PHI Protection":
        return "text-red-600";
      case "PII Protection":
        return "text-purple-600";
      case "Role Isolation":
        return "text-indigo-600";
      case "Data Exposure":
        return "text-pink-600";
      case "Legacy Security":
        return "text-gray-600";
      default:
        return "text-gray-600";
    }
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {results?.overall_status === "PASS" ? (
              <ShieldCheck className="h-6 w-6 text-green-500" />
            ) : results?.overall_status === "FAIL" ? (
              <ShieldAlert className="h-6 w-6 text-red-500" />
            ) : (
              <Shield className="h-6 w-6 text-muted-foreground" />
            )}
            <CardTitle className="text-lg">Pre-Launch Security Gate</CardTitle>
          </div>
          <Button 
            onClick={runSecurityGate} 
            disabled={loading}
            variant={results?.overall_status === "FAIL" ? "destructive" : "default"}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                Run Security Checks
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          Comprehensive security validation before production deployment
        </CardDescription>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-4 text-red-800">
            <p className="font-medium">Error running security gate:</p>
            <p className="text-sm">{error}</p>
          </div>
        )}

        {results && (
          <>
            {/* Summary Banner */}
            <div className={`rounded-lg p-4 ${
              results.overall_status === "PASS" 
                ? "bg-green-50 border border-green-200" 
                : "bg-red-50 border border-red-200"
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {results.overall_status === "PASS" ? (
                    <ShieldCheck className="h-8 w-8 text-green-600" />
                  ) : (
                    <ShieldAlert className="h-8 w-8 text-red-600" />
                  )}
                  <div>
                    <p className={`font-bold text-lg ${
                      results.overall_status === "PASS" ? "text-green-800" : "text-red-800"
                    }`}>
                      {results.overall_status === "PASS" 
                        ? "✓ Security Gate PASSED" 
                        : "✗ Security Gate FAILED"
                      }
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Last run: {new Date(results.ran_at).toLocaleString()}
                    </p>
                  </div>
                </div>
                <div className="flex gap-4 text-center">
                  <div>
                    <p className="text-2xl font-bold text-green-600">{results.summary.passed}</p>
                    <p className="text-xs text-muted-foreground">Passed</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-red-600">{results.summary.failed}</p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                  {results.summary.warnings > 0 && (
                    <div>
                      <p className="text-2xl font-bold text-yellow-600">{results.summary.warnings}</p>
                      <p className="text-xs text-muted-foreground">Warnings</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Individual Checks */}
            <div className="space-y-2">
              {results.checks.map((check) => (
                <Collapsible 
                  key={check.id}
                  open={expandedChecks.has(check.id)}
                  onOpenChange={() => toggleCheck(check.id)}
                >
                  <CollapsibleTrigger asChild>
                    <div className={`flex items-center justify-between p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors ${
                      check.status === "FAIL" ? "border-red-200 bg-red-50/50" : 
                      check.status === "WARN" ? "border-yellow-200 bg-yellow-50/50" : 
                      "border-green-200 bg-green-50/50"
                    }`}>
                      <div className="flex items-center gap-3">
                        {getStatusIcon(check.status)}
                        <div>
                          <p className="font-medium text-sm">{check.name}</p>
                          <p className={`text-xs ${getCategoryColor(check.category)}`}>
                            {check.category}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {getStatusBadge(check.status)}
                        {expandedChecks.has(check.id) ? (
                          <ChevronUp className="h-4 w-4" />
                        ) : (
                          <ChevronDown className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="ml-8 mt-2 p-3 rounded-md bg-muted/50 text-sm">
                      <p className="text-muted-foreground mb-2">{check.details}</p>
                      
                      {check.failedItems && check.failedItems.length > 0 && (
                        <div className="mt-3 space-y-2">
                          <p className="font-medium text-red-600">Failed Items:</p>
                          <ul className="space-y-1">
                            {check.failedItems.map((item, idx) => (
                              <li key={idx} className="flex items-start gap-2 text-red-700 bg-red-50 p-2 rounded">
                                <XCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                <div>
                                  {item.table && (
                                    <span className="font-mono text-xs bg-red-100 px-1 rounded mr-2">
                                      {item.table}
                                    </span>
                                  )}
                                  {item.view && (
                                    <span className="font-mono text-xs bg-red-100 px-1 rounded mr-2">
                                      {item.view}
                                    </span>
                                  )}
                                  {item.policy && (
                                    <span className="font-mono text-xs bg-red-100 px-1 rounded mr-2">
                                      {item.policy}
                                    </span>
                                  )}
                                  <span>{item.issue}</span>
                                </div>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>

            {/* Remediation Guidance */}
            {results.overall_status === "FAIL" && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
                <h4 className="font-medium text-amber-800 mb-2">🔧 Remediation Required</h4>
                <ul className="text-sm text-amber-700 space-y-1 list-disc list-inside">
                  <li>Review each failed check above for specific issues</li>
                  <li>Run database migrations to fix RLS policies</li>
                  <li>Use <code className="bg-amber-100 px-1 rounded">supabase--migration</code> tool to apply fixes</li>
                  <li>Re-run this security gate after fixes are applied</li>
                </ul>
              </div>
            )}
          </>
        )}

        {!results && !loading && !error && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Click "Run Security Checks" to validate your security configuration</p>
            <p className="text-xs mt-1">
              Checks RLS policies, anonymous access, PHI protection, and role isolation
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
