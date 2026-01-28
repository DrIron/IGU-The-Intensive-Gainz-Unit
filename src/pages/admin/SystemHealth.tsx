import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  Database,
  Mail,
  Webhook,
  Shield,
  Clock,
  Loader2,
  Server,
  Bug,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { format, formatDistanceToNow } from "date-fns";
import { SystemHealthView } from "@/components/admin/SystemHealthView";
import { getRecentErrors, clearErrorBuffer } from "@/lib/errorLogging";

type HealthStatus = "healthy" | "degraded" | "unhealthy" | "unknown";

interface ServiceHealth {
  name: string;
  status: HealthStatus;
  lastChecked: Date;
  message?: string;
  details?: Record<string, unknown>;
}

/**
 * Admin System Health Dashboard
 * 
 * Provides a single view of:
 * - Supabase connectivity
 * - Last webhook received
 * - Email provider (Resend) status
 * - Recent errors
 * - Data integrity checks
 */
export default function SystemHealth() {
  const [services, setServices] = useState<ServiceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [recentErrors, setRecentErrors] = useState<ReturnType<typeof getRecentErrors>>([]);
  const [lastWebhook, setLastWebhook] = useState<{ time: string; status: string; chargeId?: string } | null>(null);

  useEffect(() => {
    checkAllServices();
    loadRecentErrors();
  }, []);

  const loadRecentErrors = () => {
    setRecentErrors(getRecentErrors());
  };

  const checkAllServices = async () => {
    setLoading(true);
    
    const results: ServiceHealth[] = [];
    
    // Check Supabase connectivity
    results.push(await checkSupabase());
    
    // Check last webhook
    const webhookResult = await checkLastWebhook();
    results.push(webhookResult.health);
    setLastWebhook(webhookResult.lastWebhook);
    
    // Check email provider
    results.push(await checkEmailProvider());
    
    // Check auth service
    results.push(await checkAuthService());
    
    setServices(results);
    setLoading(false);
  };

  const refresh = async () => {
    setRefreshing(true);
    await checkAllServices();
    loadRecentErrors();
    setRefreshing(false);
  };

  // Supabase connectivity check
  const checkSupabase = async (): Promise<ServiceHealth> => {
    const startTime = Date.now();
    try {
      const { error } = await supabase.from("profiles_public").select("id").limit(1);
      const latency = Date.now() - startTime;
      
      if (error) {
        return {
          name: "Supabase Database",
          status: "unhealthy",
          lastChecked: new Date(),
          message: error.message,
        };
      }
      
      return {
        name: "Supabase Database",
        status: latency < 500 ? "healthy" : "degraded",
        lastChecked: new Date(),
        message: `Connected (${latency}ms latency)`,
        details: { latency },
      };
    } catch (error) {
      return {
        name: "Supabase Database",
        status: "unhealthy",
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : "Connection failed",
      };
    }
  };

  // Last webhook check
  const checkLastWebhook = async (): Promise<{ health: ServiceHealth; lastWebhook: typeof lastWebhook }> => {
    try {
      const { data, error } = await supabase
        .from("payment_webhook_events")
        .select("created_at, verification_result, tap_charge_id")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error || !data) {
        return {
          health: {
            name: "Payment Webhooks",
            status: "unknown",
            lastChecked: new Date(),
            message: "No webhook events found",
          },
          lastWebhook: null,
        };
      }

      const lastTime = new Date(data.created_at);
      const hoursSince = (Date.now() - lastTime.getTime()) / (1000 * 60 * 60);
      
      // If no webhook in 24+ hours, might be an issue (unless no payments)
      const status: HealthStatus = hoursSince < 24 ? "healthy" : hoursSince < 72 ? "degraded" : "unknown";

      return {
        health: {
          name: "Payment Webhooks",
          status,
          lastChecked: new Date(),
          message: `Last webhook: ${formatDistanceToNow(lastTime, { addSuffix: true })}`,
          details: { 
            lastWebhookTime: data.created_at,
            verificationResult: data.verification_result,
          },
        },
        lastWebhook: {
          time: data.created_at,
          status: data.verification_result,
          chargeId: data.tap_charge_id,
        },
      };
    } catch (error) {
      return {
        health: {
          name: "Payment Webhooks",
          status: "unknown",
          lastChecked: new Date(),
          message: "Could not check webhook status",
        },
        lastWebhook: null,
      };
    }
  };

  // Email provider check (Resend)
  const checkEmailProvider = async (): Promise<ServiceHealth> => {
    try {
      // Check if we have recent email logs
      const { data, error } = await supabase
        .from("email_logs")
        .select("created_at, status")
        .order("created_at", { ascending: false })
        .limit(5);

      if (error) {
        return {
          name: "Email Service (Resend)",
          status: "unknown",
          lastChecked: new Date(),
          message: "Could not check email logs",
        };
      }

      if (!data || data.length === 0) {
        return {
          name: "Email Service (Resend)",
          status: "unknown",
          lastChecked: new Date(),
          message: "No recent email logs",
        };
      }

      const recentFailures = data.filter(e => e.status === "failed" || e.status === "error").length;
      const lastEmail = new Date(data[0].created_at);
      
      return {
        name: "Email Service (Resend)",
        status: recentFailures === 0 ? "healthy" : recentFailures < 3 ? "degraded" : "unhealthy",
        lastChecked: new Date(),
        message: `Last email: ${formatDistanceToNow(lastEmail, { addSuffix: true })}${recentFailures > 0 ? ` (${recentFailures} recent failures)` : ""}`,
        details: { recentFailures, lastEmailTime: data[0].created_at },
      };
    } catch {
      return {
        name: "Email Service (Resend)",
        status: "unknown",
        lastChecked: new Date(),
        message: "Could not check email status",
      };
    }
  };

  // Auth service check
  const checkAuthService = async (): Promise<ServiceHealth> => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        return {
          name: "Auth Service",
          status: "unhealthy",
          lastChecked: new Date(),
          message: error.message,
        };
      }
      
      return {
        name: "Auth Service",
        status: "healthy",
        lastChecked: new Date(),
        message: session ? "Authenticated" : "No active session",
      };
    } catch (error) {
      return {
        name: "Auth Service",
        status: "unhealthy",
        lastChecked: new Date(),
        message: error instanceof Error ? error.message : "Auth check failed",
      };
    }
  };

  const getStatusIcon = (status: HealthStatus) => {
    switch (status) {
      case "healthy":
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case "degraded":
        return <AlertCircle className="h-5 w-5 text-amber-500" />;
      case "unhealthy":
        return <XCircle className="h-5 w-5 text-destructive" />;
      default:
        return <Clock className="h-5 w-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: HealthStatus) => {
    switch (status) {
      case "healthy":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Healthy</Badge>;
      case "degraded":
        return <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Degraded</Badge>;
      case "unhealthy":
        return <Badge variant="destructive">Unhealthy</Badge>;
      default:
        return <Badge variant="secondary">Unknown</Badge>;
    }
  };

  const getServiceIcon = (name: string) => {
    if (name.includes("Supabase")) return <Database className="h-5 w-5" />;
    if (name.includes("Webhook")) return <Webhook className="h-5 w-5" />;
    if (name.includes("Email")) return <Mail className="h-5 w-5" />;
    if (name.includes("Auth")) return <Shield className="h-5 w-5" />;
    return <Server className="h-5 w-5" />;
  };

  const overallStatus: HealthStatus = services.length === 0 
    ? "unknown"
    : services.some(s => s.status === "unhealthy")
      ? "unhealthy"
      : services.some(s => s.status === "degraded")
        ? "degraded"
        : services.every(s => s.status === "healthy")
          ? "healthy"
          : "unknown";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6 text-primary" />
            System Health
          </h1>
          <p className="text-muted-foreground">
            Monitor system status and catch issues early
          </p>
        </div>
        <Button onClick={refresh} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Overall Status Banner */}
      <Alert className={
        overallStatus === "healthy" 
          ? "border-green-500 bg-green-50" 
          : overallStatus === "degraded"
            ? "border-amber-500 bg-amber-50"
            : overallStatus === "unhealthy"
              ? "border-destructive bg-destructive/10"
              : ""
      }>
        {getStatusIcon(overallStatus)}
        <AlertTitle className="ml-2">
          System Status: {overallStatus.charAt(0).toUpperCase() + overallStatus.slice(1)}
        </AlertTitle>
        <AlertDescription className="ml-7">
          {overallStatus === "healthy" && "All systems operational"}
          {overallStatus === "degraded" && "Some services are experiencing issues"}
          {overallStatus === "unhealthy" && "Critical services are down"}
          {overallStatus === "unknown" && "Unable to determine system status"}
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="services" className="space-y-4">
        <TabsList>
          <TabsTrigger value="services">Services</TabsTrigger>
          <TabsTrigger value="data">Data Integrity</TabsTrigger>
          <TabsTrigger value="errors">
            Recent Errors
            {recentErrors.length > 0 && (
              <Badge variant="secondary" className="ml-2">{recentErrors.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="services" className="space-y-4">
          {/* Service Cards */}
          <div className="grid gap-4 md:grid-cols-2">
            {services.map((service) => (
              <Card key={service.name} className="border-border/50">
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getServiceIcon(service.name)}
                      <CardTitle className="text-lg">{service.name}</CardTitle>
                    </div>
                    {getStatusBadge(service.status)}
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">{service.message}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    Last checked: {format(service.lastChecked, "HH:mm:ss")}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Last Webhook Details */}
          {lastWebhook && (
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Webhook className="h-5 w-5" />
                  Last Webhook Received
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid gap-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Time</span>
                    <span>{format(new Date(lastWebhook.time), "PPpp")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Status</span>
                    <Badge variant={lastWebhook.status === "verified" ? "default" : "secondary"}>
                      {lastWebhook.status}
                    </Badge>
                  </div>
                  {lastWebhook.chargeId && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Charge ID</span>
                      <code className="text-xs bg-muted px-1 rounded">{lastWebhook.chargeId}</code>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="data">
          <SystemHealthView />
        </TabsContent>

        <TabsContent value="errors" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  Recent Frontend Errors
                </CardTitle>
                {recentErrors.length > 0 && (
                  <Button variant="outline" size="sm" onClick={() => { clearErrorBuffer(); loadRecentErrors(); }}>
                    Clear
                  </Button>
                )}
              </div>
              <CardDescription>
                Errors captured during this session
              </CardDescription>
            </CardHeader>
            <CardContent>
              {recentErrors.length === 0 ? (
                <div className="flex items-center gap-2 text-green-600 py-4">
                  <CheckCircle2 className="h-5 w-5" />
                  <span>No errors captured</span>
                </div>
              ) : (
                <div className="space-y-3 max-h-96 overflow-y-auto">
                  {recentErrors.slice().reverse().map((error, index) => (
                    <div key={index} className="border rounded-lg p-3 text-sm">
                      <div className="flex items-center justify-between mb-1">
                        <Badge variant={error.severity === "error" || error.severity === "fatal" ? "destructive" : "secondary"}>
                          {error.severity}
                        </Badge>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(error.timestamp), "HH:mm:ss")}
                        </span>
                      </div>
                      <p className="font-medium">{error.source}</p>
                      <p className="text-muted-foreground">{error.message}</p>
                      {error.stack && (
                        <details className="mt-2">
                          <summary className="text-xs text-muted-foreground cursor-pointer">Stack trace</summary>
                          <pre className="text-xs bg-muted p-2 rounded mt-1 overflow-x-auto">
                            {error.stack.slice(0, 500)}
                          </pre>
                        </details>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
