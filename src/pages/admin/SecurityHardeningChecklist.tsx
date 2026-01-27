import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Shield, AlertTriangle, CheckCircle, RefreshCw, Loader2 } from "lucide-react";

interface ChecklistResults {
  tablesWithoutRLS: Array<{ table_name: string }>;
  viewsWithoutSecurityInvoker: Array<{ view_name: string; reloptions: string[] | null }>;
  policiesWithTrueQual: Array<{
    schemaname: string;
    tablename: string;
    policyname: string;
    cmd: string;
    roles: string[];
    qual: string;
  }>;
  timestamp: string;
}

export default function SecurityHardeningChecklist() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ChecklistResults | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runChecks = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const { data, error: fnError } = await supabase.functions.invoke(
        "security-hardening-checklist"
      );

      if (fnError) {
        throw fnError;
      }

      if (data.error) {
        throw new Error(data.error);
      }

      setResults(data);
      toast({
        title: "Security checks complete",
        description: "Review the results below for any issues.",
      });
    } catch (err: any) {
      console.error("Security check error:", err);
      setError(err.message || "Failed to run security checks");
      toast({
        title: "Error",
        description: err.message || "Failed to run security checks",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getTotalIssues = () => {
    if (!results) return 0;
    return (
      results.tablesWithoutRLS.length +
      results.viewsWithoutSecurityInvoker.length +
      results.policiesWithTrueQual.length
    );
  };

  const getStatusBadge = (count: number) => {
    if (count === 0) {
      return (
        <Badge className="bg-green-500/20 text-green-700 dark:text-green-400">
          <CheckCircle className="h-3 w-3 mr-1" />
          PASS
        </Badge>
      );
    }
    return (
      <Badge variant="destructive">
        <AlertTriangle className="h-3 w-3 mr-1" />
        {count} ISSUE{count > 1 ? "S" : ""}
      </Badge>
    );
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate("/admin")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6" />
            Security Hardening Checklist
          </h1>
          <p className="text-muted-foreground">
            Pre-release security audit for RLS, views, and policies
          </p>
        </div>
        <Button onClick={runChecks} disabled={loading}>
          {loading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Run Security Checks
        </Button>
      </div>

      {/* Error Display */}
      {error && (
        <Card className="mb-6 border-destructive">
          <CardContent className="pt-6">
            <p className="text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}

      {/* Summary Card */}
      {results && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Audit Summary</span>
              {getTotalIssues() === 0 ? (
                <Badge className="bg-green-500/20 text-green-700 dark:text-green-400 text-sm">
                  <CheckCircle className="h-4 w-4 mr-1" />
                  ALL CHECKS PASSED
                </Badge>
              ) : (
                <Badge variant="destructive" className="text-sm">
                  <AlertTriangle className="h-4 w-4 mr-1" />
                  {getTotalIssues()} TOTAL ISSUES
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              Last run: {new Date(results.timestamp).toLocaleString()}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium">Tables without RLS</span>
                {getStatusBadge(results.tablesWithoutRLS.length)}
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium">Views without security_invoker</span>
                {getStatusBadge(results.viewsWithoutSecurityInvoker.length)}
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg border">
                <span className="text-sm font-medium">Policies with USING(true)</span>
                {getStatusBadge(results.policiesWithTrueQual.length)}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Tables without RLS */}
      {results && results.tablesWithoutRLS.length > 0 && (
        <Card className="mb-6 border-destructive/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              Tables Without RLS Enabled
            </CardTitle>
            <CardDescription>
              These tables allow unrestricted access. Enable RLS and add policies.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table Name</TableHead>
                  <TableHead>Recommended Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.tablesWithoutRLS.map((table) => (
                  <TableRow key={table.table_name}>
                    <TableCell className="font-mono">{table.table_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      ALTER TABLE public.{table.table_name} ENABLE ROW LEVEL SECURITY;
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Views without security_invoker */}
      {results && results.viewsWithoutSecurityInvoker.length > 0 && (
        <Card className="mb-6 border-yellow-500/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Views Without security_invoker
            </CardTitle>
            <CardDescription>
              These views may bypass RLS on underlying tables. Set security_invoker=true.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>View Name</TableHead>
                  <TableHead>Current Options</TableHead>
                  <TableHead>Recommended Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.viewsWithoutSecurityInvoker.map((view) => (
                  <TableRow key={view.view_name}>
                    <TableCell className="font-mono">{view.view_name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {view.reloptions?.join(", ") || "none"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      ALTER VIEW public.{view.view_name} SET (security_invoker = true);
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Policies with USING(true) */}
      {results && results.policiesWithTrueQual.length > 0 && (
        <Card className="mb-6 border-yellow-500/50">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Policies with USING(true)
            </CardTitle>
            <CardDescription>
              These policies allow all rows to be accessed. Review if this is intentional.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Table</TableHead>
                  <TableHead>Policy Name</TableHead>
                  <TableHead>Command</TableHead>
                  <TableHead>Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.policiesWithTrueQual.map((policy) => (
                  <TableRow key={`${policy.tablename}-${policy.policyname}`}>
                    <TableCell className="font-mono">{policy.tablename}</TableCell>
                    <TableCell>{policy.policyname}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{policy.cmd}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {Array.isArray(policy.roles) ? policy.roles.join(", ") : policy.roles}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No results yet */}
      {!results && !loading && !error && (
        <Card>
          <CardContent className="py-12 text-center">
            <Shield className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              Click "Run Security Checks" to audit your database security configuration.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
