import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, AlertTriangle, Settings, Users, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { CoachServiceLimits } from "@/components/CoachServiceLimits";

interface ServiceLoad {
  serviceId: string;
  serviceName: string;
  activeClients: number;
  maxClients: number | null;
  loadPercent: number | null;
}

interface CoachLoad {
  coachId: string;
  coachUserId: string;
  coachName: string;
  status: string;
  serviceLoads: ServiceLoad[];
  totalActiveClients: number;
  totalCapacity: number | null;
  overallLoadPercent: number | null;
}

interface CapacityAlert {
  coachId: string;
  coachName: string;
  serviceId: string;
  serviceName: string;
  activeClients: number;
  maxClients: number | null;
  type: 'over_capacity' | 'no_capacity_set';
}

/**
 * ACTIVE CLIENT COUNT DEFINITION (consistent with onboarding):
 * Count only subscriptions with status IN ('pending', 'pending_coach_approval', 'pending_payment', 'active')
 * Exclude: 'inactive', 'cancelled', 'expired'
 */
const ACTIVE_SUBSCRIPTION_STATUSES = ['pending', 'pending_coach_approval', 'pending_payment', 'active'];

export function CoachLoadOverview() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [coachLoads, setCoachLoads] = useState<CoachLoad[]>([]);
  const [alerts, setAlerts] = useState<CapacityAlert[]>([]);
  const [serviceFilter, setServiceFilter] = useState<string>("all");
  const [services, setServices] = useState<{ id: string; name: string }[]>([]);
  const [expandedCoaches, setExpandedCoaches] = useState<Set<string>>(new Set());
  
  // Limits dialog
  const [limitsDialogOpen, setLimitsDialogOpen] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<{ id: string; name: string } | null>(null);

  const fetchCoachLoadData = useCallback(async () => {
    try {
      setLoading(true);

      // 1. Fetch all active/approved coaches
      const { data: coaches, error: coachError } = await supabase
        .from('coaches')
        .select('id, user_id, first_name, last_name, status')
        .in('status', ['active', 'approved']);

      if (coachError) throw coachError;

      // 2. Fetch all active services
      const { data: servicesData, error: servicesError } = await supabase
        .from('services')
        .select('id, name')
        .eq('is_active', true);

      if (servicesError) throw servicesError;
      setServices(servicesData || []);

      // 3. Fetch all coach_service_limits
      const { data: limits, error: limitsError } = await supabase
        .from('coach_service_limits')
        .select('coach_id, service_id, max_clients');

      if (limitsError) throw limitsError;

      // 4. Fetch subscription counts per coach per service (using correct status filter)
      const { data: subscriptions, error: subsError } = await supabase
        .from('subscriptions')
        .select('coach_id, service_id, status')
        .in('status', ACTIVE_SUBSCRIPTION_STATUSES);

      if (subsError) throw subsError;

      // Build counts: Map<coachUserId, Map<serviceId, count>>
      const countMap = new Map<string, Map<string, number>>();
      subscriptions?.forEach(sub => {
        if (!sub.coach_id || !sub.service_id) return;
        if (!countMap.has(sub.coach_id)) {
          countMap.set(sub.coach_id, new Map());
        }
        const serviceCounts = countMap.get(sub.coach_id)!;
        serviceCounts.set(sub.service_id, (serviceCounts.get(sub.service_id) || 0) + 1);
      });

      // Build limits map: Map<coachId, Map<serviceId, maxClients>>
      const limitsMap = new Map<string, Map<string, number>>();
      limits?.forEach(limit => {
        if (!limitsMap.has(limit.coach_id)) {
          limitsMap.set(limit.coach_id, new Map());
        }
        limitsMap.get(limit.coach_id)!.set(limit.service_id, limit.max_clients);
      });

      // Build coach load data
      const coachLoadData: CoachLoad[] = [];
      const alertsList: CapacityAlert[] = [];

      coaches?.forEach(coach => {
        const coachName = `${coach.first_name} ${coach.last_name}`.trim();
        const coachCounts = countMap.get(coach.user_id) || new Map();
        const coachLimits = limitsMap.get(coach.id) || new Map();

        // Get all services this coach has clients for OR has limits for
        const relevantServiceIds = new Set<string>();
        coachCounts.forEach((_, serviceId) => relevantServiceIds.add(serviceId));
        coachLimits.forEach((_, serviceId) => relevantServiceIds.add(serviceId));

        const serviceLoads: ServiceLoad[] = [];
        let totalActiveClients = 0;
        let totalCapacity = 0;
        let hasAnyCapacity = false;

        relevantServiceIds.forEach(serviceId => {
          const service = servicesData?.find(s => s.id === serviceId);
          if (!service) return;

          const activeClients = coachCounts.get(serviceId) || 0;
          const maxClients = coachLimits.get(serviceId) ?? null;
          const loadPercent = maxClients !== null && maxClients > 0 
            ? (activeClients / maxClients) * 100 
            : null;

          totalActiveClients += activeClients;
          if (maxClients !== null) {
            totalCapacity += maxClients;
            hasAnyCapacity = true;
          }

          serviceLoads.push({
            serviceId,
            serviceName: service.name,
            activeClients,
            maxClients,
            loadPercent,
          });

          // Check for alerts
          if (maxClients !== null && activeClients > maxClients) {
            alertsList.push({
              coachId: coach.id,
              coachName,
              serviceId,
              serviceName: service.name,
              activeClients,
              maxClients,
              type: 'over_capacity',
            });
          } else if (maxClients === null && activeClients > 0) {
            alertsList.push({
              coachId: coach.id,
              coachName,
              serviceId,
              serviceName: service.name,
              activeClients,
              maxClients: null,
              type: 'no_capacity_set',
            });
          }
        });

        const overallLoadPercent = hasAnyCapacity && totalCapacity > 0
          ? (totalActiveClients / totalCapacity) * 100
          : null;

        coachLoadData.push({
          coachId: coach.id,
          coachUserId: coach.user_id,
          coachName,
          status: coach.status,
          serviceLoads,
          totalActiveClients,
          totalCapacity: hasAnyCapacity ? totalCapacity : null,
          overallLoadPercent,
        });
      });

      // Sort by load percentage (highest first), then by total clients
      coachLoadData.sort((a, b) => {
        if (a.overallLoadPercent !== null && b.overallLoadPercent !== null) {
          return b.overallLoadPercent - a.overallLoadPercent;
        }
        if (a.overallLoadPercent !== null) return -1;
        if (b.overallLoadPercent !== null) return 1;
        return b.totalActiveClients - a.totalActiveClients;
      });

      setCoachLoads(coachLoadData);
      setAlerts(alertsList);
    } catch (error: any) {
      console.error('Error fetching coach load data:', error);
      toast({
        title: "Error loading coach data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchCoachLoadData();
  }, [fetchCoachLoadData]);

  const toggleCoachExpanded = (coachId: string) => {
    setExpandedCoaches(prev => {
      const next = new Set(prev);
      if (next.has(coachId)) {
        next.delete(coachId);
      } else {
        next.add(coachId);
      }
      return next;
    });
  };

  const getLoadColor = (loadPercent: number | null): string => {
    if (loadPercent === null) return 'bg-muted';
    if (loadPercent > 100) return 'bg-destructive';
    if (loadPercent >= 70) return 'bg-amber-500';
    return 'bg-green-500';
  };

  const getLoadBadgeVariant = (loadPercent: number | null): "default" | "secondary" | "destructive" | "outline" => {
    if (loadPercent === null) return 'outline';
    if (loadPercent > 100) return 'destructive';
    if (loadPercent >= 70) return 'secondary';
    return 'default';
  };

  const openLimitsDialog = (coachId: string, coachName: string) => {
    setSelectedCoach({ id: coachId, name: coachName });
    setLimitsDialogOpen(true);
  };

  const handleLimitsDialogClose = (open: boolean) => {
    setLimitsDialogOpen(open);
    if (!open) {
      setSelectedCoach(null);
      // Refresh data after closing
      fetchCoachLoadData();
    }
  };

  // Filter coach loads by service
  const filteredCoachLoads = serviceFilter === "all" 
    ? coachLoads 
    : coachLoads.map(coach => ({
        ...coach,
        serviceLoads: coach.serviceLoads.filter(sl => sl.serviceId === serviceFilter),
      })).filter(coach => coach.serviceLoads.length > 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const overCapacityAlerts = alerts.filter(a => a.type === 'over_capacity');
  const noCapacityAlerts = alerts.filter(a => a.type === 'no_capacity_set');

  return (
    <div className="space-y-6">
      {/* Coach Load & Capacity Card */}
      <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Coach Load & Capacity
              </CardTitle>
              <CardDescription>
                Current client load vs configured capacity per service
              </CardDescription>
            </div>
            <Select value={serviceFilter} onValueChange={setServiceFilter}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="Filter by service" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Services</SelectItem>
                {services.map(service => (
                  <SelectItem key={service.id} value={service.id}>
                    {service.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredCoachLoads.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">No coaches found</p>
          ) : (
            <div className="space-y-3">
              {filteredCoachLoads.map(coach => {
                const isExpanded = expandedCoaches.has(coach.coachId);
                return (
                  <div key={coach.coachId} className="border rounded-lg overflow-hidden">
                    {/* Coach Header Row */}
                    <div 
                      className="flex items-center gap-4 p-4 bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => toggleCoachExpanded(coach.coachId)}
                    >
                      <button className="p-1">
                        {isExpanded ? (
                          <ChevronDown className="h-4 w-4 text-muted-foreground" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-muted-foreground" />
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{coach.coachName}</span>
                          <Badge variant="outline" className="text-xs">
                            {coach.status}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium">
                            {coach.totalActiveClients} / {coach.totalCapacity ?? '∞'}
                          </p>
                          <p className="text-xs text-muted-foreground">Total clients</p>
                        </div>
                        <div className="w-24">
                          {coach.overallLoadPercent !== null ? (
                            <div className="space-y-1">
                              <Progress 
                                value={Math.min(coach.overallLoadPercent, 100)} 
                                className={cn("h-2", getLoadColor(coach.overallLoadPercent))}
                              />
                              <p className={cn(
                                "text-xs text-center font-medium",
                                coach.overallLoadPercent > 100 ? "text-destructive" :
                                coach.overallLoadPercent >= 70 ? "text-amber-600" :
                                "text-green-600"
                              )}>
                                {Math.round(coach.overallLoadPercent)}%
                              </p>
                            </div>
                          ) : (
                            <Badge variant="outline" className="text-xs">No limits</Badge>
                          )}
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openLimitsDialog(coach.coachId, coach.coachName);
                          }}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Expanded Service Details */}
                    {isExpanded && coach.serviceLoads.length > 0 && (
                      <div className="border-t">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Service</TableHead>
                              <TableHead className="text-center">Active</TableHead>
                              <TableHead className="text-center">Max</TableHead>
                              <TableHead className="text-center">Remaining</TableHead>
                              <TableHead className="w-32">Load</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {coach.serviceLoads.map(sl => (
                              <TableRow key={sl.serviceId}>
                                <TableCell className="font-medium">{sl.serviceName}</TableCell>
                                <TableCell className="text-center">{sl.activeClients}</TableCell>
                                <TableCell className="text-center">
                                  {sl.maxClients !== null ? sl.maxClients : (
                                    <Badge variant="outline" className="text-xs">Not set</Badge>
                                  )}
                                </TableCell>
                                <TableCell className="text-center">
                                  {sl.maxClients !== null ? (
                                    <span className={cn(
                                      "font-medium",
                                      sl.maxClients - sl.activeClients < 0 ? "text-destructive" :
                                      sl.maxClients - sl.activeClients <= 2 ? "text-amber-600" :
                                      "text-green-600"
                                    )}>
                                      {sl.maxClients - sl.activeClients}
                                    </span>
                                  ) : '—'}
                                </TableCell>
                                <TableCell>
                                  {sl.loadPercent !== null ? (
                                    <div className="flex items-center gap-2">
                                      <Progress 
                                        value={Math.min(sl.loadPercent, 100)} 
                                        className="h-2 flex-1"
                                      />
                                      <Badge variant={getLoadBadgeVariant(sl.loadPercent)} className="text-xs min-w-[3rem] justify-center">
                                        {Math.round(sl.loadPercent)}%
                                      </Badge>
                                    </div>
                                  ) : (
                                    <span className="text-muted-foreground text-sm">—</span>
                                  )}
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}

                    {isExpanded && coach.serviceLoads.length === 0 && (
                      <div className="p-4 text-center text-muted-foreground text-sm border-t">
                        No services configured for this coach
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Capacity Alerts Card */}
      {(overCapacityAlerts.length > 0 || noCapacityAlerts.length > 0) && (
        <Card className="border-amber-200 bg-amber-50/50">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertTriangle className="h-5 w-5" />
              Capacity Alerts
            </CardTitle>
            <CardDescription>
              Issues that need attention
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Over Capacity Alerts */}
            {overCapacityAlerts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-destructive mb-2">Over Capacity</h4>
                <div className="space-y-2">
                  {overCapacityAlerts.map((alert, idx) => (
                    <div 
                      key={`over-${idx}`} 
                      className="flex items-center justify-between p-3 bg-destructive/10 border border-destructive/20 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">{alert.coachName}</p>
                        <p className="text-xs text-muted-foreground">
                          {alert.serviceName}: <span className="text-destructive font-medium">{alert.activeClients}</span> / {alert.maxClients}
                        </p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => openLimitsDialog(alert.coachId, alert.coachName)}
                      >
                        Adjust capacity
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* No Capacity Set Alerts */}
            {noCapacityAlerts.length > 0 && (
              <div>
                <h4 className="text-sm font-medium text-amber-700 mb-2">No Capacity Configured</h4>
                <div className="space-y-2">
                  {noCapacityAlerts.map((alert, idx) => (
                    <div 
                      key={`no-cap-${idx}`} 
                      className="flex items-center justify-between p-3 bg-amber-100/50 border border-amber-200 rounded-lg"
                    >
                      <div>
                        <p className="font-medium text-sm">{alert.coachName}</p>
                        <p className="text-xs text-muted-foreground">
                          {alert.serviceName}: {alert.activeClients} active clients, no limit set
                        </p>
                      </div>
                      <Button 
                        size="sm" 
                        variant="outline"
                        onClick={() => openLimitsDialog(alert.coachId, alert.coachName)}
                      >
                        Set capacity
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Coach Service Limits Dialog */}
      {selectedCoach && (
        <CoachServiceLimits
          coachId={selectedCoach.id}
          coachName={selectedCoach.name}
          open={limitsDialogOpen}
          onOpenChange={handleLimitsDialogClose}
        />
      )}
    </div>
  );
}
