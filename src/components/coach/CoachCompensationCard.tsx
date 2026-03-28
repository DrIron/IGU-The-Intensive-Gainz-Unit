import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, Award, TrendingUp, Users, ChevronUp } from "lucide-react";
import { COACH_PAYOUT_PER_CLIENT, LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";
import { cn } from "@/lib/utils";
import { LevelUpRequestDialog } from "./LevelUpRequestDialog";

interface ClientPayout {
  clientName: string;
  serviceName: string;
  coachPayout: number;
  blocked: boolean;
}

interface CoachCompensationCardProps {
  coachUserId: string;
}

const TIER_ORDER = [
  { slug: "one_to_one_online", label: "Online" },
  { slug: "one_to_one_complete", label: "Complete" },
  { slug: "hybrid", label: "Hybrid" },
  { slug: "in_person", label: "In-Person" },
] as const;

const LEVELS: ProfessionalLevel[] = ["junior", "senior", "lead"];

const LEVEL_COLORS: Record<ProfessionalLevel, string> = {
  junior: "text-zinc-400",
  senior: "text-blue-400",
  lead: "text-amber-400",
};

export function CoachCompensationCard({ coachUserId }: CoachCompensationCardProps) {
  const hasFetched = useRef(false);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<ProfessionalLevel>("junior");
  const [isHeadCoach, setIsHeadCoach] = useState(false);
  const [clientPayouts, setClientPayouts] = useState<ClientPayout[]>([]);
  const [totalPayout, setTotalPayout] = useState(0);
  const [coachName, setCoachName] = useState("");
  const [coachEmail, setCoachEmail] = useState("");
  const [levelUpOpen, setLevelUpOpen] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: coachProfile } = await supabase
        .from("coaches_public")
        .select("coach_level, is_head_coach")
        .eq("user_id", coachUserId)
        .maybeSingle();

      if (coachProfile) {
        setLevel((coachProfile.coach_level as ProfessionalLevel) || "junior");
        setIsHeadCoach(coachProfile.is_head_coach || false);
      }

      // Get coach name and email for level-up request
      const { data: coachInfo } = await supabase
        .from("coaches")
        .select("first_name, last_name")
        .eq("user_id", coachUserId)
        .maybeSingle();
      if (coachInfo) setCoachName(`${coachInfo.first_name} ${coachInfo.last_name}`.trim());

      const { data: profileInfo } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", coachUserId)
        .maybeSingle();
      if (profileInfo) setCoachEmail(profileInfo.email || "");

      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, user_id, service_id")
        .eq("coach_id", coachUserId)
        .eq("status", "active");

      if (!subs || subs.length === 0) {
        setClientPayouts([]);
        setTotalPayout(0);
        setLoading(false);
        return;
      }

      const clientIds = [...new Set(subs.map(s => s.user_id))];
      const { data: clients } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name")
        .in("id", clientIds);
      const clientNameMap = new Map(
        (clients || []).map(c => [c.id, c.display_name || c.first_name || "Unknown"])
      );

      const serviceIds = [...new Set(subs.map(s => s.service_id))];
      const { data: services } = await supabase
        .from("services")
        .select("id, name")
        .in("id", serviceIds);
      const serviceNameMap = new Map(
        (services || []).map(s => [s.id, s.name])
      );

      const payouts: ClientPayout[] = [];
      let total = 0;

      for (const sub of subs) {
        try {
          const { data } = await supabase.rpc("calculate_subscription_payout", {
            p_subscription_id: sub.id,
            p_discount_percentage: 0,
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

  const currentLevelIndex = LEVELS.indexOf(level);
  const nextLevel = currentLevelIndex < LEVELS.length - 1 ? LEVELS[currentLevelIndex + 1] : null;

  return (
    <div className="space-y-4">
      {/* Main compensation card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Award className="h-5 w-5 text-primary" />
                My Compensation
              </CardTitle>
              <CardDescription className="mt-1">
                {clientPayouts.length} active client{clientPayouts.length !== 1 ? "s" : ""}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Badge className={cn(
                "font-semibold",
                level === "lead" && "bg-amber-500/20 text-amber-400 border-amber-500/30",
                level === "senior" && "bg-blue-500/20 text-blue-400 border-blue-500/30",
                level === "junior" && "bg-zinc-500/20 text-zinc-400 border-zinc-500/30",
              )}>
                {LEVEL_LABELS[level]}
              </Badge>
              {isHeadCoach && (
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20">
                  Head Coach
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Per-client breakdown */}
          {clientPayouts.length > 0 ? (
            <>
              <div className="rounded-lg border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs font-medium">Client</TableHead>
                      <TableHead className="text-xs font-medium">Service</TableHead>
                      <TableHead className="text-xs font-medium text-right">Payout</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clientPayouts.map((cp, i) => (
                      <TableRow key={i} className={cp.blocked ? "opacity-40" : ""}>
                        <TableCell className="font-medium text-sm">{cp.clientName}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{cp.serviceName}</TableCell>
                        <TableCell className="text-right">
                          {cp.blocked ? (
                            <Badge variant="destructive" className="text-xs">Blocked</Badge>
                          ) : (
                            <span className="font-semibold text-sm">{cp.coachPayout} KWD</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Total */}
              <div className="flex items-center justify-between rounded-lg bg-primary/5 border border-primary/10 px-4 py-3">
                <span className="text-sm font-medium text-muted-foreground">Monthly Total</span>
                <span className="text-xl font-bold tracking-tight">{totalPayout} KWD</span>
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No active clients yet</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compensation tiers card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
            Compensation Tiers
          </CardTitle>
          <CardDescription>
            Per client, per month (KWD)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="rounded-lg border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-xs font-medium w-[120px]">Service</TableHead>
                  {LEVELS.map((lvl) => (
                    <TableHead
                      key={lvl}
                      className={cn(
                        "text-xs font-medium text-center",
                        lvl === level && "bg-primary/5"
                      )}
                    >
                      <span className={LEVEL_COLORS[lvl]}>{LEVEL_LABELS[lvl]}</span>
                    </TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {TIER_ORDER.map(({ slug, label }) => {
                  const rates = COACH_PAYOUT_PER_CLIENT[slug];
                  if (!rates) return null;
                  return (
                    <TableRow key={slug}>
                      <TableCell className="text-sm font-medium">{label}</TableCell>
                      {LEVELS.map((lvl) => {
                        const isCurrent = lvl === level;
                        const value = rates[lvl] ?? 0;
                        return (
                          <TableCell
                            key={lvl}
                            className={cn(
                              "text-center tabular-nums",
                              isCurrent && "bg-primary/5 font-bold",
                              !isCurrent && "text-muted-foreground"
                            )}
                          >
                            {value}
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>

          {/* Level up nudge */}
          {nextLevel && (
            <div className="mt-3 rounded-lg bg-muted/50 border border-border/50 px-3 py-2.5 space-y-2">
              <div className="flex items-start gap-2">
                <ChevronUp className={cn("h-4 w-4 mt-0.5 shrink-0", LEVEL_COLORS[nextLevel])} />
                <p className="text-xs text-muted-foreground leading-relaxed">
                  As a <span className={cn("font-semibold", LEVEL_COLORS[nextLevel])}>{LEVEL_LABELS[nextLevel]}</span> coach,
                  you'd earn up to{" "}
                  <span className="font-semibold text-foreground">
                    {COACH_PAYOUT_PER_CLIENT["in_person"]?.[nextLevel] ?? 0} KWD
                  </span>
                  {" "}per In-Person client — that's{" "}
                  <span className="font-semibold text-foreground">
                    +{(COACH_PAYOUT_PER_CLIENT["in_person"]?.[nextLevel] ?? 0) - (COACH_PAYOUT_PER_CLIENT["in_person"]?.[level] ?? 0)} KWD
                  </span>
                  {" "}more per client.
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                className="w-full text-xs"
                onClick={() => setLevelUpOpen(true)}
              >
                <ChevronUp className="h-3 w-3 mr-1" />
                Request Level Up
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <LevelUpRequestDialog
        open={levelUpOpen}
        onOpenChange={setLevelUpOpen}
        currentLevel={level}
        coachName={coachName}
        coachEmail={coachEmail}
      />
    </div>
  );
}
