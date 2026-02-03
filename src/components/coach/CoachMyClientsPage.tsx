import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { 
  Users, Search, Eye, Activity, AlertCircle, TrendingUp, TrendingDown,
  Dumbbell, Utensils, Library, MoreVertical, MessageSquare, ArrowRight,
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

  // Ref for pending section (auto-scroll when needed)
  const pendingRef = useRef<HTMLDivElement>(null);

  // Fetch clients on mount and when coach changes
  useEffect(() => {
    if (coachUserId) {
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

  const fetchClients = useCallback(async () => {
    try {
      setLoading(true);
      
      // Get subscriptions for this coach
      const { data: subscriptions, error: subsError } = await supabase
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

      if (subsError) throw subsError;

      // Build client list by fetching profiles_public separately
      const clientList: CoachClient[] = [];

      for (const sub of subscriptions || []) {
        // Fetch profile from profiles_public (non-sensitive data only)
        const { data: profile } = await supabase
          .from("profiles_public")
          .select("id, first_name, display_name, status, payment_deadline")
          .eq("id", sub.user_id)
          .single();
        
        // Get last weight log for check-in info
        const { data: weightLogs } = await supabase
          .from("weight_logs")
          .select("log_date")
          .eq("user_id", sub.user_id)
          .order("log_date", { ascending: false })
          .limit(1);

        const lastCheckIn = weightLogs?.[0]?.log_date || null;
        const daysSinceCheckIn = lastCheckIn 
          ? Math.floor((Date.now() - new Date(lastCheckIn).getTime()) / (1000 * 60 * 60 * 24))
          : null;

        clientList.push({
          id: sub.user_id,
          display_name: profile?.display_name || null,
          first_name: profile?.first_name || null,
          profile_status: profile?.status || null,
          payment_deadline: profile?.payment_deadline || null,
          payment_failed_at: null, // Not available from profiles_public
          subscription_id: sub.id,
          subscription_status: sub.status,
          service_name: (sub.services as any)?.name,
          service_type: (sub.services as any)?.type,
          start_date: sub.start_date,
          next_billing_date: sub.next_billing_date,
          last_check_in: lastCheckIn,
          days_since_check_in: daysSinceCheckIn,
        });
      }

      setClients(clientList);
    } catch (error: any) {
      console.error("[CoachMyClientsPage] Error fetching clients:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

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
      navigate(`/coach-client-nutrition?clientId=${client.id}`);
    }
  };

  const handleRequestReview = async (client: CoachClient) => {
    // Note: Reviews require email which coaches don't have access to anymore
    // This should go through an edge function that fetches email server-side
    toast({
      title: "Coming Soon",
      description: "Testimonial requests are handled through TrueCoach. Contact admin for manual requests.",
      variant: "default",
    });
  };

  // Get unique plans for filter
  const uniquePlans = [...new Set(clients.map(c => c.service_name).filter(Boolean))];

  // ========== SECTION CARD COMPONENT ==========
  const QueueSectionCard = ({ 
    title, 
    icon: Icon, 
    clients: sectionClients, 
    variant, 
    emptyText,
    showActions = false,
    showPaymentInfo = false,
    sectionRef
  }: { 
    title: string;
    icon: any;
    clients: CoachClient[];
    variant: 'amber' | 'blue' | 'green' | 'red' | 'default';
    emptyText: string;
    showActions?: boolean;
    showPaymentInfo?: boolean;
    sectionRef?: React.RefObject<HTMLDivElement>;
  }) => {
    const filteredClients = applyFilters(sectionClients);
    const variantStyles = {
      amber: 'border-amber-200 bg-amber-50/50',
      blue: 'border-blue-200 bg-blue-50/50',
      green: 'border-green-200 bg-green-50/50',
      red: 'border-red-200 bg-red-50/50',
      default: ''
    };

    const iconStyles = {
      amber: 'text-amber-600',
      blue: 'text-blue-600',
      green: 'text-green-600',
      red: 'text-red-600',
      default: 'text-muted-foreground'
    };

    return (
      <Card ref={sectionRef} className={variantStyles[variant]}>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-base">
              <Icon className={`h-5 w-5 ${iconStyles[variant]}`} />
              {title}
            </span>
            <Badge variant="secondary" className="font-medium">
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
            <div className="space-y-3">
              {filteredClients.map((client) => {
                const isProcessing = processingApproval === client.id || processingDecline === client.id;
                
                return (
                  <div key={client.id} className="flex items-center justify-between p-3 rounded-lg border bg-background">
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
                    <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 ml-2 sm:ml-3">
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
                  </div>
                );
              })}
            </div>
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
                title="Pending Approvals"
                icon={UserCheck}
                clients={pendingApprovals}
                variant="amber"
                emptyText="No clients waiting for your approval"
                showActions={true}
              />

              {/* B) Approved - Awaiting Payment (read-only) */}
              <QueueSectionCard
                title="Awaiting Payment"
                icon={CreditCard}
                clients={awaitingPayment}
                variant="blue"
                emptyText="No clients awaiting payment"
                showPaymentInfo={true}
              />

              {/* C) Active Clients */}
              <QueueSectionCard
                title="Active Clients"
                icon={Users}
                clients={activeClients}
                variant="green"
                emptyText="No active clients yet"
              />

              {/* D) At-Risk Clients */}
              {atRiskClients.length > 0 && (
                <QueueSectionCard
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30"
                onClick={() => navigate('/coach-client-nutrition')}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Utensils className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Manage Nutrition</p>
                    <p className="text-xs text-muted-foreground">View & update client plans</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30"
                onClick={() => navigate('/workout-library')}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Library className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Exercise Library</p>
                    <p className="text-xs text-muted-foreground">Browse workouts</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>

              <Card 
                className="cursor-pointer hover:shadow-md transition-shadow hover:border-primary/30"
                onClick={() => navigate('/educational-videos')}
              >
                <CardContent className="flex items-center gap-4 p-4">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Dumbbell className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">Educational Videos</p>
                    <p className="text-xs text-muted-foreground">Learning resources</p>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground" />
                </CardContent>
              </Card>
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