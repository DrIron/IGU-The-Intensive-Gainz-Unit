import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Users, AlertTriangle, ArrowRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";

interface ServiceCapacity {
  serviceId: string;
  serviceName: string;
  activeClients: number;
  maxClients: number | null;
  loadPercent: number | null;
}

interface MyCapacityCardProps {
  coachUserId: string;
  onNavigate?: (section: string) => void;
}

/**
 * ACTIVE CLIENT COUNT DEFINITION (consistent with onboarding):
 * Count only subscriptions with status IN ('pending', 'pending_coach_approval', 'pending_payment', 'active')
 * Exclude: 'inactive', 'cancelled', 'expired'
 */
const ACTIVE_SUBSCRIPTION_STATUSES = ['pending', 'pending_coach_approval', 'pending_payment', 'active'];

export function MyCapacityCard({ coachUserId, onNavigate }: MyCapacityCardProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [serviceCapacities, setServiceCapacities] = useState<ServiceCapacity[]>([]);
  const [totalActiveClients, setTotalActiveClients] = useState(0);
  const [totalConfiguredCapacity, setTotalConfiguredCapacity] = useState<number | null>(null);
  const [overallLoadPercent, setOverallLoadPercent] = useState<number | null>(null);

  useEffect(() => {
    if (coachUserId) {
      fetchCapacityData();
    }
  }, [coachUserId]);

  const fetchCapacityData = async () => {
    try {
      setLoading(true);

      // 1. Get coach ID from user ID
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

      // 2. Fetch all active services
      const { data: services, error: servicesError } = await supabase
        .from('services')
        .select('id, name')
        .eq('is_active', true);

      if (servicesError) throw servicesError;

      // 3. Fetch coach_service_limits for this coach
      const { data: limits, error: limitsError } = await supabase
        .from('coach_service_limits')
        .select('service_id, max_clients')
        .eq('coach_id', coach.id);

      if (limitsError) throw limitsError;

      // Build limits map
      const limitsMap = new Map<string, number>();
      limits?.forEach(l => limitsMap.set(l.service_id, l.max_clients));

      // 4. Fetch subscription counts per service for this coach
      const { data: subscriptions, error: subsError } = await supabase
        .from('subscriptions')
        .select('service_id, status')
        .eq('coach_id', coachUserId)
        .in('status', ACTIVE_SUBSCRIPTION_STATUSES);

      if (subsError) throw subsError;

      // Build count map
      const countMap = new Map<string, number>();
      subscriptions?.forEach(sub => {
        if (!sub.service_id) return;
        countMap.set(sub.service_id, (countMap.get(sub.service_id) || 0) + 1);
      });

      // 5. Build service capacities
      // Include services where coach has clients OR has limits configured
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

      // Sort by load percent (highest first)
      capacities.sort((a, b) => {
        if (a.loadPercent !== null && b.loadPercent !== null) {
          return b.loadPercent - a.loadPercent;
        }
        if (a.loadPercent !== null) return -1;
        if (b.loadPercent !== null) return 1;
        return b.activeClients - a.activeClients;
      });

      setServiceCapacities(capacities);
      setTotalActiveClients(totalClients);
      setTotalConfiguredCapacity(hasAnyCapacity ? totalCapacity : null);
      setOverallLoadPercent(
        hasAnyCapacity && totalCapacity > 0 
          ? (totalClients / totalCapacity) * 100 
          : null
      );

    } catch (error: any) {
      console.error('Error fetching capacity data:', error);
      toast({
        title: "Error loading capacity",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getLoadColor = (loadPercent: number | null): string => {
    if (loadPercent === null) return 'bg-muted';
    if (loadPercent > 100) return 'bg-destructive';
    if (loadPercent >= 70) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const getLoadTextColor = (loadPercent: number | null): string => {
    if (loadPercent === null) return 'text-muted-foreground';
    if (loadPercent > 100) return 'text-destructive';
    if (loadPercent >= 70) return 'text-amber-600';
    return 'text-green-600';
  };

  const handleViewClients = () => {
    if (onNavigate) {
      onNavigate('my-clients');
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
      <CardHeader className="pb-4">
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          My Capacity
        </CardTitle>
        <CardDescription>
          Your current client load across services
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Stats */}
        <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
          <div>
            <p className="text-2xl font-bold">{totalActiveClients}</p>
            <p className="text-sm text-muted-foreground">Total Active Clients</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold">
              {totalConfiguredCapacity !== null ? totalConfiguredCapacity : '∞'}
            </p>
            <p className="text-sm text-muted-foreground">Configured Capacity</p>
          </div>
          {overallLoadPercent !== null && (
            <div className="text-center">
              <div className="w-16">
                <Progress 
                  value={Math.min(overallLoadPercent, 100)} 
                  className={cn("h-3", getLoadColor(overallLoadPercent))}
                />
              </div>
              <p className={cn("text-sm font-medium mt-1", getLoadTextColor(overallLoadPercent))}>
                {Math.round(overallLoadPercent)}% load
              </p>
            </div>
          )}
        </div>

        {/* Capacity Warning */}
        {showCapacityWarning && (
          <Alert className="border-amber-200 bg-amber-50">
            <AlertTriangle className="h-4 w-4 text-amber-600" />
            <AlertDescription className="text-amber-800">
              You are close to your configured capacity. Consider updating your limits with the admin if this is intentional.
            </AlertDescription>
          </Alert>
        )}

        {/* Per-Service Breakdown */}
        {serviceCapacities.length > 0 ? (
          <div className="space-y-3">
            {serviceCapacities.map(sc => (
              <div 
                key={sc.serviceId} 
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{sc.serviceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {sc.activeClients} / {sc.maxClients !== null ? sc.maxClients : '∞'} clients
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  {sc.loadPercent !== null ? (
                    <>
                      <Progress 
                        value={Math.min(sc.loadPercent, 100)} 
                        className={cn("h-2 w-20", getLoadColor(sc.loadPercent))}
                      />
                      <Badge 
                        variant={
                          sc.loadPercent > 100 ? "destructive" :
                          sc.loadPercent >= 70 ? "secondary" :
                          "default"
                        }
                        className="min-w-[3rem] justify-center"
                      >
                        {Math.round(sc.loadPercent)}%
                      </Badge>
                    </>
                  ) : (
                    <Badge variant="outline" className="text-xs">No limit</Badge>
                  )}
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
