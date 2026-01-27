import { useState, useEffect, ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Copy, 
  Download, 
  ExternalLink, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle,
  User,
  Shield,
  Map,
  Navigation
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { 
  ROUTE_REGISTRY, 
  getAdminNavItems, 
  getCoachNavItems, 
  getClientNavItems,
  canAccessRoute,
  isRouteBlockedForRole,
  AppRole 
} from "@/lib/routeConfig";
import { DiagnosticsErrorBoundary } from "@/components/admin/DiagnosticsErrorBoundary";

interface SessionInfo {
  userId: string | null;
  email: string | null;
  roles: string[];
  isAuthenticated: boolean;
}

export default function SiteMapDiagnostics() {
  const location = useLocation();
  const [sessionInfo, setSessionInfo] = useState<SessionInfo>({
    userId: null,
    email: null,
    roles: [],
    isAuthenticated: false,
  });
  const [loading, setLoading] = useState(true);

  // Get nav items from centralized config
  const adminNavItems = getAdminNavItems();
  const coachNavItems = getCoachNavItems();
  const clientNavItems = getClientNavItems();

  useEffect(() => {
    loadSessionInfo();
  }, []);

  const loadSessionInfo = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        setSessionInfo({ userId: null, email: null, roles: [], isAuthenticated: false });
        setLoading(false);
        return;
      }

      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      setSessionInfo({
        userId: user.id,
        email: user.email || null,
        roles: roles?.map(r => r.role) || [],
        isAuthenticated: true,
      });
    } catch (error) {
      console.error("Error loading session info:", error);
    } finally {
      setLoading(false);
    }
  };

  const isAccessibleToCurrentUser = (route: typeof ROUTE_REGISTRY[0]): boolean => {
    // Check if any of the user's roles are blocked from this route
    for (const role of sessionInfo.roles) {
      if (isRouteBlockedForRole(route.path, role as AppRole)) {
        return false;
      }
    }
    return canAccessRoute(route.path, sessionInfo.roles);
  };

  const isNavVisibleToCurrentUser = (requiredRoles: AppRole[]): boolean => {
    if (!sessionInfo.isAuthenticated) return false;
    return requiredRoles.some(role => 
      role === "authenticated" || sessionInfo.roles.includes(role)
    );
  };

  const getLayoutBadgeColor = (layout: string) => {
    switch (layout) {
      case "AdminLayout": return "bg-destructive/10 text-destructive";
      case "CoachLayout": return "bg-primary/10 text-primary";
      case "ClientLayout": return "bg-accent/10 text-accent-foreground";
      default: return "bg-muted text-muted-foreground";
    }
  };

  const getRoleBadges = (roles: AppRole[]) => {
    return roles.map(role => {
      let className = "bg-muted text-muted-foreground";
      if (role === "admin") className = "bg-destructive/10 text-destructive";
      if (role === "coach") className = "bg-primary/10 text-primary";
      if (role === "authenticated") className = "bg-accent/10 text-accent-foreground";
      return <Badge key={role} variant="outline" className={className}>{role}</Badge>;
    });
  };

  const handleOpenRoute = (path: string) => {
    window.open(path, "_blank");
  };

  const generateReport = () => {
    return {
      generatedAt: new Date().toISOString(),
      session: sessionInfo,
      currentRoute: location.pathname,
      routes: ROUTE_REGISTRY.map(r => ({
        id: r.id,
        path: r.path,
        label: r.label,
        layout: r.layout,
        requiredRoles: r.requiredRoles,
        showInNav: r.showInNav,
        navGroup: r.navGroup,
      })),
      navigation: {
        admin: adminNavItems.map(i => ({ label: i.label, path: i.path, roles: i.requiredRoles })),
        coach: coachNavItems.map(i => ({ label: i.label, path: i.path, roles: i.requiredRoles })),
        client: clientNavItems.map(i => ({ label: i.label, path: i.path, roles: i.requiredRoles })),
      },
      accessibilityReport: ROUTE_REGISTRY.map(route => ({
        path: route.path,
        label: route.label,
        accessibleToCurrentUser: isAccessibleToCurrentUser(route),
      })),
    };
  };

  const handleCopyReport = async () => {
    try {
      const report = generateReport();
      await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
      toast.success("Report copied to clipboard");
    } catch (error) {
      toast.error("Failed to copy report");
    }
  };

  const handleDownloadReport = () => {
    const report = generateReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `site-map-audit-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Report downloaded");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Map className="h-6 w-6" />
            Site Map & Navigation Audit
          </h1>
          <p className="text-muted-foreground">
            Diagnose routing issues and verify navigation visibility
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopyReport}>
            <Copy className="h-4 w-4 mr-2" />
            Copy Report
          </Button>
          <Button variant="outline" onClick={handleDownloadReport}>
            <Download className="h-4 w-4 mr-2" />
            Download JSON
          </Button>
        </div>
      </div>

      {/* Section A: Current Session Summary */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Current Session Summary
          </CardTitle>
          <CardDescription>Your authentication state and detected roles</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">User ID</p>
              <p className="font-mono text-sm">{sessionInfo.userId || "Not authenticated"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Email</p>
              <p className="text-sm">{sessionInfo.email || "N/A"}</p>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Detected Roles</p>
              <div className="flex flex-wrap gap-1">
                {sessionInfo.roles.length > 0 ? (
                  sessionInfo.roles.map(role => (
                    <Badge key={role} variant="secondary">{role}</Badge>
                  ))
                ) : (
                  <Badge variant="outline">No roles</Badge>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium text-muted-foreground">Current Route</p>
              <p className="font-mono text-sm">{location.pathname}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="routes" className="space-y-4">
        <TabsList>
          <TabsTrigger value="routes" className="flex items-center gap-2">
            <Map className="h-4 w-4" />
            Route Inventory ({ROUTE_REGISTRY.length})
          </TabsTrigger>
          <TabsTrigger value="navigation" className="flex items-center gap-2">
            <Navigation className="h-4 w-4" />
            Navigation Inventory
          </TabsTrigger>
        </TabsList>

        {/* Section B: Route Inventory */}
        <TabsContent value="routes">
          <DiagnosticsErrorBoundary fallbackTitle="Route Inventory Error">
          <Card>
            <CardHeader>
              <CardTitle>Route Inventory (Source of Truth)</CardTitle>
              <CardDescription>
                All routes from centralized routeConfig.ts - the single source of truth
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Route ID</TableHead>
                    <TableHead>Path</TableHead>
                    <TableHead>Layout</TableHead>
                    <TableHead>Required Role(s)</TableHead>
                    <TableHead>In Nav?</TableHead>
                    <TableHead>Accessible?</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ROUTE_REGISTRY.map((route) => {
                    const accessible = isAccessibleToCurrentUser(route);
                    return (
                      <TableRow key={route.id}>
                        <TableCell className="font-medium font-mono text-xs">{route.id}</TableCell>
                        <TableCell className="font-mono text-sm">{route.path}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={getLayoutBadgeColor(route.layout)}>
                            {route.layout}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {getRoleBadges(route.requiredRoles)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {route.showInNav ? (
                            <CheckCircle2 className="h-4 w-4 text-primary" />
                          ) : (
                            <XCircle className="h-4 w-4 text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell>
                          {accessible ? (
                            <Badge variant="outline" className="bg-accent/10 text-accent-foreground">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              No
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleOpenRoute(route.path.replace(/:[\w]+/g, "test"))}
                            disabled={route.path === "*"}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </DiagnosticsErrorBoundary>
        </TabsContent>

        {/* Section C: Navigation Inventory */}
        <TabsContent value="navigation" className="space-y-4">
          <DiagnosticsErrorBoundary fallbackTitle="Navigation Inventory Error">
          {/* Admin Navigation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-destructive" />
                Admin Navigation Items ({adminNavItems.length})
              </CardTitle>
              <CardDescription>Items shown in the Admin sidebar - ADMIN ONLY</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Target Path</TableHead>
                    <TableHead>Required Role(s)</TableHead>
                    <TableHead>Visible to You?</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {adminNavItems.map((item) => {
                    const visible = isNavVisibleToCurrentUser(item.requiredRoles);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell className="font-mono text-sm">{item.path}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {getRoleBadges(item.requiredRoles)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {visible ? (
                            <Badge variant="outline" className="bg-accent/10 text-accent-foreground">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              No
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleOpenRoute(item.path)}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Coach Navigation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-primary" />
                Coach Navigation Items ({coachNavItems.length})
              </CardTitle>
              <CardDescription>Items shown in the Coach sidebar - COACH ONLY (no admin access)</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Target Path</TableHead>
                    <TableHead>Required Role(s)</TableHead>
                    <TableHead>Visible to You?</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coachNavItems.map((item) => {
                    const visible = isNavVisibleToCurrentUser(item.requiredRoles);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell className="font-mono text-sm">{item.path}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {getRoleBadges(item.requiredRoles)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {visible ? (
                            <Badge variant="outline" className="bg-accent/10 text-accent-foreground">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              No
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleOpenRoute(item.path)}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* Client Navigation */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Shield className="h-5 w-5 text-accent-foreground" />
                Client Navigation Items ({clientNavItems.length})
              </CardTitle>
              <CardDescription>Items shown in the Client sidebar</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Label</TableHead>
                    <TableHead>Target Path</TableHead>
                    <TableHead>Required Role(s)</TableHead>
                    <TableHead>Visible to You?</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientNavItems.map((item) => {
                    const visible = isNavVisibleToCurrentUser(item.requiredRoles);
                    return (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium">{item.label}</TableCell>
                        <TableCell className="font-mono text-sm">{item.path}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {getRoleBadges(item.requiredRoles)}
                          </div>
                        </TableCell>
                        <TableCell>
                          {visible ? (
                            <Badge variant="outline" className="bg-accent/10 text-accent-foreground">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              Yes
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="bg-destructive/10 text-destructive">
                              <XCircle className="h-3 w-3 mr-1" />
                              No
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Button variant="ghost" size="sm" onClick={() => handleOpenRoute(item.path)}>
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          </DiagnosticsErrorBoundary>
        </TabsContent>
      </Tabs>

      {/* Summary Alert */}
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Routing Audit Summary</AlertTitle>
        <AlertDescription>
          <div className="mt-2 space-y-1 text-sm">
            <p><strong>Total Routes:</strong> {ROUTE_REGISTRY.length}</p>
            <p><strong>Routes accessible to you:</strong> {ROUTE_REGISTRY.filter(isAccessibleToCurrentUser).length}</p>
            <p><strong>Admin nav items:</strong> {adminNavItems.length} (admin role only)</p>
            <p><strong>Coach nav items:</strong> {coachNavItems.length} (coach role only)</p>
            <p><strong>Client nav items:</strong> {clientNavItems.length}</p>
          </div>
        </AlertDescription>
      </Alert>
    </div>
  );
}
