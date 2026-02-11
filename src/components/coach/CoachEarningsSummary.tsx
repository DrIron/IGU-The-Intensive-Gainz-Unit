import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2, DollarSign, Clock, TrendingUp, Users } from "lucide-react";
import { COACH_RATES, LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";

interface EarningsSummary {
  currentMonthEstimate: number;
  totalEarned: number;
  pendingAmount: number;
  totalClients: number;
  addonEarnings: number;
  coachLevel: ProfessionalLevel;
  isHeadCoach: boolean;
}

export function CoachEarningsSummary() {
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<EarningsSummary>({
    currentMonthEstimate: 0,
    totalEarned: 0,
    pendingAmount: 0,
    totalClients: 0,
    addonEarnings: 0,
    coachLevel: "junior",
    isHeadCoach: false,
  });

  useEffect(() => {
    loadEarnings();
  }, []);

  const loadEarnings = async () => {
    try {
      setLoading(true);

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get coach record
      const { data: coach } = await supabase
        .from("coaches")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!coach) return;

      // Get coach level and head coach flag
      const { data: coachPublic } = await supabase
        .from("coaches_public")
        .select("coach_level, is_head_coach")
        .eq("user_id", user.id)
        .maybeSingle();

      const coachLevel = (coachPublic?.coach_level as ProfessionalLevel) || "junior";
      const isHeadCoach = coachPublic?.is_head_coach || false;

      // Get payment history
      const { data: payments } = await supabase
        .from("monthly_coach_payments")
        .select("total_payment, is_paid")
        .eq("coach_id", coach.id);

      // Get addon earnings (where this coach is the staff member)
      const { data: addons } = await supabase
        .from("subscription_addons")
        .select("payout_kwd")
        .eq("staff_user_id", user.id)
        .eq("status", "active");

      // Get current client count
      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select("id, user_id")
        .eq("coach_id", user.id)
        .eq("status", "active");

      // Fetch payment_exempt separately (profiles is a VIEW, FK joins fail)
      const earningsUserIds = [...new Set((subscriptions || []).map(s => s.user_id))];
      const { data: earningsProfiles } = await supabase
        .from("profiles")
        .select("id, payment_exempt")
        .in("id", earningsUserIds);
      const earningsExemptMap = new Map((earningsProfiles || []).map(p => [p.id, p.payment_exempt]));

      const paidTotal = payments?.filter(p => p.is_paid).reduce((sum, p) => sum + p.total_payment, 0) || 0;
      const pendingTotal = payments?.filter(p => !p.is_paid).reduce((sum, p) => sum + p.total_payment, 0) || 0;
      const addonEarnings = addons?.reduce((sum, a) => sum + (a.payout_kwd || 0), 0) || 0;
      const clientCount = subscriptions?.filter(s => !earningsExemptMap.get(s.user_id)).length || 0;

      // Current month estimate is the most recent payment record (pending)
      const currentEstimate = payments?.length ? payments[0]?.total_payment || 0 : 0;

      setSummary({
        currentMonthEstimate: currentEstimate + addonEarnings,
        totalEarned: paidTotal,
        pendingAmount: pendingTotal,
        totalClients: clientCount,
        addonEarnings,
        coachLevel,
        isHeadCoach,
      });
    } catch (error) {
      console.error("Error loading earnings:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-6">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-lg">Earnings Summary</CardTitle>
              <Badge variant="default">{LEVEL_LABELS[summary.coachLevel]}</Badge>
              {summary.isHeadCoach && <Badge variant="secondary">Head Coach</Badge>}
            </div>
            <CardDescription className="mt-1">
              Your monthly payout overview &middot; {COACH_RATES[summary.coachLevel].online} KWD/hr online &middot; {COACH_RATES[summary.coachLevel].in_person} KWD/hr in-person
            </CardDescription>
          </div>
          <Badge variant="secondary" className="gap-1">
            <Users className="h-3 w-3" />
            {summary.totalClients} clients
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <TrendingUp className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">This Month</p>
              <p className="text-xl font-semibold">{summary.currentMonthEstimate.toFixed(2)} KWD</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Total Earned</p>
              <p className="text-xl font-semibold text-green-600">{summary.totalEarned.toFixed(2)} KWD</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="p-2 bg-orange-500/10 rounded-lg">
              <Clock className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-xl font-semibold text-orange-600">{summary.pendingAmount.toFixed(2)} KWD</p>
            </div>
          </div>

          {summary.addonEarnings > 0 && (
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/10 rounded-lg">
                <DollarSign className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Add-on Earnings</p>
                <p className="text-xl font-semibold text-blue-600">{summary.addonEarnings.toFixed(2)} KWD</p>
              </div>
            </div>
          )}
        </div>

        <p className="text-xs text-muted-foreground mt-4">
          Payouts are processed monthly. Contact admin for payment history details.
        </p>
      </CardContent>
    </Card>
  );
}
