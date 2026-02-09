import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, User, Shield, CheckCircle, XCircle } from "lucide-react";
import { toast } from "sonner";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface UserInfo {
  id: string;
  email: string | null;
}

export default function RolesDebug() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [lastBootstrapResult, setLastBootstrapResult] = useState<{
    success: boolean;
    bootstrapped: boolean;
    message?: string;
  } | null>(null);

  const fetchUserAndRoles = async () => {
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      
      if (!authUser) {
        setUser(null);
        setRoles([]);
        return;
      }

      setUser({
        id: authUser.id,
        email: authUser.email || null,
      });

      const { data: rolesData, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", authUser.id);

      if (error) {
        console.error("Error fetching roles:", error);
        toast.error("Failed to fetch roles");
        return;
      }

      setRoles(rolesData?.map(r => r.role) || []);
    } catch (error) {
      console.error("Error in fetchUserAndRoles:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUserAndRoles();
  }, []);

  const handleRerunBootstrap = async () => {
    if (!user?.email) {
      toast.error("No authenticated user with email");
      return;
    }

    setBootstrapping(true);
    setLastBootstrapResult(null);

    try {
      const { data, error } = await supabase.functions.invoke("bootstrap-admin-role");

      if (error) {
        console.error("Bootstrap error:", error);
        setLastBootstrapResult({
          success: false,
          bootstrapped: false,
          message: sanitizeErrorForUser(error),
        });
        toast.error("Bootstrap failed", { description: sanitizeErrorForUser(error) });
        return;
      }

      setLastBootstrapResult({
        success: data?.success || false,
        bootstrapped: data?.bootstrapped || false,
        message: data?.bootstrapped 
          ? "Admin role was granted via bootstrap" 
          : "User not in bootstrap allowlist",
      });

      // Update roles from response or refetch
      if (data?.roles) {
        setRoles(data.roles);
      } else {
        await fetchUserAndRoles();
      }

      toast.success("Bootstrap completed", {
        description: data?.bootstrapped 
          ? "Admin role granted" 
          : "Roles refreshed (no changes)",
      });
    } catch (error: any) {
      console.error("Bootstrap exception:", error);
      setLastBootstrapResult({
        success: false,
        bootstrapped: false,
        message: sanitizeErrorForUser(error),
      });
      toast.error("Bootstrap failed", { description: sanitizeErrorForUser(error) });
    } finally {
      setBootstrapping(false);
    }
  };

  const handleRefreshRoles = async () => {
    setLoading(true);
    await fetchUserAndRoles();
    toast.success("Roles refreshed");
  };

  if (loading) {
    return (
      <AdminPageLayout title="Roles Debug" activeSection="debug-roles">
        <div className="flex items-center justify-center p-8">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </AdminPageLayout>
    );
  }

  return (
    <AdminPageLayout title="Roles Debug" activeSection="debug-roles">
      <div className="space-y-6 max-w-2xl">
        {/* Current User Info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Current Auth User
            </CardTitle>
            <CardDescription>
              Information from the authenticated session
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-2">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm font-medium text-muted-foreground">User ID</span>
                <code className="text-xs bg-muted px-2 py-1 rounded font-mono">
                  {user?.id || "Not authenticated"}
                </code>
              </div>
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm font-medium text-muted-foreground">Email</span>
                <span className="text-sm">
                  {user?.email || "No email"}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* User Roles */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="h-5 w-5" />
                  User Roles
                </CardTitle>
                <CardDescription>
                  Roles from the user_roles table
                </CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshRoles}
                disabled={loading}
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {roles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No roles assigned</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {roles.map((role) => (
                  <Badge 
                    key={role} 
                    variant={role === 'admin' ? 'default' : 'secondary'}
                    className="text-sm"
                  >
                    {role}
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Bootstrap Action */}
        <Card>
          <CardHeader>
            <CardTitle>Admin Bootstrap</CardTitle>
            <CardDescription>
              Re-run the bootstrap-admin-role edge function to check if your email 
              is in the ADMIN_BOOTSTRAP_EMAILS allowlist
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleRerunBootstrap}
              disabled={bootstrapping || !user?.email}
              className="w-full"
            >
              {bootstrapping ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Running Bootstrap...
                </>
              ) : (
                <>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Re-run Bootstrap
                </>
              )}
            </Button>

            {lastBootstrapResult && (
              <div className={`p-4 rounded-lg border ${
                lastBootstrapResult.success 
                  ? lastBootstrapResult.bootstrapped 
                    ? 'bg-primary/10 border-primary/20'
                    : 'bg-accent border-border'
                  : 'bg-destructive/10 border-destructive/20'
              }`}>
                <div className="flex items-start gap-3">
                  {lastBootstrapResult.success ? (
                    lastBootstrapResult.bootstrapped ? (
                      <CheckCircle className="h-5 w-5 text-primary mt-0.5" />
                    ) : (
                      <Shield className="h-5 w-5 text-muted-foreground mt-0.5" />
                    )
                  ) : (
                    <XCircle className="h-5 w-5 text-destructive mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium text-sm">
                      {lastBootstrapResult.success ? "Bootstrap Completed" : "Bootstrap Failed"}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      {lastBootstrapResult.message}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info */}
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <p className="text-xs text-muted-foreground">
              <strong>Note:</strong> The bootstrap function checks if your email matches 
              the ADMIN_BOOTSTRAP_EMAILS environment variable (case-insensitive). 
              If matched, the admin role is upserted. Rate limited to 5 calls per hour.
            </p>
          </CardContent>
        </Card>
      </div>
    </AdminPageLayout>
  );
}
