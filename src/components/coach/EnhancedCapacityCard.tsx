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
  const hasFetchedCapacity = useRef(false);

  const fetchCapacityData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', coachUserId)
        .single();

      if (coachError) throw coachError;
      if (!coach) {
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
      return <Badge variant="destructive" className="text-xs">Over by {Math.abs(remaining)}</Badge>;
    }
    if (remaining === 0) {
      return <Badge variant="secondary" className="text-xs bg-amber-100 text-amber-800">At capacity</Badge>;
    }
    return <Badge variant="outline" className="text-xs text-green-700 border-green-300">{remaining} spots left</Badge>;
  };

  const handleViewClients = () => {
    if (onNavigate) {
      onNavigate('clients');
    } else {
      navigate('/dashboard?section=my-clients');
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
        {/* Summary Stats */}
        <div className="flex items-center justify-between p-3 bg-muted/30 rounded-lg">
          <div>
            <p className="text-xl font-bold">{totalActiveClients}</p>
            <p className="text-xs text-muted-foreground">Active Clients</p>
          </div>
          <div className="text-right">
            <p className="text-xl font-bold">
              {totalConfiguredCapacity !== null ? totalConfiguredCapacity : '∞'}
            </p>
            <p className="text-xs text-muted-foreground">Total Capacity</p>
          </div>
          {overallLoadPercent !== null && (
            <div className="text-center">
              <Progress 
                value={Math.min(overallLoadPercent, 100)} 
                className={cn("h-2 w-16", getLoadColor(overallLoadPercent))}
              />
              <p className={cn(
                "text-xs font-medium mt-1",
                overallLoadPercent > 100 ? "text-destructive" :
                overallLoadPercent >= 70 ? "text-amber-600" : "text-green-600"
              )}>
                {Math.round(overallLoadPercent)}% used
              </p>
            </div>
          )}
        </div>

        {/* Capacity Warning */}
        {showCapacityWarning && (
          <Alert className="border-amber-200 bg-amber-50 py-2">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800 text-sm">
              You're close to capacity. Contact admin to adjust limits.
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
