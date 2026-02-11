import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Award, DollarSign } from "lucide-react";
import { COACH_RATES, LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";

interface ClientPayout {
  clientName: string;
  serviceName: string;
  coachPayout: number;
  blocked: boolean;
}

interface CoachCompensationCardProps {
  coachUserId: string;
}

export function CoachCompensationCard({ coachUserId }: CoachCompensationCardProps) {
  const hasFetched = useRef(false);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<ProfessionalLevel>("junior");
  const [isHeadCoach, setIsHeadCoach] = useState(false);
  const [clientPayouts, setClientPayouts] = useState<ClientPayout[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Get coach profile from coaches_public
      const { data: coachProfile } = await supabase
        .from("coaches_public")
        .select("coach_level, is_head_coach")
        .eq("user_id", coachUserId)
        .maybeSingle();

      if (coachProfile) {
        setLevel((coachProfile.coach_level as ProfessionalLevel) || "junior");
        setIsHeadCoach(coachProfile.is_head_coach || false);
      }

      // Get active subscriptions for this coach
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, user_id, service_id, discount_percentage")
        .eq("coach_id", coachUserId)
        .eq("status", "active");

      if (!subs || subs.length === 0) {
        setClientPayouts([]);
        setTotalPayout(0);
        setLoading(false);
        return;
      }

      // Get client names
      const clientIds = [...new Set(subs.map(s => s.user_id))];
      const { data: clients } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name")
        .in("id", clientIds);
      const clientNameMap = new Map(
        (clients || []).map(c => [c.id, c.display_name || c.first_name || "Unknown"])
      );

      // Get service names
      const serviceIds = [...new Set(subs.map(s => s.service_id))];
      const { data: services } = await supabase
        .from("services")
        .select("id, name")
        .in("id", serviceIds);
      const serviceNameMap = new Map(
        (services || []).map(s => [s.id, s.name])
      );

      // Calculate payout for each subscription
      const payouts: ClientPayout[] = [];
      let total = 0;

      for (const sub of subs) {
        try {
          const { data } = await supabase.rpc("calculate_subscription_payout", {
            p_subscription_id: sub.id,
            p_discount_percentage: sub.discount_percentage || 0,
          });

          const result = data as any;
          const coachPayout = result?.coach_payout || 0;
          payouts.push({
            clientName: clientNameMap.get(sub.user_id) || "Unknown",
            serviceName: serviceNameMap.get(sub.service_id) || "Unknown",
            coachPayout,
            blocked: result?.blocked || false,
          });
          if (!result?.blocked) {
            total += coachPayout;
          }
        } catch {
          payouts.push({
            clientName: clientNameMap.get(sub.user_id) || "Unknown",
            serviceName: serviceNameMap.get(sub.service_id) || "Unknown",
            coachPayout: 0,
            blocked: false,
          });
        }
      }

      setClientPayouts(payouts);
      setTotalPayout(total);
    } catch (error) {
      console.error("Error loading compensation data:", error);
    } finally {
      setLoading(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const rateInfo = COACH_RATES[level];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Award className="h-5 w-5 text-primary" />
            My Compensation
          </CardTitle>
          <div className="flex items-center gap-2">
            <Badge variant="default">{LEVEL_LABELS[level]}</Badge>
            {isHeadCoach && (
              <Badge variant="secondary">Head Coach</Badge>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Hourly Rates */}
        <div className="flex gap-6">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-primary/10 rounded-lg">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Online</p>
              <p className="font-semibold">{rateInfo.online} KWD/hr</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-green-500/10 rounded-lg">
              <DollarSign className="h-4 w-4 text-green-600" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">In-Person</p>
              <p className="font-semibold">{rateInfo.in_person} KWD/hr</p>
            </div>
          </div>
        </div>

        {/* Per-client breakdown */}
        {clientPayouts.length > 0 && (
          <>
            <div className="border-t pt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Service</TableHead>
                    <TableHead className="text-right">My Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientPayouts.map((cp, i) => (
                    <TableRow key={i} className={cp.blocked ? "opacity-50" : ""}>
                      <TableCell className="font-medium">{cp.clientName}</TableCell>
                      <TableCell className="text-sm">{cp.serviceName}</TableCell>
                      <TableCell className="text-right">
                        {cp.blocked ? (
                          <Badge variant="destructive" className="text-xs">Blocked</Badge>
                        ) : (
                          `${cp.coachPayout.toFixed(2)} KWD`
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Total */}
            <div className="flex items-center justify-between border-t pt-3">
              <span className="text-sm font-medium text-muted-foreground">Estimated Monthly Total</span>
              <span className="text-lg font-bold">{totalPayout.toFixed(2)} KWD</span>
            </div>
          </>
        )}

        {clientPayouts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-4">
            No active clients yet
          </p>
        )}
      </CardContent>
    </Card>
  );
}
