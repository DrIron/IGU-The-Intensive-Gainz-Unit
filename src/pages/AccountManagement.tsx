import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { Mail, Phone, Calendar, LogOut, Shield, CreditCard } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";

interface ProfileData {
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone: string | null;
  status: string | null;
  avatar_url: string | null;
  created_at: string | null;
}

interface SubscriptionData {
  id: string;
  status: string;
  start_date: string | null;
  end_date: string | null;
  next_billing_date: string | null;
  cancel_at_period_end: boolean;
  services: { name: string; type: string } | null;
}

export default function AccountManagement() {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);
  const hasFetched = useRef(false);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const fetchData = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const [profileRes, subRes] = await Promise.all([
          supabase
            .from("profiles")
            .select("first_name, last_name, email, phone, status, avatar_url, created_at")
            .eq("id", user.id)
            .maybeSingle(),
          supabase
            .from("subscriptions")
            .select("id, status, start_date, end_date, next_billing_date, cancel_at_period_end, services(name, type)")
            .eq("user_id", user.id)
            .in("status", ["active", "pending", "failed"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        if (profileRes.data) setProfile(profileRes.data);
        if (subRes.data) setSubscription(subRes.data as any);
      } catch (error) {
        if (import.meta.env.DEV) console.error("Error loading account data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      Object.keys(localStorage).forEach((key) => {
        if (key.startsWith("igu_") || key.startsWith("sb-")) {
          localStorage.removeItem(key);
        }
      });
      await supabase.auth.signOut();
      window.location.replace("/");
    } catch {
      setSigningOut(false);
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case "pending":
      case "pending_payment":
        return <Badge variant="secondary">Pending</Badge>;
      case "suspended":
        return <Badge variant="destructive">Suspended</Badge>;
      case "cancelled":
        return <Badge variant="outline">Cancelled</Badge>;
      default:
        return <Badge variant="secondary">{status || "Unknown"}</Badge>;
    }
  };

  const getSubStatusBadge = (status: string) => {
    switch (status) {
      case "active":
        return <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Active</Badge>;
      case "failed":
        return <Badge variant="destructive">Payment Failed</Badge>;
      case "pending":
        return <Badge variant="secondary">Pending</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6 max-w-2xl mx-auto p-4 sm:p-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  const initials = `${profile?.first_name?.charAt(0) || ""}${profile?.last_name?.charAt(0) || ""}`;
  const fullName = `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

  return (
    <div className="space-y-6 max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Account</h1>

      {/* Profile Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="bg-primary/10 text-primary text-xl font-semibold">
                {initials || "?"}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <CardTitle className="text-xl">{fullName || "Your Profile"}</CardTitle>
              <CardDescription className="flex items-center gap-2 mt-1">
                <Shield className="h-3.5 w-3.5" />
                <span>Account Status:</span> {getStatusBadge(profile?.status)}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4">
            {profile?.email && (
              <div className="flex items-center gap-3">
                <Mail className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Email</p>
                  <p className="text-sm">{profile.email}</p>
                </div>
              </div>
            )}
            {profile?.phone && (
              <div className="flex items-center gap-3">
                <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Phone</p>
                  <p className="text-sm">{profile.phone}</p>
                </div>
              </div>
            )}
            {profile?.created_at && (
              <div className="flex items-center gap-3">
                <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                <div>
                  <p className="text-xs text-muted-foreground">Member Since</p>
                  <p className="text-sm">{format(new Date(profile.created_at), "MMMM d, yyyy")}</p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Subscription Card */}
      {subscription && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5" />
              Subscription
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{subscription.services?.name || "Your Plan"}</p>
                <p className="text-sm text-muted-foreground capitalize">{subscription.services?.type || ""} plan</p>
              </div>
              {getSubStatusBadge(subscription.status)}
            </div>

            <Separator />

            <div className="grid gap-3 text-sm">
              {subscription.start_date && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Started</span>
                  <span>{format(new Date(subscription.start_date), "MMM d, yyyy")}</span>
                </div>
              )}
              {subscription.next_billing_date && !subscription.cancel_at_period_end && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Next Billing</span>
                  <span>{format(new Date(subscription.next_billing_date), "MMM d, yyyy")}</span>
                </div>
              )}
              {subscription.cancel_at_period_end && subscription.end_date && (
                <div className="flex justify-between text-destructive">
                  <span>Cancels On</span>
                  <span>{format(new Date(subscription.end_date), "MMM d, yyyy")}</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Sign Out */}
      <Card>
        <CardContent className="pt-6">
          <Button
            variant="outline"
            className="w-full"
            onClick={handleSignOut}
            disabled={signingOut}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {signingOut ? "Signing Out..." : "Sign Out"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
