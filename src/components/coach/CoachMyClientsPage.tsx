import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { 
  Users, Search, Eye, Activity, AlertCircle, TrendingUp, TrendingDown,
  Dumbbell, Library, MoreVertical, MessageSquare, ArrowRight,
  Check, X, Mail, Phone, DollarSign, Calendar, UserCheck, Clock, CreditCard,
  AlertTriangle, RefreshCw, Loader2, Inbox
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TeamMemberNutritionDialog } from "./TeamMemberNutritionDialog";
import { CoachEarningsSummary } from "./CoachEarningsSummary";
import { RoleBreadcrumb } from "./RoleBreadcrumb";
import { SimplePagination, createPagination } from "@/components/ui/simple-pagination";

interface CoachClient {
  id: string;
  display_name: string | null;
  first_name: string | null;
  profile_status: string | null;
  payment_deadline: string | null;
  payment_failed_at: string | null;
  subscription_id: string | null;
  subscription_status: string | null;
  service_name: string | null;
  service_type: string | null;
  start_date: string | null;
  next_billing_date: string | null;
  last_check_in: string | null;
  days_since_check_in: number | null;
}

interface CoachMyClientsPageProps {
  coachUserId: string;
  onViewClient?: (clientId: string) => void;
}

// Queue section types
type QueueSection = 'pending' | 'awaiting_payment' | 'active' | 'at_risk';

export function CoachMyClientsPage({ coachUserId, onViewClient }: CoachMyClientsPageProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  
  // Tab state from URL
  const urlTab = searchParams.get('tab') || 'clients';
  const urlFilter = searchParams.get('filter') as QueueSection | null;
  
  const [activeTab, setActiveTab] = useState(urlTab);
  const [clients, setClients] = useState<CoachClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filter state
  const [planFilter, setPlanFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // Nutrition dialog
  const [selectedClient, setSelectedClient] = useState<{ id: string; name: string } | null>(null);
  const [nutritionDialogOpen, setNutritionDialogOpen] = useState(false);

  // Approval action state
  const [processingApproval, setProcessingApproval] = useState<string | null>(null);
  const [processingDecline, setProcessingDecline] = useState<string | null>(null);

  // Per-section pagination
  const [sectionPages, setSectionPages] = useState<Record<string, number>>({});
  const CLIENTS_PER_PAGE = 20;

  // Ref for pending section (auto-scroll when needed)
  const pendingRef = useRef<HTMLDivElement>(null);
  const hasFetchedClients = useRef(false);

  // Define fetchClients BEFORE the useEffect that calls it
  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);

      // Get team IDs owned by this coach so we can include team-plan subscribers
      // (team-plan subs set `team_id` and leave `coach_id` NULL).
      const { data: ownedTeams } = await supabase
        .from("coach_teams")
        .select("id")
        .eq("coach_id", coachUserId);
      const teamIds = (ownedTeams || []).map(t => t.id);

      // Subscriptions where this coach is the primary OR the client is in one of their teams.
      // PostgREST doesn't support OR across two different columns cleanly with .or() and .in(),
      // so we run both queries in parallel and merge.
      const coachSubsQuery = supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          status,
          start_date,
          next_billing_date,
          service_id,
          services!inner(name, type)
        `)
        .eq("coach_id", coachUserId);

      const teamSubsQuery = teamIds.length > 0
        ? supabase
            .from("subscriptions")
            .select(`
              id,
              user_id,
              status,
              start_date,
              next_billing_date,
              service_id,
              services!inner(name, type)
            `)
            .in("team_id", teamIds)
        : Promise.resolve({ data: [], error: null });

      const [{ data: coachSubs, error: coachSubsError }, { data: teamSubs, error: teamSubsError }] =
        await Promise.all([coachSubsQuery, teamSubsQuery]);

      if (coachSubsError) throw coachSubsError;
      if (teamSubsError) throw teamSubsError;

      // Merge + dedupe by subscription id (in case a sub matches both paths).
      const seen = new Set<string>();
      const subscriptions: NonNullable<typeof coachSubs> = [];
      for (const sub of [...(coachSubs || []), ...(teamSubs || [])]) {
        if (!seen.has(sub.id)) {
          seen.add(sub.id);
          subscriptions.push(sub);
        }
      }

      if (subscriptions.length === 0) {
        setClients([]);
        return;
      }

      // Batch: fetch all profiles in one query using .in()
      const userIds = subscriptions.map(s => s.user_id);
      const { data: profiles } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name, status, payment_deadline")
        .in("id", userIds);

      const profileMap = new Map(
        (profiles || []).map(p => [p.id, p])
      );

      // Batch: fetch most recent weight log per user using RPC or grouped query
      // We fetch all recent weight logs for these users, then pick the latest per user
      const { data: allWeightLogs } = await supabase
        .from("weight_logs")
        .select("user_id, log_date")
        .in("user_id", userIds)
        .order("log_date", { ascending: false });

      const lastCheckInMap = new Map<string, string>();
      for (const log of allWeightLogs || []) {
        if (!lastCheckInMap.has(log.user_id)) {
          lastCheckInMap.set(log.user_id, log.log_date);
        }
      }

      // Build client list from batched data
      const clientList: CoachClient[] = subscriptions.map(sub => {
        const profile = profileMap.get(sub.user_id);
        const lastCheckIn = lastCheckInMap.get(sub.user_id) || null;
        const daysSinceCheckIn = lastCheckIn
          ? Math.floor((Date.now() - new Date(lastCheckIn).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        return {
          id: sub.user_id,
          display_name: profile?.display_name || null,
          first_name: profile?.first_name || null,
          profile_status: profile?.status || null,
          payment_deadline: profile?.payment_deadline || null,
          payment_failed_at: null,
          subscription_id: sub.id,
          subscription_status: sub.status,
          service_name: (sub.services as any)?.name,
          service_type: (sub.services as any)?.type,
          start_date: sub.start_date,
          next_billing_date: sub.next_billing_date,
          last_check_in: lastCheckIn,
          days_since_check_in: daysSinceCheckIn,
        };
      });

      setClients(clientList);
    } catch (error: any) {
      console.error("[CoachMyClientsPage] Error fetching clients:", error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  // Fetch clients on mount and when coach changes
  useEffect(() => {
    // Prevent running multiple times
    if (hasFetchedClients.current) {
      return;
    }

    if (coachUserId) {
      hasFetchedClients.current = true;
      fetchClients();
    }
  }, [coachUserId, fetchClients]);

  // Handle URL filter param for auto-scrolling
  useEffect(() => {
    if (urlFilter === 'pending' && pendingRef.current) {
      setTimeout(() => {
        pendingRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, [urlFilter]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchClients();
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Client list has been updated.",
    });
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    const newParams = new URLSearchParams(searchParams);
    newParams.set('tab', tab);
    setSearchParams(newParams);
  };

  // ========== QUEUE SECTION FILTERS ==========
  // A) Pending Approvals: profiles.status='pending_coach_approval' && subscriptions.status='pending'
  const pendingApprovals = clients.filter(c => 
    c.profile_status === 'pending_coach_approval' && c.subscription_status === 'pending'
  );

  // B) Awaiting Payment: profiles.status='pending_payment' && subscriptions.status='pending'
  const awaitingPayment = clients.filter(c => 
    c.profile_status === 'pending_payment' && c.subscription_status === 'pending'
  );

  // C) Active: profiles.status='active' && subscriptions.status='active'
  const activeClients = clients.filter(c => 
    c.profile_status === 'active' && c.subscription_status === 'active'
  );

  // D) At-Risk: inactive status OR payment_failed_at exists
  const atRiskClients = clients.filter(c => 
    c.subscription_status === 'inactive' || 
    c.profile_status === 'inactive' ||
    c.payment_failed_at !== null
  );

  // Apply search and plan filters to all sections
  const applyFilters = (list: CoachClient[]) => {
    let filtered = list;
    
    if (planFilter !== 'all') {
      filtered = filtered.filter(c => c.service_name === planFilter);
    }
    
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(c => {
        const name = getClientDisplayName(c).toLowerCase();
        return name.includes(query);
      });
    }
    
    return filtered;
  };

  const getClientDisplayName = (client: CoachClient): string => {
    if (client.display_name) return client.display_name;
    if (client.first_name) return client.first_name;
    return 'Client';
  };

  const getStatusBadge = (profileStatus: string | null, subStatus: string | null) => {
    if (profileStatus === 'active' && subStatus === 'active') {
      return <Badge variant="default">Active</Badge>;
    }
    if (profileStatus === 'pending_coach_approval') {
      return <Badge className="bg-amber-500 hover:bg-amber-600">Pending Approval</Badge>;
    }
    if (profileStatus === 'pending_payment') {
      return <Badge className="bg-blue-500 hover:bg-blue-600">Pending Payment</Badge>;
    }
    if (subStatus === 'cancelled' || profileStatus === 'cancelled') {
      return <Badge variant="outline">Cancelled</Badge>;
    }
    if (subStatus === 'inactive' || profileStatus === 'inactive') {
      return <Badge variant="destructive">Inactive</Badge>;
    }
    return <Badge variant="outline">{profileStatus || subStatus || 'Unknown'}</Badge>;
  };

  const getProgressBadge = (daysSinceCheckIn: number | null) => {
    if (daysSinceCheckIn === null) {
      return <span className="text-muted-foreground text-xs">No data</span>;
    }
    if (daysSinceCheckIn <= 3) {
      return <Badge variant="default" className="gap-1 bg-green-500"><TrendingUp className="h-3 w-3" /> On track</Badge>;
    }
    if (daysSinceCheckIn <= 7) {
      return <Badge variant="secondary">Due soon</Badge>;
    }
    return <Badge variant="destructive" className="gap-1"><TrendingDown className="h-3 w-3" /> Needs attention</Badge>;
  };

  // ========== APPROVAL HANDLERS ==========
  const handleApproveClient = async (client: CoachClient) => {
    if (!client.subscription_id) {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', client.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!subData) {
        toast({
          title: "Error",
          description: "No pending subscription found for this client.",
          variant: "destructive",
        });
        return;
      }
      client.subscription_id = subData.id;
    }

    setProcessingApproval(client.id);
    try {
      // Check if payment exempt - use profiles_public (coaches have access)
      const { data: profileData } = await supabase
        .from('profiles_public')
        .select('payment_exempt')
        .eq('id', client.id)
        .single();

      const shouldSkipPayment = !!profileData?.payment_exempt;
      const newProfileStatus = shouldSkipPayment ? 'active' : 'pending_payment';

      const paymentDeadline = new Date();
      paymentDeadline.setDate(paymentDeadline.getDate() + 7);

      // Update profile in profiles_public
      const { error: profileError } = await supabase
        .from('profiles_public')
        .update({
          status: newProfileStatus,
          payment_deadline: shouldSkipPayment ? null : paymentDeadline.toISOString(),
        })
        .eq('id', client.id);

      if (profileError) throw profileError;

      // If payment exempt, activate subscription
      if (shouldSkipPayment) {
        const { error: subError } = await supabase
          .from('subscriptions')
          .update({ status: 'active' })
          .eq('id', client.subscription_id);
        if (subError) throw subError;
      }

      // Send approval notification (non-blocking)
      try {
        await supabase.functions.invoke('send-client-approval-notification', {
          body: { userId: client.id, coachId: coachUserId },
        });
      } catch (emailErr) {
        console.error('Failed to send approval notification:', emailErr);
      }

      toast({
        title: "Client Approved ✓",
        description: shouldSkipPayment
          ? `${getClientDisplayName(client)} is now active.`
          : `Approved. ${getClientDisplayName(client)} has 7 days to complete payment.`,
      });

      await fetchClients();
    } catch (error: any) {
      toast({
        title: "Approval Failed",
        description: error?.message ?? 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setProcessingApproval(null);
    }
  };

  const handleDeclineClient = async (client: CoachClient) => {
    if (!client.subscription_id) {
      const { data: subData } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('user_id', client.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!subData) {
        toast({
          title: "Error",
          description: "No pending subscription found for this client.",
          variant: "destructive",
        });
        return;
      }
      client.subscription_id = subData.id;
    }

    const confirmed = window.confirm(
      `Decline ${getClientDisplayName(client)}? This will cancel their pending subscription.`
    );
    if (!confirmed) return;

    setProcessingDecline(client.id);
    try {
      const { error: subError } = await supabase
        .from('subscriptions')
        .update({ status: 'cancelled' })
        .eq('id', client.subscription_id);

      if (subError) throw subError;

      const { error: profileError } = await supabase
        .from('profiles_public')
        .update({ status: 'inactive' })
        .eq('id', client.id);

      if (profileError) throw profileError;

      toast({
        title: "Client Declined",
        description: `${getClientDisplayName(client)} has been declined.`,
      });

      await fetchClients();
    } catch (error: any) {
      toast({
        title: "Decline Failed",
        description: error?.message ?? 'Unknown error',
        variant: "destructive",
      });
    } finally {
      setProcessingDecline(null);
    }
  };

  const handleViewNutrition = (client: CoachClient) => {
    if (client.service_type === 'team') {
      setSelectedClient({
        id: client.id,
        name: getClientDisplayName(client)
      });
      setNutritionDialogOpen(true);
    } else {
      navigate(`/coach/clients/${client.id}?tab=nutrition`);
    }
  };

  const handleRequestReview = async (client: CoachClient) => {
    // Note: Reviews require email which coaches don't have access to anymore
    // This should go through an edge function that fetches email server-side
    toast({
      title: "Coming Soon",
      description: "Testimonial requests are sent automatically after 4 weeks. Contact admin for manual requests.",
      variant: "default",
    });
  };

  // Get unique plans for filter
  const uniquePlans = [...new Set(clients.map(c => c.service_name).filter(Boolean))];

  // ========== SECTION CARD COMPONENT ==========
  const QueueSectionCard = ({
    title,
    sectionKey,
    icon: Icon,
    clients: sectionClients,
    variant,
    emptyText,
    showActions = false,
    showPaymentInfo = false,
    sectionRef
  }: {
    title: string;
    sectionKey: string;
    icon: any;
    clients: CoachClient[];
    variant: 'amber' | 'blue' | 'green' | 'red' | 'default';
    emptyText: string;
    showActions?: boolean;
    showPaymentInfo?: boolean;
    sectionRef?: React.RefObject<HTMLDivElement>;
  }) => {
    const filteredClients = applyFilters(sectionClients);
    const page = sectionPages[sectionKey] || 1;
    const { paginate } = createPagination(filteredClients, CLIENTS_PER_PAGE);
    const { paginatedItems: pageClients, totalPages, totalItems, pageSize } = paginate(page);
    const variantStyles = {
      amber: 'border-amber-500/20 bg-amber-500/5',
      blue: 'border-blue-500/20 bg-blue-500/5',
      green: 'border-emerald-500/20 bg-emerald-500/5',
      red: 'border-red-500/20 bg-red-500/5',
      default: ''
    };

    const iconStyles = {
      amber: 'text-amber-400',
      blue: 'text-blue-400',
      green: 'text-emerald-400',
      red: 'text-red-400',
      default: 'text-muted-foreground'
    };

    const badgeStyles = {
      amber: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
      blue: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
      green: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
      red: 'bg-red-500/15 text-red-400 border-red-500/20',
      default: ''
    };

    return (
      <Card ref={sectionRef} className={variantStyles[variant]}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base">
              <Icon className={`h-5 w-5 ${iconStyles[variant]}`} />
              {title}
            </span>
            <Badge variant="secondary" className={`font-medium ${badgeStyles[variant]}`}>
              {filteredClients.length}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredClients.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title={emptyText}
              className="py-6"
            />
          ) : (
            <>
            <div className="space-y-3">
              {pageClients.map((client) => {
                const isProcessing = processingApproval === client.id || processingDecline === client.id;
                const handleRowClick = () => {
                  if (onViewClient) {
                    onViewClient(client.id);
                  } else {
                    navigate(`/coach/clients/${client.id}`);
                  }
                };

                return (
                  <ClickableCard
                    key={client.id}
                    ariaLabel={`Open ${getClientDisplayName(client)}'s profile`}
                    onClick={handleRowClick}
                    className="flex items-center justify-between p-3 rounded-lg shadow-none"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium truncate">{getClientDisplayName(client)}</span>
                        {client.service_name && (
                          <Badge variant="outline" className="text-xs shrink-0">
                            {client.service_name}
                          </Badge>
                        )}
                      </div>
                      {/* Note: Email hidden from coaches for privacy */}
                      
                      {showPaymentInfo && client.payment_deadline && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span>
                            Due: {new Date(client.payment_deadline).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                      
                      {variant === 'red' && client.payment_failed_at && (
                        <div className="flex items-center gap-1 mt-1 text-xs text-destructive">
                          <AlertTriangle className="h-3 w-3" />
                          <span>Payment failed</span>
                        </div>
                      )}
                    </div>
                    
                    {/* Mobile-friendly action buttons - always visible, not hidden in dropdown */}
                    <div
                      className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2 sm:ml-3"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      {showActions && (
                        <>
                          <Button
                            size="sm"
                            className="h-8 px-2 sm:px-3 gap-1 bg-green-600 hover:bg-green-700 text-white"
                            onClick={() => handleApproveClient(client)}
                            disabled={isProcessing}
                          >
                            {processingApproval === client.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <Check className="h-4 w-4" />
                                <span className="sr-only sm:not-sr-only sm:inline">Approve</span>
                              </>
                            )}
                          </Button>
                          <Button
                            size="sm"
                            variant="destructive"
                            className="h-8 px-2 sm:px-3 gap-1"
                            onClick={() => handleDeclineClient(client)}
                            disabled={isProcessing}
                          >
                            {processingDecline === client.id ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <X className="h-4 w-4" />
                                <span className="sr-only sm:not-sr-only sm:inline">Decline</span>
                              </>
                            )}
                          </Button>
                        </>
                      )}
                      
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {onViewClient && (
                            <DropdownMenuItem onClick={() => onViewClient(client.id)}>
                              <Eye className="h-4 w-4 mr-2" />
                              View Profile
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => navigate(`/client-submission/${client.id}`)}>
                            <Eye className="h-4 w-4 mr-2" />
                            View Onboarding
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleViewNutrition(client)}>
                            <Activity className="h-4 w-4 mr-2" />
                            View Nutrition
                          </DropdownMenuItem>
                          {variant === 'green' && (
                            <DropdownMenuItem onClick={() => handleRequestReview(client)}>
                              <MessageSquare className="h-4 w-4 mr-2" />
                              Request Review
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </ClickableCard>
                );
              })}
            </div>
            <SimplePagination
              currentPage={page}
              totalPages={totalPages}
              onPageChange={(p) => setSectionPages(prev => ({ ...prev, [sectionKey]: p }))}
              totalItems={totalItems}
              pageSize={pageSize}
            />
            </>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      {/* Role Breadcrumb */}
      <RoleBreadcrumb role="coach" currentPage="My Clients" />
      
      {/* Top-level Tabs */}
      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="clients" className="gap-2">
            <Users className="h-4 w-4" />
            Clients
          </TabsTrigger>
          <TabsTrigger value="payouts">
            Payouts
          </TabsTrigger>
        </TabsList>

        {/* Clients Tab */}
        <TabsContent value="clients" className="mt-6 space-y-6">
          {/* Header with Refresh and Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">Client Queue</h2>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={refreshing}
                className="gap-2"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Filters */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search clients..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 w-48"
                />
              </div>
              <Select value={planFilter} onValueChange={setPlanFilter}>
                <SelectTrigger className="w-36">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Plans</SelectItem>
                  {uniquePlans.map(plan => (
                    <SelectItem key={plan} value={plan!}>{plan}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* A) Pending Approvals - Always visible at top, no scrolling needed */}
              <QueueSectionCard
                sectionRef={pendingRef}
                sectionKey="pending"
                title="Pending Approvals"
                icon={UserCheck}
                clients={pendingApprovals}
                variant="amber"
                emptyText="No clients waiting for your approval"
                showActions={true}
              />

              {/* B) Approved - Awaiting Payment (read-only) */}
              <QueueSectionCard
                sectionKey="awaiting_payment"
                title="Awaiting Payment"
                icon={CreditCard}
                clients={awaitingPayment}
                variant="blue"
                emptyText="No clients awaiting payment"
                showPaymentInfo={true}
              />

              {/* C) Active Clients */}
              <QueueSectionCard
                sectionKey="active"
                title="Active Clients"
                icon={Users}
                clients={activeClients}
                variant="green"
                emptyText="No active clients yet"
              />

              {/* D) At-Risk Clients */}
              {atRiskClients.length > 0 && (
                <QueueSectionCard
                  sectionKey="at_risk"
                  title="At-Risk"
                  icon={AlertTriangle}
                  clients={atRiskClients}
                  variant="red"
                  emptyText="No at-risk clients"
                />
              )}
            </div>
          )}

          {/* Quick Actions */}
          <div className="space-y-3">
            <h3 className="text-lg font-semibold">Quick Actions</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <ClickableCard
                ariaLabel="Open exercise library"
                onClick={() => navigate('/coach/exercises')}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="p-3 rounded-lg bg-primary/10" aria-hidden="true">
                    <Library className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Exercise Library</p>
                    <p className="text-xs text-muted-foreground">Browse workouts</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </CardContent>
              </ClickableCard>

              <ClickableCard
                ariaLabel="Open educational videos"
                onClick={() => navigate('/educational-videos')}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="p-3 rounded-lg bg-primary/10" aria-hidden="true">
                    <Dumbbell className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Educational Videos</p>
                    <p className="text-xs text-muted-foreground">Learning resources</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                </CardContent>
              </ClickableCard>
            </div>
          </div>
        </TabsContent>

        {/* Payouts Tab */}
        <TabsContent value="payouts" className="mt-6 space-y-6">
          <div>
            <p className="text-muted-foreground">
              Your earnings summary. Contact admin for detailed payment history.
            </p>
          </div>
          
          <CoachEarningsSummary />
        </TabsContent>
      </Tabs>

      {/* Nutrition Dialog */}
      {selectedClient && (
        <TeamMemberNutritionDialog
          clientId={selectedClient.id}
          clientName={selectedClient.name}
          open={nutritionDialogOpen}
          onOpenChange={setNutritionDialogOpen}
        />
      )}
    </div>
  );
}