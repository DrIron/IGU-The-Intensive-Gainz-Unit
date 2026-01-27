import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  ShieldCheck, 
  ShieldAlert, 
  Loader2, 
  Play, 
  CheckCircle2,
  XCircle,
  AlertTriangle
} from "lucide-react";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface TestResult {
  name: string;
  status: "PASS" | "FAIL";
  reason: string;
  details: {
    error?: string;
    rowCount: number;
  };
}

interface SmokeTestResponse {
  ran_at: string;
  results: TestResult[];
}

export function SecuritySmokeTests() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SmokeTestResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runTests = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        setError("Not authenticated");
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke("security-smoke-tests", {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });

      if (fnError) {
        console.error("[SecuritySmokeTests] Function error:", fnError);
        setError(fnError.message || "Failed to run security tests");
        return;
      }

      if (data?.error) {
        setError(data.error);
        return;
      }

      setResults(data as SmokeTestResponse);
      
      const failCount = data.results.filter((r: TestResult) => r.status === "FAIL").length;
      if (failCount > 0) {
        toast({
          title: "Security Issues Detected",
          description: `${failCount} test(s) failed - anonymous access detected`,
          variant: "destructive",
        });
      } else {
        toast({
          title: "All Tests Passed",
          description: "Anonymous access is properly blocked",
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      console.error("[SecuritySmokeTests] Error:", err);
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const hasFailures = results?.results.some(r => r.status === "FAIL");
  const passCount = results?.results.filter(r => r.status === "PASS").length ?? 0;
  const failCount = results?.results.filter(r => r.status === "FAIL").length ?? 0;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Security Smoke Tests</CardTitle>
          </div>
          <Button 
            onClick={runTests} 
            disabled={loading}
            size="sm"
            variant={hasFailures ? "destructive" : "default"}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Running...
              </>
            ) : (
              <>
                <Play className="mr-2 h-4 w-4" />
                Run Tests
              </>
            )}
          </Button>
        </div>
        <CardDescription>
          Verifies that key tables/views are NOT readable by anonymous users (server-side check)
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {results && hasFailures && (
          <Alert variant="destructive">
            <ShieldAlert className="h-4 w-4" />
            <AlertTitle>Anonymous Access Detected</AlertTitle>
            <AlertDescription>
              {failCount} resource(s) are accessible to anonymous users. Fix RLS policies before launch.
            </AlertDescription>
          </Alert>
        )}

        {results && !hasFailures && (
          <Alert className="border-green-500/30 bg-green-500/5">
            <CheckCircle2 className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-700">All Tests Passed</AlertTitle>
            <AlertDescription className="text-green-600">
              All {passCount} resources are properly protected from anonymous access.
            </AlertDescription>
          </Alert>
        )}

        {results && (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>
                Last run: {format(new Date(results.ran_at), "PPpp")}
              </span>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                  {passCount} PASS
                </Badge>
                {failCount > 0 && (
                  <Badge variant="destructive">
                    {failCount} FAIL
                  </Badge>
                )}
              </div>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Resource</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="text-right">Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.results.map((result) => (
                  <TableRow key={result.name}>
                    <TableCell className="font-medium font-mono text-sm">
                      {result.name}
                    </TableCell>
                    <TableCell>
                      {result.status === "PASS" ? (
                        <Badge variant="outline" className="bg-green-500/10 text-green-700 border-green-500/30">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          PASS
                        </Badge>
                      ) : (
                        <Badge variant="destructive">
                          <XCircle className="mr-1 h-3 w-3" />
                          FAIL
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                      {result.reason}
                    </TableCell>
                    <TableCell className="text-right text-xs font-mono">
                      {result.details.error ? (
                        <span className="text-muted-foreground" title={result.details.error}>
                          error
                        </span>
                      ) : (
                        <span className={result.details.rowCount > 0 ? "text-destructive" : "text-muted-foreground"}>
                          {result.details.rowCount} rows
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {!results && !loading && !error && (
          <div className="text-center py-8 text-muted-foreground">
            <ShieldCheck className="h-12 w-12 mx-auto mb-3 opacity-30" />
            <p>Click "Run Tests" to verify anonymous access is blocked</p>
            <p className="text-sm mt-1">Tests: coaches_directory, legal_documents, services, team_plan_settings</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
