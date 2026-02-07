import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useNavigate } from "react-router-dom";
import { Loader2, Users, AlertCircle, Clock, UserCheck, CreditCard, UserX, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface PipelineStage {
  key: string;
  label: string;
  count: number;
  color: string;
  action: string;
  filterParam: string;
  icon: React.ElementType;
}

interface StuckClient {
  id: string;
  name: string;
  email: string;
  stage: string;
  stageLabel: string;
  daysInStage: number;
  serviceName: string | null;
  coachName: string | null;
  updatedAt: string;
}

export function ClientPipelineSection() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [pipelineData, setPipelineData] = useState<PipelineStage[]>([]);
  const [stuckClients, setStuckClients] = useState<StuckClient[]>([]);
  const [totalClients, setTotalClients] = useState(0);

  const fetchPipelineData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch all profile counts by status - admin uses profiles view (security_invoker=true)
      // This queries through RLS-protected tables automatically
      const { data: profiles, error: profilesError } = await supabase
        .from('profiles')
        .select('id, status, email, first_name, last_name, full_name, updated_at');

      if (profilesError) throw profilesError;

      // Count by status
      const statusCounts: Record<string, number> = {
        pending: 0,
        needs_medical_review: 0,
        pending_coach_approval: 0,
        pending_payment: 0,
        approved: 0, // legacy - treat as pending_payment
        active: 0,
        inactive: 0,
        cancelled: 0,
        expired: 0,
        suspended: 0,
      };

      profiles?.forEach((p) => {
        const status = p.status || 'pending';
        if (statusCounts[status] !== undefined) {
          statusCounts[status]++;
        }
      });

      // Merge approved into pending_payment for display
      const pendingPaymentCount = statusCounts.pending_payment + statusCounts.approved;
      const inactiveGroupCount = 
        statusCounts.inactive + 
        statusCounts.cancelled + 
        statusCounts.expired + 
        statusCounts.suspended;

      const pipeline: PipelineStage[] = [
        {
          key: 'pending',
          label: 'Pending Onboarding',
          count: statusCounts.pending,
          color: 'bg-slate-400',
          action: 'View onboarding',
          filterParam: 'pending',
          icon: Users,
        },
        {
          key: 'needs_medical_review',
          label: 'Medical Review',
          count: statusCounts.needs_medical_review,
          color: 'bg-amber-500',
          action: 'Review medical cases',
          filterParam: 'needs_medical_review',
          icon: AlertCircle,
        },
        {
          key: 'pending_coach_approval',
          label: 'Coach Approval',
          count: statusCounts.pending_coach_approval,
          color: 'bg-blue-500',
          action: 'View coach approvals',
          filterParam: 'pending_coach_approval',
          icon: Clock,
        },
        {
          key: 'pending_payment',
          label: 'Pending Payment',
          count: pendingPaymentCount,
          color: 'bg-orange-500',
          action: 'View pending payments',
          filterParam: 'pending_payment',
          icon: CreditCard,
        },
        {
          key: 'active',
          label: 'Active',
          count: statusCounts.active,
          color: 'bg-green-500',
          action: 'View active clients',
          filterParam: 'active',
          icon: UserCheck,
        },
        {
          key: 'inactive_group',
          label: 'Inactive / Cancelled',
          count: inactiveGroupCount,
          color: 'bg-gray-500',
          action: 'View inactive clients',
          filterParam: 'inactive',
          icon: UserX,
        },
      ];

      setPipelineData(pipeline);
      setTotalClients(profiles?.length || 0);

      // Fetch stuck clients
      await fetchStuckClients();

    } catch (error) {
      console.error('Error fetching pipeline data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPipelineData();
  }, [fetchPipelineData]);

  const fetchStuckClients = async () => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);
      const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

      // Fetch profiles stuck in key stages with their subscriptions
      const { data: stuckProfiles, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          first_name,
          last_name,
          full_name,
          status,
          updated_at
        `)
        .in('status', ['needs_medical_review', 'pending_coach_approval', 'pending_payment', 'approved'])
        .order('updated_at', { ascending: true })
        .limit(50);

      if (error) throw error;

      // Get subscriptions for these profiles
      const profileIds = stuckProfiles?.map(p => p.id) || [];
      
      const subscriptionsMap: Record<string, { serviceName: string | null; coachName: string | null }> = {};
      
      if (profileIds.length > 0) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select(`
            user_id,
            services(name),
            coaches(first_name, last_name)
          `)
          .in('user_id', profileIds);

        subs?.forEach((sub: any) => {
          subscriptionsMap[sub.user_id] = {
            serviceName: sub.services?.name || null,
            coachName: sub.coaches 
              ? `${sub.coaches.first_name || ''} ${sub.coaches.last_name || ''}`.trim() || null
              : null,
          };
        });
      }

      // Filter and map stuck clients based on thresholds
      const stuck: StuckClient[] = [];

      stuckProfiles?.forEach((p) => {
        const updatedAt = new Date(p.updated_at || now);
        const daysInStage = Math.floor((now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000));
        
        let isStuck = false;
        let stageLabel = '';

        const effectiveStatus = p.status === 'approved' ? 'pending_payment' : p.status;

        switch (effectiveStatus) {
          case 'needs_medical_review':
            if (updatedAt < sevenDaysAgo) {
              isStuck = true;
              stageLabel = 'Medical Review';
            }
            break;
          case 'pending_coach_approval':
            if (updatedAt < threeDaysAgo) {
              isStuck = true;
              stageLabel = 'Coach Approval';
            }
            break;
          case 'pending_payment':
            if (updatedAt < fiveDaysAgo) {
              isStuck = true;
              stageLabel = 'Pending Payment';
            }
            break;
        }

        if (isStuck) {
          const subInfo = subscriptionsMap[p.id] || { serviceName: null, coachName: null };
          stuck.push({
            id: p.id,
            name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
            email: p.email,
            stage: effectiveStatus || 'unknown',
            stageLabel,
            daysInStage,
            serviceName: subInfo.serviceName,
            coachName: subInfo.coachName,
            updatedAt: p.updated_at || '',
          });
        }
      });

      // Sort by days in stage (longest first) and limit to 10
      stuck.sort((a, b) => b.daysInStage - a.daysInStage);
      setStuckClients(stuck.slice(0, 10));

    } catch (error) {
      console.error('Error fetching stuck clients:', error);
    }
  };

  const handleStageAction = (filterParam: string) => {
    navigate(`/dashboard/clients?status=${filterParam}`);
  };

  const handleStuckClientAction = (client: StuckClient) => {
    // Navigate to client management with a filter that will show this client
    navigate(`/dashboard/clients?status=${client.stage}`);
  };

  const getStageVariant = (stageLabel: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (stageLabel) {
      case 'Medical Review':
        return 'destructive';
      case 'Coach Approval':
        return 'secondary';
      case 'Pending Payment':
        return 'outline';
      default:
        return 'secondary';
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Calculate bar segment widths
  const maxCount = Math.max(...pipelineData.map(s => s.count), 1);

  return (
    <div className="space-y-6">
      {/* Client Pipeline Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold">
            Client Pipeline
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            {totalClients} total clients across all stages
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Segmented Status Bar */}
          <div className="space-y-3">
            <div className="flex gap-1 h-8 rounded-lg overflow-hidden">
              {pipelineData.map((stage) => {
                const widthPercent = totalClients > 0 
                  ? Math.max((stage.count / totalClients) * 100, stage.count > 0 ? 2 : 0) 
                  : 0;
                if (stage.count === 0) return null;
                return (
                  <div
                    key={stage.key}
                    className={cn(stage.color, "relative group cursor-pointer transition-opacity hover:opacity-80")}
                    style={{ width: `${widthPercent}%`, minWidth: stage.count > 0 ? '24px' : 0 }}
                    onClick={() => handleStageAction(stage.filterParam)}
                    title={`${stage.label}: ${stage.count}`}
                  >
                    <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-white">
                      {stage.count > 0 && stage.count}
                    </span>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-3">
              {pipelineData.map((stage) => (
                <div key={stage.key} className="flex items-center gap-1.5">
                  <div className={cn("w-3 h-3 rounded-sm", stage.color)} />
                  <span className="text-xs text-muted-foreground">{stage.label}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Status Table */}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pipelineData.map((stage) => {
                const Icon = stage.icon;
                return (
                  <TableRow key={stage.key}>
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4 text-muted-foreground" />
                        {stage.label}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="secondary">{stage.count}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-primary hover:text-primary/80"
                        onClick={() => handleStageAction(stage.filterParam)}
                      >
                        {stage.action}
                        <ArrowRight className="ml-1 h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Stuck Clients Card */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-4">
          <CardTitle className="text-lg font-semibold flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-500" />
            Stuck Clients
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Clients sitting too long in key stages (Medical &gt; 7d, Coach &gt; 3d, Payment &gt; 5d)
          </p>
        </CardHeader>
        <CardContent>
          {stuckClients.length === 0 ? (
            <div className="text-center py-6 text-muted-foreground">
              <UserCheck className="h-8 w-8 mx-auto mb-2 text-green-500" />
              <p className="text-sm">No stuck clients at the moment. Great job!</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead className="text-center">Days</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Coach</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {stuckClients.map((client) => (
                  <TableRow key={client.id}>
                    <TableCell>
                      <div>
                        <p className="font-medium text-sm">{client.name}</p>
                        <p className="text-xs text-muted-foreground">{client.email}</p>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant={getStageVariant(client.stageLabel)}>
                        {client.stageLabel}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={cn(
                        "font-semibold",
                        client.daysInStage >= 10 ? "text-destructive" :
                        client.daysInStage >= 7 ? "text-amber-600" :
                        "text-muted-foreground"
                      )}>
                        {client.daysInStage}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {client.serviceName || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {client.coachName || '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleStuckClientAction(client)}
                      >
                        {client.stage === 'needs_medical_review' ? 'Open review' :
                         client.stage === 'pending_coach_approval' ? 'View approvals' :
                         'Send reminder'}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
