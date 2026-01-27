import { useState, useEffect } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, ChevronUp, Bug, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { 
  canAccessRoute, 
  isRouteBlockedForRole, 
  findRouteByPath,
  ROUTE_REGISTRY,
  AppRole 
} from "@/lib/routeConfig";

interface RoutesDebugPanelProps {
  /** If true, panel starts expanded */
  defaultOpen?: boolean;
  /** If true, shows the panel (useful for conditional rendering) */
  show?: boolean;
}

/**
 * A debug panel that displays:
 * - Current pathname
 * - Detected user roles
 * - Whether accessControl allows the current route
 * - Route configuration details
 */
export function RoutesDebugPanel({ defaultOpen = false, show = true }: RoutesDebugPanelProps) {
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [roles, setRoles] = useState<string[]>([]);
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data: rolesData } = await supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", user.id);
          setRoles(rolesData?.map(r => r.role) || []);
        } else {
          setUserId(null);
          setRoles([]);
        }
      } catch (error) {
        console.error("Error loading user data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();

    // Subscribe to auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", session.user.id);
        setRoles(rolesData?.map(r => r.role) || []);
      } else {
        setUserId(null);
        setRoles([]);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  if (!show) return null;

  const currentPath = location.pathname;
  const routeConfig = findRouteByPath(currentPath);
  
  // Find matching route (including parameterized routes)
  const matchingRoute = ROUTE_REGISTRY.find(r => {
    if (r.path === currentPath) return true;
    if (r.path.includes(":")) {
      const pattern = r.path.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(currentPath);
    }
    return false;
  });

  const primaryRole: AppRole = roles.includes("admin") 
    ? "admin" 
    : roles.includes("coach") 
    ? "coach" 
    : "client";

  const accessAllowed = canAccessRoute(currentPath, roles);
  const isBlocked = isRouteBlockedForRole(currentPath, primaryRole);

  const getAccessStatus = () => {
    if (isBlocked) {
      return { status: "blocked", color: "destructive", icon: XCircle, label: "BLOCKED" };
    }
    if (accessAllowed) {
      return { status: "allowed", color: "default", icon: CheckCircle2, label: "ALLOWED" };
    }
    return { status: "denied", color: "secondary", icon: AlertTriangle, label: "DENIED" };
  };

  const accessStatus = getAccessStatus();
  const StatusIcon = accessStatus.icon;

  return (
    <div className="fixed bottom-4 right-4 z-50 max-w-md">
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <Card className="border-2 border-amber-500/50 bg-background/95 backdrop-blur shadow-lg">
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer py-3 hover:bg-muted/50 transition-colors">
              <CardTitle className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2">
                  <Bug className="h-4 w-4 text-amber-500" />
                  Routes Debug Panel
                </span>
                <div className="flex items-center gap-2">
                  <Badge 
                    variant={accessStatus.color as any}
                    className={accessStatus.status === "blocked" ? "bg-destructive text-destructive-foreground" : ""}
                  >
                    <StatusIcon className="h-3 w-3 mr-1" />
                    {accessStatus.label}
                  </Badge>
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </div>
              </CardTitle>
            </CardHeader>
          </CollapsibleTrigger>
          
          <CollapsibleContent>
            <CardContent className="pt-0 space-y-4 text-sm">
              {loading ? (
                <div className="text-muted-foreground">Loading...</div>
              ) : (
                <>
                  {/* Current Pathname */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Current Pathname
                    </p>
                    <code className="block bg-muted px-2 py-1 rounded text-xs font-mono">
                      {currentPath}
                    </code>
                  </div>

                  {/* User ID */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      User ID
                    </p>
                    <code className="block bg-muted px-2 py-1 rounded text-xs font-mono truncate">
                      {userId || "Not authenticated"}
                    </code>
                  </div>

                  {/* Detected Roles */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Detected Roles
                    </p>
                    <div className="flex flex-wrap gap-1">
                      {roles.length > 0 ? (
                        roles.map(role => (
                          <Badge 
                            key={role} 
                            variant="secondary"
                            className={
                              role === "admin" ? "bg-destructive/10 text-destructive" :
                              role === "coach" ? "bg-primary/10 text-primary" :
                              "bg-accent/10 text-accent-foreground"
                            }
                          >
                            {role}
                          </Badge>
                        ))
                      ) : (
                        <Badge variant="outline">No roles (unauthenticated)</Badge>
                      )}
                    </div>
                  </div>

                  {/* Primary Role */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Primary Role (for access check)
                    </p>
                    <Badge variant="outline">{primaryRole}</Badge>
                  </div>

                  {/* Access Control Result */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Access Control Result
                    </p>
                    <div className="bg-muted rounded p-2 space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs">canAccessRoute():</span>
                        <Badge variant={accessAllowed ? "default" : "secondary"}>
                          {accessAllowed ? "true" : "false"}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs">isRouteBlockedForRole():</span>
                        <Badge variant={isBlocked ? "destructive" : "default"}>
                          {isBlocked ? "true (BLOCKED)" : "false"}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  {/* Route Configuration */}
                  <div className="space-y-1">
                    <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      Route Configuration
                    </p>
                    {matchingRoute ? (
                      <div className="bg-muted rounded p-2 space-y-1 text-xs">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">ID:</span>
                          <code>{matchingRoute.id}</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Path:</span>
                          <code>{matchingRoute.path}</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Layout:</span>
                          <code>{matchingRoute.layout}</code>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Required:</span>
                          <span>{matchingRoute.requiredRoles.join(", ")}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">In Nav:</span>
                          <span>{matchingRoute.showInNav ? "Yes" : "No"}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="bg-amber-500/10 border border-amber-500/50 rounded p-2 text-xs">
                        <AlertTriangle className="h-3 w-3 inline mr-1 text-amber-500" />
                        No matching route in ROUTE_REGISTRY
                        <p className="text-muted-foreground mt-1">
                          This path may use dynamic matching (/:section) or is not registered.
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Quick Actions */}
                  <div className="pt-2 border-t flex gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs flex-1"
                      onClick={() => console.log({
                        currentPath,
                        userId,
                        roles,
                        primaryRole,
                        accessAllowed,
                        isBlocked,
                        matchingRoute,
                      })}
                    >
                      Log to Console
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="text-xs flex-1"
                      onClick={() => window.location.reload()}
                    >
                      Refresh
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
