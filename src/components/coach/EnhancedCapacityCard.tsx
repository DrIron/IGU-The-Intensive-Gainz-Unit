import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Users, AlertTriangle, ArrowRight, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { getLoadColor } from "@/lib/statusUtils";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface ServiceCapacity {
  serviceId: string;
  serviceName: string;
  activeClients: number;
  maxClients: number | null;
  loadPercent: number | null;
}

interface EnhancedCapacityCardProps {
  coachUserId: string;
  onNavigate?: (section: string) => void;
  onMetricsLoaded?: (totalActive: number, totalCapacity: number | null, loadPercent: number | null) => void;
}

const ACTIVE_SUBSCRIPTION_STATUSES = ['pending', 'pending_coach_approval', 'pending_payment', 'active'];

export function EnhancedCapacityCard({ coachUserId, onNavigate, onMetricsLoaded }: EnhancedCapacityCardProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [serviceCapacities, setServiceCapacities] = useState<ServiceCapacity[]>([]);
  const [totalActiveClients, setTotalActiveClients] = useState(0);
  const [totalConfiguredCapacity, setTotalConfiguredCapacity] = useState<number | null>(null);
  const [overallLoadPercent, setOverallLoadPercent] = useState<number | null>(null);
  // Pure specialists (e.g. a dietitian) hold the coach role for route access but have no coaches
  // row, so there's no coach capacity to show. Track that and render nothing -- no fetch error/toast.
  const [noCoachRow, setNoCoachRow] = useState(false);
  const hasFetchedCapacity = useRef(false);

  const fetchCapacityData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', coachUserId)
        .maybeSingle();

      if (coachError) throw coachError;
      if (!coach) {
        // No coaches row = a pure specialist. Report empty metrics and render nothing.
        setNoCoachRow(true);
        onMetricsLoaded?.(0, null, null);
        setLoading(false);
        return;
      }

      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id, name')
        .eq('is_active', true);

      if (servicesError) throw servicesError;

      const { data: limits, error: limitsError } = await supabase
        .from('coach_service_limits')
        .select('service_id, max_clients')
        .eq('coach_id', coach.id);

      if (limitsError) throw limitsError;

      const limitsMap = new Map<string, number>();
      limits?.forEach(l => limitsMap.set(l.service_id, l.max_clients));

      const { data: subscriptions, error: subsError } = await supabase
        .from('subscriptions')
        .select('service_id, status')
        .eq('coach_id', coachUserId)
        .in('status', ACTIVE_SUBSCRIPTION_STATUSES);

      if (subsError) throw subsError;

      const countMap = new Map<string, number>();
      subscriptions?.forEach(sub => {
        if (!sub.service_id) return;
        countMap.set(sub.service_id, (countMap.get(sub.service_id) || 0) + 1);
      });

      const relevantServiceIds = new Set<string>();
      countMap.forEach((_, serviceId) => relevantServiceIds.add(serviceId));
      limitsMap.forEach((_, serviceId) => relevantServiceIds.add(serviceId));

      const capacities: ServiceCapacity[] = [];
      let totalClients = 0;
      let totalCapacity = 0;
      let hasAnyCapacity = false;

      relevantServiceIds.forEach(serviceId => {
        const service = services?.find(s => s.id === serviceId);
        if (!service) return;

        const activeClients = countMap.get(serviceId) || 0;
        const maxClients = limitsMap.get(serviceId) ?? null;
        const loadPercent = maxClients !== null && maxClients > 0
          ? (activeClients / maxClients) * 100
          : null;

        totalClients += activeClients;
        if (maxClients !== null) {
          totalCapacity += maxClients;
          hasAnyCapacity = true;
        }

        capacities.push({
          serviceId,
          serviceName: service.name,
          activeClients,
          maxClients,
          loadPercent,
        });
      });

      capacities.sort((a, b) => {
        if (a.loadPercent !== null && b.loadPercent !== null) {
          return b.loadPercent - a.loadPercent;
        }
        if (a.loadPercent !== null) return -1;
        if (b.loadPercent !== null) return 1;
        return b.activeClients - a.activeClients;
      });

      const finalLoadPercent = hasAnyCapacity && totalCapacity > 0 
        ? (totalClients / totalCapacity) * 100 
        : null;

      setServiceCapacities(capacities);
      setTotalActiveClients(totalClients);
      setTotalConfiguredCapacity(hasAnyCapacity ? totalCapacity : null);
      setOverallLoadPercent(finalLoadPercent);

      // Report metrics to parent
      onMetricsLoaded?.(totalClients, hasAnyCapacity ? totalCapacity : null, finalLoadPercent);

    } catch (error: any) {
      console.error('Error fetching capacity data:', error);
      toast({
        title: "Error loading capacity",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast, onMetricsLoaded]);

  useEffect(() => {
    // Prevent infinite loop - only fetch once
    if (hasFetchedCapacity.current) {
      return;
    }

    if (coachUserId) {
      hasFetchedCapacity.current = true;
      fetchCapacityData();
    }
  }, [coachUserId, fetchCapacityData]);

  const getRemainingBadge = (active: number, max: number | null) => {
    if (max === null) {
      return <Badge variant="outline" className="text-xs">No limit</Badge>;
    }
    const remaining = max - active;
    if (remaining < 0) {
      return <Badge variant="outline" className="text-xs text-status-warning border-status-warning/40">Over by {Math.abs(remaining)}</Badge>;
    }
    if (remaining === 0) {
      return <Badge variant="outline" className="text-xs text-status-warning border-status-warning/40">At capacity</Badge>;
    }
    // Neutral, not green: spare capacity is not a "good" score, it is just a number.
    // (Matches the gauge's colour rule; see CapacityGauge below.)
    return <Badge variant="outline" className="text-xs text-muted-foreground">{remaining} spots left</Badge>;
  };

  const handleViewClients = () => {
    if (onNavigate) {
      onNavigate('clients');
    } else {
      navigate('/coach/clients');
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  // Pure specialist (no coaches row): nothing to show, no error surfaced.
  if (noCoachRow) return null;

  const showCapacityWarning = overallLoadPercent !== null && overallLoadPercent >= 90;

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              My Capacity
            </CardTitle>
            <CardDescription className="text-sm">
              Your current client load across services
            </CardDescription>
          </div>
          {/* TODO: Add edit limits link when coach has permission */}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* CO4: the roster load, as one arc. Reads the SAME capacity numbers as before
            (subscriptions incl. payment-exempt clients — an operational surface, per
            CLAUDE.md; do NOT switch this to paying_subscriptions). Nothing re-derived. */}
        <CapacityGauge current={totalActiveClients} max={totalConfiguredCapacity} className="py-2" />

        {/* Capacity Warning — same >=90% threshold that turns the arc amber. */}
        {showCapacityWarning && (
          <Alert className="border-status-warning/30 bg-status-warning/10 py-2">
            <AlertTriangle className="h-4 w-4 text-status-warning" />
            <AlertDescription className="text-sm">
              You&apos;re close to capacity. Contact admin to adjust limits.
            </AlertDescription>
          </Alert>
        )}

        {/* Per-Service Breakdown */}
        {serviceCapacities.length > 0 ? (
          <div className="space-y-2">
            {serviceCapacities.map(sc => (
              <div 
                key={sc.serviceId} 
                className="flex items-center justify-between p-2.5 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{sc.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {sc.activeClients} / {sc.maxClients !== null ? sc.maxClients : '∞'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {sc.loadPercent !== null && (
                    <Progress 
                      value={Math.min(sc.loadPercent, 100)} 
                      className={cn("h-1.5 w-12", getLoadColor(sc.loadPercent))}
                    />
                  )}
                  {getRemainingBadge(sc.activeClients, sc.maxClients)}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-center py-4 text-muted-foreground text-sm">
            No services configured or no active clients
          </p>
        )}

        {/* View All Clients Button */}
        <Button 
          variant="outline" 
          className="w-full"
          onClick={handleViewClients}
        >
          View all my clients
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardContent>
    </Card>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
 * CO4 — capacity as a filled arc gauge.
 *
 * Grounded in Oura's Activity Goal arc: a partial semicircle, the value as a large
 * display number in the middle, the cap as the arc's full extent, and a
 * plain-language read underneath.
 *
 * COLOUR RULE (deliberate, and NOT the getLoadColor vocabulary):
 *   crimson (--primary) normally -> amber (--status-warning) at >= 90%.
 *
 * This is a NEUTRAL LOAD indicator, not a scorecard. A full roster is not "bad"
 * and an empty one is not "good" — so there is no green-as-good / red-as-bad here.
 * Amber at >=90% means "near full, act soon", nothing more.
 *
 * (Note: the per-service rows below still use `getLoadColor`, which IS green/amber/
 * red. Retokenising that is FU1's job — flagged, not silently changed here.)
 * ──────────────────────────────────────────────────────────────────────────── */

/** Near-capacity threshold: the arc turns amber at or above this. */
export const CAPACITY_WARNING_THRESHOLD = 90;

const GAUGE_RADIUS = 50;
/** Length of a semicircular arc of radius r = pi * r. */
const ARC_LENGTH = Math.PI * GAUGE_RADIUS;

export function CapacityGauge({
  current,
  max,
  className,
}: {
  current: number;
  /** null = no configured limit; the arc is omitted rather than faked. */
  max: number | null;
  className?: string;
}) {
  const hasCap = max !== null && max > 0;
  const loadPercent = hasCap ? (current / max) * 100 : null;
  // Fill is clamped to the arc: an over-capacity coach fills it, never overflows it.
  const fillFraction = hasCap ? Math.min(current / max, 1) : 0;
  const nearCapacity = loadPercent !== null && loadPercent >= CAPACITY_WARNING_THRESHOLD;
  const remaining = hasCap ? max - current : null;

  // Literal class strings (not interpolated) so Tailwind's JIT scanner sees both.
  const arcStroke = nearCapacity ? "stroke-status-warning" : "stroke-primary";

  return (
    <div className={cn("flex flex-col items-center", className)}>
      <div className="relative w-[160px]">
        <svg viewBox="0 0 120 68" className="w-full" role="img" aria-label={`${current} of ${hasCap ? max : "unlimited"} clients`}>
          {/* Flat track */}
          <path
            d="M 10 60 A 50 50 0 0 1 110 60"
            fill="none"
            strokeWidth={9}
            strokeLinecap="round"
            className="stroke-muted"
          />
          {/* Filled arc — omitted entirely when there is no cap to fill against. */}
          {hasCap && (
            <path
              d="M 10 60 A 50 50 0 0 1 110 60"
              fill="none"
              strokeWidth={9}
              strokeLinecap="round"
              className={cn(arcStroke, "transition-[stroke-dashoffset] duration-500")}
              strokeDasharray={ARC_LENGTH}
              strokeDashoffset={ARC_LENGTH * (1 - fillFraction)}
              data-testid="capacity-arc"
              data-fill={fillFraction.toFixed(4)}
            />
          )}
        </svg>

        {/* Hero number, centred in the arc. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col items-center">
          <span className="font-display text-4xl leading-none tracking-wide text-foreground">
            {Math.round(current)}
          </span>
        </div>
      </div>

      {/* Mono readout — every number rounded. */}
      <p className="mt-2 font-mono text-xs uppercase tracking-wider text-muted-foreground">
        {hasCap ? (
          <>
            {Math.round(current)} / {Math.round(max)} · {Math.round(loadPercent!)}% capacity
          </>
        ) : (
          <>{Math.round(current)} clients · no limit set</>
        )}
      </p>

      {/* CC2 plain-language read — one sentence that says what the number means. */}
      <p className="mt-1 text-sm text-muted-foreground">
        {!hasCap
          ? "No capacity limit configured."
          : remaining! > 0
            ? `${Math.round(remaining!)} ${remaining === 1 ? "spot" : "spots"} open`
            : "At capacity — new clients will waitlist"}
      </p>
    </div>
  );
}
