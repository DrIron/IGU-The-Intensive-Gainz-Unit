import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, ShieldCheck, ShieldX, Loader2 } from "lucide-react";
import { toast } from "sonner";

interface DiagnosticData {
  userId: string | null;
  email: string | null;
  roles: string[];
  isAdmin: boolean;
  isCoach: boolean;
  hasRoleAdminResult: boolean | null;
  hasRoleCoachResult: boolean | null;
  currentUrl: string;
  timestamp: string;
}

export default function AccessDebug() {
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [data, setData] = useState<DiagnosticData>({
    userId: null,
    email: null,
    roles: [],
    isAdmin: false,
    isCoach: false,
    hasRoleAdminResult: null,
    hasRoleCoachResult: null,
    currentUrl: "",
    timestamp: "",
  });

  useEffect(() => {
    const fetchDiagnostics = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        
        if (!user) {
          setLoading(false);
          return;
        }

        // Fetch roles from user_roles table
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);

        const roles = rolesData?.map(r => r.role) || [];
        const isAdmin = roles.includes("admin");
        const isCoach = roles.includes("coach");

        // Test has_role function directly via RPC if available
        let hasRoleAdminResult: boolean | null = null;
        let hasRoleCoachResult: boolean | null = null;

        try {
          const { data: adminCheck } = await supabase.rpc("has_role", {
            _user_id: user.id,
            _role: "admin",
          });
          hasRoleAdminResult = adminCheck;
        } catch {
          // Function may not be exposed via RPC
        }

        try {
          const { data: coachCheck } = await supabase.rpc("has_role", {
            _user_id: user.id,
            _role: "coach",
          });
          hasRoleCoachResult = coachCheck;
        } catch {
          // Function may not be exposed via RPC
        }

        setData({
          userId: user.id,
          email: user.email || null,
          roles,
          isAdmin,
          isCoach,
          hasRoleAdminResult,
          hasRoleCoachResult,
          currentUrl: window.location.href,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        console.error("Error fetching diagnostics:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDiagnostics();
  }, []);

  const copyDiagnostic = async () => {
    const diagnosticText = `
=== Access Diagnostic Report ===
Timestamp: ${data.timestamp}
URL: ${data.currentUrl}

--- User Identity ---
User ID: ${data.userId || "Not authenticated"}
Email: ${data.email || "N/A"}

--- Roles (from user_roles table) ---
Roles: ${data.roles.length > 0 ? data.roles.join(", ") : "None"}

--- Computed Booleans ---
isAdmin: ${data.isAdmin}
isCoach: ${data.isCoach}

--- has_role() RPC Results ---
has_role(admin): ${data.hasRoleAdminResult ?? "RPC not available"}
has_role(coach): ${data.hasRoleCoachResult ?? "RPC not available"}
================================
`.trim();

    try {
      await navigator.clipboard.writeText(diagnosticText);
      setCopied(true);
      toast.success("Diagnostic copied to clipboard");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy to clipboard");
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!data.userId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <ShieldX className="mx-auto h-12 w-12 text-destructive mb-4" />
            <p className="text-lg font-medium">Not Authenticated</p>
            <p className="text-sm text-muted-foreground mt-2">
              Please log in to view access diagnostics.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Access Debug</h1>
            <p className="text-sm text-muted-foreground">
              Internal diagnostics for role-based access control
            </p>
          </div>
          <Button onClick={copyDiagnostic} variant="outline">
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                Copied
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                Copy Diagnostic
              </>
            )}
          </Button>
        </div>

        {/* User Identity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">User Identity</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">User ID</span>
              <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                {data.userId}
              </code>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Email</span>
              <span className="text-sm font-medium">{data.email}</span>
            </div>
          </CardContent>
        </Card>

        {/* Roles from Database */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Roles (user_roles table)</CardTitle>
          </CardHeader>
          <CardContent>
            {data.roles.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {data.roles.map((role) => (
                  <Badge key={role} variant="secondary" className="text-sm">
                    {role}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No roles assigned</p>
            )}
          </CardContent>
        </Card>

        {/* Computed Booleans */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Computed Booleans</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">isAdmin</span>
              <div className="flex items-center gap-2">
                {data.isAdmin ? (
                  <ShieldCheck className="h-4 w-4 text-primary" />
                ) : (
                  <ShieldX className="h-4 w-4 text-muted-foreground" />
                )}
                <Badge variant={data.isAdmin ? "default" : "outline"}>
                  {data.isAdmin ? "true" : "false"}
                </Badge>
              </div>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">isCoach</span>
              <div className="flex items-center gap-2">
                {data.isCoach ? (
                  <ShieldCheck className="h-4 w-4 text-primary" />
                ) : (
                  <ShieldX className="h-4 w-4 text-muted-foreground" />
                )}
                <Badge variant={data.isCoach ? "default" : "outline"}>
                  {data.isCoach ? "true" : "false"}
                </Badge>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* has_role() RPC Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">has_role() Function Results</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <code className="text-xs bg-muted px-2 py-1 rounded">
                has_role(user_id, 'admin')
              </code>
              <Badge variant={data.hasRoleAdminResult ? "default" : "outline"}>
                {data.hasRoleAdminResult === null
                  ? "N/A"
                  : data.hasRoleAdminResult
                  ? "true"
                  : "false"}
              </Badge>
            </div>
            <div className="flex justify-between items-center py-2">
              <code className="text-xs bg-muted px-2 py-1 rounded">
                has_role(user_id, 'coach')
              </code>
              <Badge variant={data.hasRoleCoachResult ? "default" : "outline"}>
                {data.hasRoleCoachResult === null
                  ? "N/A"
                  : data.hasRoleCoachResult
                  ? "true"
                  : "false"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Request Metadata</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b">
              <span className="text-sm text-muted-foreground">Current URL</span>
              <code className="text-xs bg-muted px-2 py-1 rounded max-w-[300px] truncate">
                {data.currentUrl}
              </code>
            </div>
            <div className="flex justify-between items-center py-2">
              <span className="text-sm text-muted-foreground">Timestamp</span>
              <span className="text-sm font-mono">{data.timestamp}</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
