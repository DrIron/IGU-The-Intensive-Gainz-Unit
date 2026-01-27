import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AdminPageLayout } from "@/components/admin/AdminPageLayout";
import { useToast } from "@/hooks/use-toast";
import { 
  Search, 
  Copy, 
  User, 
  CreditCard, 
  Package, 
  Mail, 
  ChevronDown, 
  Loader2,
  AlertCircle,
  CheckCircle2
} from "lucide-react";
import { format } from "date-fns";

interface AuthUser {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
}

interface Profile {
  id: string;
  status: string | null;
  payment_exempt: boolean;
  onboarding_completed_at: string | null;
  activation_completed_at: string | null;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  date_of_birth: string | null;
  payment_deadline: string | null;
}

interface Subscription {
  id: string;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  next_billing_date: string | null;
  tap_subscription_id: string | null;
  tap_customer_id: string | null;
  tap_charge_id: string | null;
  coach_id: string | null;
  service_id: string;
  discount_code_id: string | null;
  base_price_kwd: number | null;
  billing_amount_kwd: number | null;
  discount_cycles_used: number;
  created_at: string | null;
  coach?: {
    first_name: string;
    last_name: string | null;
  } | null;
  discount_code?: {
    code: string;
    discount_type: string;
    discount_value: number;
    duration_type: string | null;
    duration_cycles: number | null;
  } | null;
}

interface Service {
  id: string;
  name: string;
  type: string;
  price_kwd: number;
}

interface EmailNotification {
  id: string;
  sent_at: string | null;
  notification_type: string;
  status: string | null;
}

interface DiscountRedemption {
  id: string;
  cycles_applied: number;
  cycles_remaining: number | null;
  total_saved_kwd: number;
}

interface DiagnosticsData {
  authUser: AuthUser | null;
  profile: Profile | null;
  subscriptions: Subscription[];
  currentSubscription: Subscription | null;
  service: Service | null;
  emailNotifications: EmailNotification[];
  discountRedemption: DiscountRedemption | null;
}

export default function ClientDiagnostics() {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [searchEmail, setSearchEmail] = useState("");
  const [searchUserId, setSearchUserId] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [data, setData] = useState<DiagnosticsData | null>(null);

  const handleSearch = useCallback(async (emailOverride?: string) => {
    const email = emailOverride ?? searchEmail;
    if (!email.trim() && !searchUserId.trim()) {
      toast({
        title: "Search required",
        description: "Please enter an email or user ID to search.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    setSearched(true);
    setData(null);

    try {
      let userId: string | null = null;
      let authUser: AuthUser | null = null;

      if (email.trim()) {
        // Admin: search profiles_private for email via RPC
        // First get all profiles_private with matching email
        const { data: privateData, error: privateError } = await supabase
          .from("profiles_private")
          .select("profile_id, email, created_at")
          .eq("email", searchEmail.trim().toLowerCase())
          .maybeSingle();

        if (privateError) throw privateError;
        
        if (privateData) {
          userId = privateData.profile_id;
          authUser = {
            id: privateData.profile_id,
            email: privateData.email || '',
            created_at: privateData.created_at || "",
            last_sign_in_at: null,
          };
        }
      } else if (searchUserId.trim()) {
        userId = searchUserId.trim();
        // Get auth user info via admin RPC
        const { data: privateData } = await supabase
          .rpc('admin_get_profile_private', { p_user_id: userId });
        
        if (privateData && privateData.length > 0) {
          authUser = {
            id: privateData[0].id,
            email: privateData[0].email || '',
            created_at: privateData[0].created_at || "",
            last_sign_in_at: null,
          };
        }
      }

      if (!userId) {
        setData(null);
        setLoading(false);
        return;
      }

      // Get profile data: public + private via RPC
      const [{ data: profilePublic }, { data: profilePrivate }] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("id, status, payment_exempt, onboarding_completed_at, activation_completed_at, first_name, payment_deadline, created_at")
          .eq("id", userId)
          .maybeSingle(),
        supabase.rpc('admin_get_profile_private', { p_user_id: userId })
      ]);

      const priv = profilePrivate?.[0];
      const profile = profilePublic ? {
        id: profilePublic.id,
        status: profilePublic.status,
        payment_exempt: profilePublic.payment_exempt,
        onboarding_completed_at: profilePublic.onboarding_completed_at,
        activation_completed_at: profilePublic.activation_completed_at,
        first_name: profilePublic.first_name,
        payment_deadline: profilePublic.payment_deadline,
        full_name: priv?.full_name || null,
        last_name: priv?.last_name || null,
        email: priv?.email || '',
        phone: priv?.phone || null,
        date_of_birth: priv?.date_of_birth || null,
      } : null;

      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select(`
          *,
          coach:coaches!subscriptions_coach_id_fkey(first_name, last_name),
          discount_code:discount_codes(code, discount_type, discount_value, duration_type, duration_cycles)
        `)
        .eq("user_id", userId)
        .order("created_at", { ascending: false });

      const currentSubscription = subscriptions?.find(s => 
        s.status === "active" || s.status === "pending"
      ) || subscriptions?.[0] || null;

      let service: Service | null = null;
      if (currentSubscription?.service_id) {
        const { data: serviceData } = await supabase
          .from("services")
          .select("id, name, type, price_kwd")
          .eq("id", currentSubscription.service_id)
          .maybeSingle();
        service = serviceData;
      }

      const { data: emailNotifications } = await supabase
        .from("email_notifications")
        .select("*")
        .eq("user_id", userId)
        .order("sent_at", { ascending: false })
        .limit(10);

      let discountRedemption: DiscountRedemption | null = null;
      if (currentSubscription?.id) {
        const { data: redemptionData } = await supabase
          .from("discount_redemptions")
          .select("id, cycles_applied, cycles_remaining, total_saved_kwd")
          .eq("subscription_id", currentSubscription.id)
          .maybeSingle();
        discountRedemption = redemptionData;
      }

      setData({
        authUser,
        profile,
        subscriptions: subscriptions || [],
        currentSubscription,
        service,
        emailNotifications: emailNotifications || [],
        discountRedemption,
      });
    } catch (error: any) {
      console.error("Search error:", error);
      toast({
        title: "Search failed",
        description: error.message || "An error occurred while searching.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [searchEmail, searchUserId, toast]);

  // Read email from query params and auto-search
  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setSearchEmail(emailParam);
      handleSearch(emailParam);
    }
  }, [searchParams, handleSearch]);

  const copyDebugSummary = () => {
    if (!data) return;

    const lines: string[] = [
      "=== CLIENT DIAGNOSTICS SUMMARY ===",
      `Generated: ${new Date().toISOString()}`,
      "",
      "--- USER INFO ---",
      `User ID: ${data.authUser?.id || "N/A"}`,
      `Email: ${data.authUser?.email || "N/A"}`,
      `Created: ${data.authUser?.created_at ? format(new Date(data.authUser.created_at), "PPpp") : "N/A"}`,
      "",
      "--- PROFILE ---",
      `Status: ${data.profile?.status || "N/A"}`,
      `Payment Exempt: ${data.profile?.payment_exempt ? "Yes" : "No"}`,
      `Full Name: ${data.profile?.full_name || `${data.profile?.first_name || ""} ${data.profile?.last_name || ""}`.trim() || "N/A"}`,
      `Onboarding Completed: ${data.profile?.onboarding_completed_at ? format(new Date(data.profile.onboarding_completed_at), "PPpp") : "N/A"}`,
      `Activation Completed: ${data.profile?.activation_completed_at ? format(new Date(data.profile.activation_completed_at), "PPpp") : "N/A"}`,
      `Payment Deadline: ${data.profile?.payment_deadline ? format(new Date(data.profile.payment_deadline), "PPpp") : "N/A"}`,
      "",
      "--- SUBSCRIPTION ---",
    ];

    if (data.currentSubscription) {
      lines.push(
        `Subscription ID: ${data.currentSubscription.id}`,
        `Status: ${data.currentSubscription.status || "N/A"}`,
        `Start Date: ${data.currentSubscription.start_date ? format(new Date(data.currentSubscription.start_date), "PPpp") : "N/A"}`,
        `Next Billing: ${data.currentSubscription.next_billing_date ? format(new Date(data.currentSubscription.next_billing_date), "PPpp") : "N/A"}`,
        `Tap Subscription ID: ${data.currentSubscription.tap_subscription_id || "N/A"}`,
        `Tap Customer ID: ${data.currentSubscription.tap_customer_id || "N/A"}`,
        `Tap Charge ID: ${data.currentSubscription.tap_charge_id || "N/A"}`,
        `Coach: ${data.currentSubscription.coach ? `${data.currentSubscription.coach.first_name} ${data.currentSubscription.coach.last_name || ""}` : "N/A"}`
      );
    } else {
      lines.push("No subscription found");
    }

    lines.push(
      "",
      "--- SERVICE ---",
      `Name: ${data.service?.name || "N/A"}`,
      `Type: ${data.service?.type || "N/A"}`,
      `Price: ${data.service ? `${data.service.price_kwd} KWD` : "N/A"}`,
      "",
      "--- DISCOUNT ---"
    );

    if (data.currentSubscription?.discount_code) {
      const dc = data.currentSubscription.discount_code;
      lines.push(
        `Code: ${dc.code}`,
        `Type: ${dc.discount_type}`,
        `Value: ${dc.discount_value}`,
        `Duration: ${dc.duration_type || "one_time"}${dc.duration_cycles ? ` (${dc.duration_cycles} cycles)` : ""}`,
        `Cycles Used: ${data.currentSubscription.discount_cycles_used}`,
        `Total Saved: ${data.discountRedemption?.total_saved_kwd || 0} KWD`
      );
    } else {
      lines.push("No discount applied");
    }

    lines.push(
      "",
      "--- EMAIL NOTIFICATIONS ---",
      `Total Recent: ${data.emailNotifications.length}`,
      `Latest: ${data.emailNotifications[0]?.sent_at ? format(new Date(data.emailNotifications[0].sent_at), "PPpp") : "N/A"}`
    );

    const summary = lines.join("\n");
    navigator.clipboard.writeText(summary);
    toast({
      title: "Debug summary copied",
      description: "The diagnostic summary has been copied to your clipboard.",
    });
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    try {
      return format(new Date(dateStr), "PPpp");
    } catch {
      return dateStr;
    }
  };

  const getStatusBadge = (status: string | null) => {
    const statusMap: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
      active: { variant: "default", label: "Active" },
      pending: { variant: "outline", label: "Pending" },
      pending_payment: { variant: "outline", label: "Pending Payment" },
      pending_coach_approval: { variant: "outline", label: "Pending Coach Approval" },
      needs_medical_review: { variant: "secondary", label: "Medical Review" },
      inactive: { variant: "destructive", label: "Inactive" },
      cancelled: { variant: "destructive", label: "Cancelled" },
      expired: { variant: "destructive", label: "Expired" },
      suspended: { variant: "destructive", label: "Suspended" },
    };
    const config = statusMap[status || ""] || { variant: "secondary" as const, label: status || "Unknown" };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <AdminPageLayout 
      title="Client Diagnostics" 
      subtitle="Debug and inspect client account data"
      activeSection="system-health"
    >
      <div className="space-y-6">
        {/* Action Bar */}
        {data && (
          <div className="flex justify-end">
            <Button onClick={copyDebugSummary} variant="outline">
              <Copy className="h-4 w-4 mr-2" />
              Copy Debug Summary
            </Button>
          </div>
        )}

        {/* Search Panel */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search Client
            </CardTitle>
            <CardDescription>
              Enter a client's email address to view their account details
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex gap-4">
              <div className="flex-1">
                <label className="text-sm font-medium mb-2 block">Client Email</label>
                <Input
                  type="email"
                  placeholder="client@example.com"
                  value={searchEmail}
                  onChange={(e) => setSearchEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                />
              </div>
              <div className="flex items-end">
                <Button onClick={() => handleSearch()} disabled={loading}>
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="h-4 w-4 mr-2" />
                      Search
                    </>
                  )}
                </Button>
              </div>
            </div>

            <Collapsible open={showAdvanced} onOpenChange={setShowAdvanced}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-1">
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                  Advanced Options
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-4">
                <div className="max-w-md">
                  <label className="text-sm font-medium mb-2 block">User ID (optional)</label>
                  <Input
                    type="text"
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    value={searchUserId}
                    onChange={(e) => setSearchUserId(e.target.value)}
                    className="font-mono text-sm"
                  />
                </div>
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>

        {/* No Results Message */}
        {searched && !loading && !data && (
          <Card className="border-dashed">
            <CardContent className="py-12 text-center">
              <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold mb-2">No client found</h3>
              <p className="text-muted-foreground">
                No client found for this email. Please check spelling or confirm they've registered.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Results */}
        {data && (
          <div className="grid md:grid-cols-2 gap-6">
            {/* User Info Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  User Info
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.authUser ? (
                  <>
                    <div>
                      <span className="text-sm text-muted-foreground">User ID</span>
                      <p className="font-mono text-sm break-all">{data.authUser.id}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Email</span>
                      <p>{data.authUser.email}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Created At</span>
                      <p>{formatDate(data.authUser.created_at)}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">No user record found</p>
                )}
              </CardContent>
            </Card>

            {/* Profile Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <User className="h-5 w-5" />
                  Profile
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.profile ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      {getStatusBadge(data.profile.status)}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Payment Exempt:</span>
                      {data.profile.payment_exempt ? (
                        <Badge variant="secondary">Yes</Badge>
                      ) : (
                        <span>No</span>
                      )}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Name</span>
                      <p>
                        {data.profile.full_name || 
                          `${data.profile.first_name || ""} ${data.profile.last_name || ""}`.trim() || 
                          "—"}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Phone</span>
                      <p>{data.profile.phone || "—"}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Date of Birth</span>
                      <p>{data.profile.date_of_birth || "—"}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Onboarding Completed</span>
                      <p className="flex items-center gap-2">
                        {data.profile.onboarding_completed_at ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            {formatDate(data.profile.onboarding_completed_at)}
                          </>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Activation Completed</span>
                      <p className="flex items-center gap-2">
                        {data.profile.activation_completed_at ? (
                          <>
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                            {formatDate(data.profile.activation_completed_at)}
                          </>
                        ) : (
                          "—"
                        )}
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Payment Deadline</span>
                      <p>{formatDate(data.profile.payment_deadline)}</p>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">No profile record found</p>
                )}
              </CardContent>
            </Card>

            {/* Current Subscription Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CreditCard className="h-5 w-5" />
                  Current Subscription
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.currentSubscription ? (
                  <>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Status:</span>
                      {getStatusBadge(data.currentSubscription.status)}
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Subscription ID</span>
                      <p className="font-mono text-xs break-all">{data.currentSubscription.id}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Start Date</span>
                      <p>{formatDate(data.currentSubscription.start_date)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Next Billing</span>
                      <p>{formatDate(data.currentSubscription.next_billing_date)}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Base Price</span>
                      <p>{data.currentSubscription.base_price_kwd ?? "—"} KWD</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Billing Amount</span>
                      <p>{data.currentSubscription.billing_amount_kwd ?? "—"} KWD</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Coach</span>
                      <p>
                        {data.currentSubscription.coach 
                          ? `${data.currentSubscription.coach.first_name} ${data.currentSubscription.coach.last_name || ""}`
                          : "—"}
                      </p>
                    </div>
                    {data.currentSubscription.tap_subscription_id && (
                      <div>
                        <span className="text-sm text-muted-foreground">Tap Subscription ID</span>
                        <p className="font-mono text-xs">{data.currentSubscription.tap_subscription_id}</p>
                      </div>
                    )}
                    {data.currentSubscription.tap_customer_id && (
                      <div>
                        <span className="text-sm text-muted-foreground">Tap Customer ID</span>
                        <p className="font-mono text-xs">{data.currentSubscription.tap_customer_id}</p>
                      </div>
                    )}
                    {data.currentSubscription.discount_code && (
                      <div className="pt-2 border-t">
                        <span className="text-sm text-muted-foreground">Discount Code</span>
                        <p className="flex items-center gap-2">
                          <Badge variant="outline">{data.currentSubscription.discount_code.code}</Badge>
                          <span className="text-sm">
                            {data.currentSubscription.discount_code.discount_type === "percentage" 
                              ? `${data.currentSubscription.discount_code.discount_value}%`
                              : `${data.currentSubscription.discount_code.discount_value} KWD`}
                          </span>
                        </p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Cycles used: {data.currentSubscription.discount_cycles_used}
                          {data.currentSubscription.discount_code.duration_cycles && 
                            ` / ${data.currentSubscription.discount_code.duration_cycles}`}
                        </p>
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-muted-foreground">No subscription found</p>
                )}
              </CardContent>
            </Card>

            {/* Service Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Service
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {data.service ? (
                  <>
                    <div>
                      <span className="text-sm text-muted-foreground">Name</span>
                      <p className="font-medium">{data.service.name}</p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Type</span>
                      <p>
                        <Badge variant="outline">{data.service.type}</Badge>
                      </p>
                    </div>
                    <div>
                      <span className="text-sm text-muted-foreground">Price</span>
                      <p>{data.service.price_kwd} KWD/month</p>
                    </div>
                  </>
                ) : (
                  <p className="text-muted-foreground">No service found</p>
                )}
              </CardContent>
            </Card>

            {/* Email Notifications Card */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="h-5 w-5" />
                  Recent Email Notifications
                </CardTitle>
              </CardHeader>
              <CardContent>
                {data.emailNotifications.length > 0 ? (
                  <div className="space-y-2">
                    {data.emailNotifications.map((email) => (
                      <div key={email.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-medium text-sm">{email.notification_type.replace(/_/g, " ")}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(email.sent_at)}</p>
                        </div>
                        <Badge variant={email.status === "sent" ? "default" : "destructive"}>
                          {email.status || "unknown"}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-muted-foreground">No email notifications found</p>
                )}
              </CardContent>
            </Card>

            {/* Previous Subscriptions */}
            {data.subscriptions.length > 1 && (
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle>Previous Subscriptions</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.subscriptions.slice(1).map((sub) => (
                      <div key={sub.id} className="flex items-center justify-between py-2 border-b last:border-0">
                        <div>
                          <p className="font-mono text-xs text-muted-foreground">{sub.id}</p>
                          <p className="text-sm">
                            {formatDate(sub.start_date)} — {formatDate(sub.end_date)}
                          </p>
                        </div>
                        {getStatusBadge(sub.status)}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>
    </AdminPageLayout>
  );
}