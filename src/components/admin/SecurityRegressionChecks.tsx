import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Shield, 
  ShieldCheck, 
  ShieldX, 
  ShieldAlert,
  RefreshCw,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle
} from "lucide-react";
import { toast } from "sonner";

interface SecurityCheck {
  id: string;
  name: string;
  description: string;
  status: "pass" | "fail" | "error";
  details: string;
}

interface ChecksResult {
  success: boolean;
  timestamp: string;
  summary: {
    total: number;
    pass: number;
    fail: number;
    error: number;
  };
  checks: SecurityCheck[];
}

export function SecurityRegressionChecks() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<ChecksResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runChecks = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: invokeError } = await supabase.functions.invoke(
        "security-regression-checks",
        { method: "POST" }
      );

      if (invokeError) {
        throw new Error(invokeError.message);
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      setResult(data);
      
      if (data.summary.fail > 0) {
        toast.error(`Security check failed: ${data.summary.fail} issue(s) found`);
      } else if (data.summary.error > 0) {
        toast.warning(`Security check completed with ${data.summary.error} error(s)`);
      } else {
        toast.success("All security checks passed!");
      }
    } catch (err: any) {
      console.error("Security check error:", err);
      setError(err.message || "Failed to run security checks");
      toast.error("Failed to run security checks");
    } finally {
      setLoading(false);
    }
  };

  const getStatusIcon = (status: SecurityCheck["status"]) => {
    switch (status) {
      case "pass":
        return <CheckCircle2 className="h-4 w-4 text-primary" />;
      case "fail":
        return <XCircle className="h-4 w-4 text-destructive" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-accent-foreground" />;
    }
  };

  const getStatusBadge = (status: SecurityCheck["status"]) => {
    switch (status) {
      case "pass":
        return <Badge variant="secondary" className="text-primary border-primary">PASS</Badge>;
      case "fail":
        return <Badge variant="destructive">FAIL</Badge>;
      case "error":
        return <Badge variant="outline">ERROR</Badge>;
    }
  };

  const getOverallIcon = () => {
    if (!result) return <Shield className="h-5 w-5 text-muted-foreground" />;
    if (result.summary.fail > 0) return <ShieldX className="h-5 w-5 text-destructive" />;
    if (result.summary.error > 0) return <ShieldAlert className="h-5 w-5 text-accent-foreground" />;
    return <ShieldCheck className="h-5 w-5 text-primary" />;
  };

  return (
    <Card className="border-border/50">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getOverallIcon()}
            <div>
              <CardTitle className="text-lg">Security Regression Checks</CardTitle>
              <CardDescription>
                Verify RLS policies are correctly enforced for role isolation
              </CardDescription>
            </div>
          </div>
          <Button 
            onClick={runChecks} 
            disabled={loading}
            size="sm"
            variant={result?.summary.fail ? "destructive" : "outline"}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Run Checks
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="p-4 rounded-lg bg-destructive/10 text-destructive border border-destructive/20 mb-4">
            <div className="flex items-center gap-2">
              <ShieldX className="h-4 w-4" />
              <span className="font-medium">Error:</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {!result && !loading && !error && (
          <div className="text-center py-8 text-muted-foreground">
            <Shield className="h-12 w-12 mx-auto mb-3 opacity-50" />
            <p>Click "Run Checks" to verify security policies</p>
          </div>
        )}

        {result && (
          <div className="space-y-4">
            {/* Summary */}
            <div className="flex items-center gap-4 p-3 rounded-lg bg-muted/50">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium">{result.summary.pass} Pass</span>
              </div>
              {result.summary.fail > 0 && (
                <div className="flex items-center gap-2">
                  <XCircle className="h-4 w-4 text-destructive" />
                  <span className="text-sm font-medium text-destructive">{result.summary.fail} Fail</span>
                </div>
              )}
              {result.summary.error > 0 && (
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-accent-foreground" />
                  <span className="text-sm font-medium text-accent-foreground">{result.summary.error} Error</span>
                </div>
              )}
              <div className="ml-auto text-xs text-muted-foreground">
                Last run: {new Date(result.timestamp).toLocaleTimeString()}
              </div>
            </div>

            {/* Individual Checks */}
            <div className="space-y-2">
              {result.checks.map((check) => (
                <div 
                  key={check.id}
                  className={`p-3 rounded-lg border ${
                    check.status === "fail" 
                      ? "border-destructive/30 bg-destructive/10" 
                      : check.status === "error"
                      ? "border-accent/30 bg-accent/10"
                      : "border-border/50 bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2">
                      {getStatusIcon(check.status)}
                      <div>
                        <div className="font-medium text-sm">{check.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {check.description}
                        </div>
                        <div className={`text-xs mt-1 ${
                          check.status === "fail" 
                            ? "text-destructive" 
                            : check.status === "error"
                            ? "text-accent-foreground"
                            : "text-primary"
                        }`}>
                          {check.details}
                        </div>
                      </div>
                    </div>
                    {getStatusBadge(check.status)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
