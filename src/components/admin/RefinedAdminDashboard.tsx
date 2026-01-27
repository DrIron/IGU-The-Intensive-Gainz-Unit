import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Bell, Search, TrendingUp, Users, DollarSign, AlertTriangle, Loader2, ChevronRight } from "lucide-react";
import { startOfMonth, endOfMonth, startOfDay, endOfDay, subMonths, subDays, startOfYear, format as formatDate, addDays } from "date-fns";
import { useNavigate } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CalendarIcon, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { ClientPipelineSection } from "./ClientPipelineSection";
import { SystemHealthCard } from "./SystemHealthCard";

interface RefinedAdminDashboardProps {
  user: any;
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

export function RefinedAdminDashboard({ 
  user,
  activeSection: externalActiveSection,
  onSectionChange: externalOnSectionChange
}: RefinedAdminDashboardProps) {
  const [role, setRole] = useState<"admin" | "coach">("admin");
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subMonths(new Date(), 1),
    to: new Date()
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [showFilters, setShowFilters] = useState(false);
  const { toast } = useToast();

  const applyDatePreset = (preset: string) => {
    const now = new Date();
    let from: Date;
    
    switch (preset) {
      case "7d":
        from = subDays(now, 7);
        break;
      case "30d":
        from = subDays(now, 30);
        break;
      case "3m":
        from = subMonths(now, 3);
        break;
      case "6m":
        from = subMonths(now, 6);
        break;
      case "ytd":
        from = startOfYear(now);
        break;
      default:
        from = subMonths(now, 1);
    }
    
    setDateRange({ from, to: now });
    toast({
      title: "Date Range Updated",
      description: `Showing data from ${formatDate(from, "PPP")} to ${formatDate(now, "PPP")}`,
    });
  };
  // Get section title based on active section
  const getSectionTitle = () => {
    const sectionTitles: Record<string, string> = {
      'dashboard': 'Overview',
      'overview': 'Overview',
      'clients': 'Clients',
      'pending-clients': 'Pending Clients',
      'coaches': 'Coach Management',
      'requests': 'Coach Applications',
      'testimonials': 'Testimonials',
      'exercises': 'Exercise Library',
      'educational-videos': 'Educational Videos',
      'discount-codes': 'Discount Codes',
      'discord-legal': 'Discord & Legal',
      'services': 'Settings',
      'analytics': 'Analytics',
      'coach-dashboard': 'Coach Overview',
      'my-clients': 'My Clients',
      'client-nutrition': 'Client Nutrition',
    };
    return sectionTitles[externalActiveSection || 'dashboard'] || 'Dashboard';
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-[#F7F8FA]">
        <AdminSidebar activeSection={externalActiveSection || "dashboard"} onSectionChange={externalOnSectionChange || (() => {})} />
        
        <main className="flex-1 overflow-auto">
          {/* Header Row */}
          <div className="bg-white border-b border-[#E8EBF0] sticky top-0 z-10">
            <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                {/* Left: Title + Role Switcher */}
                <div className="flex items-center gap-3 flex-wrap min-w-0">
                  <SidebarTrigger className="md:hidden shrink-0" />
                  <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-[#0F1720] shrink-0" style={{ fontFamily: 'Sora, sans-serif' }}>
                    {getSectionTitle()}
                  </h1>
                  <Tabs value={role} onValueChange={(v) => setRole(v as "admin" | "coach")}>
                    <TabsList className="bg-[#F7F8FA] h-10 p-1">
                      <TabsTrigger 
                        value="admin" 
                        className="data-[state=active]:bg-white px-4 py-2 min-w-[60px] text-sm font-medium"
                      >
                        Admin
                      </TabsTrigger>
                      <TabsTrigger 
                        value="coach" 
                        className="data-[state=active]:bg-white px-4 py-2 min-w-[60px] text-sm font-medium"
                      >
                        Coach
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </div>

                {/* Right: Controls */}
                <div className="flex items-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowFilters(!showFilters)}
                    className="gap-2"
                  >
                    <Filter className="h-4 w-4" />
                    Filters
                  </Button>

                  <div className="relative hidden md:block">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#6B7280]" />
                    <Input
                      placeholder="Search clients..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 w-[200px] bg-white border-[#E8EBF0]"
                    />
                  </div>

                  <button className="relative p-2 hover:bg-[#F7F8FA] rounded-lg transition-colors">
                    <Bell className="h-5 w-5 text-[#6B7280]" />
                    <span className="absolute top-1 right-1 h-2 w-2 bg-[#E11D2E] rounded-full" />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Main Content */}
          <div className="max-w-[1200px] mx-auto px-4 md:px-8 py-6 md:py-8 space-y-6">
            {/* Filter Panel */}
            {showFilters && (
              <Card>
                <CardContent className="pt-6">
                  {/* Quick Date Presets */}
                  <div className="space-y-3 mb-6">
                    <label className="text-sm font-medium">Quick Date Ranges</label>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyDatePreset("7d")}
                        className="hover:bg-primary hover:text-primary-foreground"
                      >
                        Last 7 Days
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyDatePreset("30d")}
                        className="hover:bg-primary hover:text-primary-foreground"
                      >
                        Last 30 Days
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyDatePreset("3m")}
                        className="hover:bg-primary hover:text-primary-foreground"
                      >
                        Last 3 Months
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyDatePreset("6m")}
                        className="hover:bg-primary hover:text-primary-foreground"
                      >
                        Last 6 Months
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => applyDatePreset("ytd")}
                        className="hover:bg-primary hover:text-primary-foreground"
                      >
                        Year to Date
                      </Button>
                    </div>
                  </div>

                  {/* Custom Date Range */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">From Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !dateRange.from && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.from ? formatDate(dateRange.from, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-popover" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange.from}
                            onSelect={(date) => date && setDateRange({ ...dateRange, from: date })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <label className="text-sm font-medium">To Date</label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full justify-start text-left font-normal",
                              !dateRange.to && "text-muted-foreground"
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {dateRange.to ? formatDate(dateRange.to, "PPP") : "Pick a date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0 bg-popover" align="start">
                          <Calendar
                            mode="single"
                            selected={dateRange.to}
                            onSelect={(date) => date && setDateRange({ ...dateRange, to: date })}
                            initialFocus
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>

                  {/* Active Filters Display */}
                  {dateRange.from && dateRange.to && (
                    <div className="mt-4 flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Active Filter:</span>
                      <Badge variant="secondary">
                        {formatDate(dateRange.from, "MMM d, yyyy")} - {formatDate(dateRange.to, "MMM d, yyyy")}
                      </Badge>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {role === "admin" ? (
              <AdminDashboardContent dateRange={dateRange} />
            ) : (
              <CoachDashboardContent dateRange={dateRange} />
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function AdminDashboardContent({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    newSignups: { value: 0, change: 0, changePercent: "" },
    activeSubscriptions: { value: 0, change: 0, changePercent: "" },
    mrr: { value: 0, change: 0, changePercent: "" },
    paymentIssues: { value: 0, change: 0 },
  });
  const [workQueue, setWorkQueue] = useState({
    pendingApprovals: [] as any[],
    legalIssues: [] as any[],
    paymentProblems: [] as any[],
    upcomingRenewals: [] as any[],
  });

  useEffect(() => {
    fetchMetrics();
    fetchWorkQueue();
  }, [dateRange]);

  const fetchMetrics = async () => {
    try {
      setLoading(true);

      // Calculate date ranges
      const now = new Date();
      const thisMonthStart = startOfMonth(now);
      const thisMonthEnd = endOfMonth(now);
      const lastMonthStart = startOfMonth(subMonths(now, 1));
      const lastMonthEnd = endOfMonth(subMonths(now, 1));

      // 1. New Signups (this month) - admin uses profiles_public for counts
      const { count: thisMonthSignups } = await supabase
        .from('profiles_public')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', thisMonthStart.toISOString())
        .lte('created_at', thisMonthEnd.toISOString());

      const { count: lastMonthSignups } = await supabase
        .from('profiles_public')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', lastMonthStart.toISOString())
        .lte('created_at', lastMonthEnd.toISOString());

      const signupChange = (thisMonthSignups || 0) - (lastMonthSignups || 0);
      const signupChangePercent = lastMonthSignups && lastMonthSignups > 0
        ? ((signupChange / lastMonthSignups) * 100).toFixed(0)
        : "0";

      // 2. Active Subscriptions (current)
      const { count: activeSubsCount } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active');

      // Get last month's active count (approximate - count subscriptions created before last month end that are still active)
      const { count: lastMonthActiveSubs } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .lte('created_at', lastMonthEnd.toISOString());

      const subsChange = (activeSubsCount || 0) - (lastMonthActiveSubs || 0);
      const subsChangePercent = lastMonthActiveSubs && lastMonthActiveSubs > 0
        ? ((subsChange / lastMonthActiveSubs) * 100).toFixed(0)
        : "0";

      // 3. MRR (Monthly Recurring Revenue)
      const { data: activeSubs, error: subsError } = await supabase
        .from('subscriptions')
        .select(`
          id,
          services!inner(price_kwd)
        `)
        .eq('status', 'active');

      if (subsError) throw subsError;

      const currentMRR = activeSubs?.reduce((sum, sub: any) => {
        return sum + (sub.services?.price_kwd || 0);
      }, 0) || 0;

      // Calculate last month's MRR (subscriptions that were active then)
      const { data: lastMonthSubs } = await supabase
        .from('subscriptions')
        .select(`
          id,
          services!inner(price_kwd)
        `)
        .eq('status', 'active')
        .lte('created_at', lastMonthEnd.toISOString());

      const lastMRR = lastMonthSubs?.reduce((sum, sub: any) => {
        return sum + (sub.services?.price_kwd || 0);
      }, 0) || 0;

      const mrrChange = currentMRR - lastMRR;
      const mrrChangePercent = lastMRR > 0
        ? ((mrrChange / lastMRR) * 100).toFixed(0)
        : "0";

      // 4. Payment Issues (Failed/Overdue)
      // Failed payments in the last 30 days
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const { count: failedPayments } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .not('payment_failed_at', 'is', null)
        .gte('payment_failed_at', thirtyDaysAgo.toISOString());

      // Overdue payments (next_billing_date passed and status is active but payment failed)
      const { count: overduePayments } = await supabase
        .from('subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')
        .not('payment_failed_at', 'is', null)
        .lt('next_billing_date', now.toISOString());

      const totalPaymentIssues = (failedPayments || 0) + (overduePayments || 0);

      setMetrics({
        newSignups: {
          value: thisMonthSignups || 0,
          change: signupChange,
          changePercent: `${signupChange >= 0 ? '+' : ''}${signupChangePercent}%`,
        },
        activeSubscriptions: {
          value: activeSubsCount || 0,
          change: subsChange,
          changePercent: `${subsChange >= 0 ? '+' : ''}${subsChangePercent}%`,
        },
        mrr: {
          value: currentMRR,
          change: mrrChange,
          changePercent: `${mrrChange >= 0 ? '+' : ''}${mrrChangePercent}%`,
        },
        paymentIssues: {
          value: totalPaymentIssues,
          change: totalPaymentIssues,
        },
      });
    } catch (error: any) {
      console.error('Error fetching metrics:', error);
      toast({
        title: "Error loading metrics",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchWorkQueue = async () => {
    try {
      // 1. Pending Approvals - admin uses profiles view (security_invoker=true, RLS-protected)
      const { data: pendingProfiles, error: pendingError } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          first_name,
          last_name,
          full_name,
          status,
          created_at
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(5);

      if (pendingError) throw pendingError;

      // 2. Legal Issues (form_submissions where legal docs not accepted)
      const { data: legalIssues, error: legalError } = await supabase
        .from('form_submissions')
        .select(`
          id,
          user_id,
          first_name,
          last_name,
          email,
          agreed_terms,
          agreed_privacy,
          agreed_refund_policy,
          agreed_intellectual_property,
          agreed_medical_disclaimer,
          created_at
        `)
        .or('agreed_terms.eq.false,agreed_privacy.eq.false,agreed_refund_policy.eq.false,agreed_intellectual_property.eq.false,agreed_medical_disclaimer.eq.false')
        .order('created_at', { ascending: true })
        .limit(5);

      if (legalError) throw legalError;

      // 3. Payment Problems (failed or overdue)
      const now = new Date();
      const { data: paymentProblems, error: paymentError } = await supabase
        .from('subscriptions')
        .select(`
          id,
          user_id,
          status,
          payment_failed_at,
          next_billing_date,
          profiles!inner(email, first_name, last_name, full_name)
        `)
        .not('payment_failed_at', 'is', null)
        .order('payment_failed_at', { ascending: false })
        .limit(5);

      if (paymentError) throw paymentError;

      // 4. Upcoming Renewals (within 7 days)
      const sevenDaysFromNow = addDays(now, 7);
      const { data: upcomingRenewals, error: renewalsError } = await supabase
        .from('subscriptions')
        .select(`
          id,
          user_id,
          next_billing_date,
          status,
          profiles!inner(email, first_name, last_name, full_name),
          services!inner(name, price_kwd)
        `)
        .eq('status', 'active')
        .not('next_billing_date', 'is', null)
        .gte('next_billing_date', now.toISOString())
        .lte('next_billing_date', sevenDaysFromNow.toISOString())
        .order('next_billing_date', { ascending: true })
        .limit(5);

      if (renewalsError) throw renewalsError;

      setWorkQueue({
        pendingApprovals: pendingProfiles?.map(p => ({
          id: p.id,
          name: p.full_name || `${p.first_name || ''} ${p.last_name || ''}`.trim() || p.email,
          email: p.email,
          subtitle: `Applied ${formatDate(new Date(p.created_at), 'MMM d')}`,
        })) || [],
        legalIssues: legalIssues?.map(l => ({
          id: l.id,
          name: `${l.first_name} ${l.last_name}`.trim() || l.email,
          email: l.email,
          subtitle: getMissingLegalDocs(l),
        })) || [],
        paymentProblems: paymentProblems?.map((p: any) => ({
          id: p.id,
          name: p.profiles?.full_name || `${p.profiles?.first_name || ''} ${p.profiles?.last_name || ''}`.trim() || p.profiles?.email,
          email: p.profiles?.email,
          subtitle: `Failed ${formatDate(new Date(p.payment_failed_at), 'MMM d')}`,
        })) || [],
        upcomingRenewals: upcomingRenewals?.map((r: any) => ({
          id: r.id,
          name: r.profiles?.full_name || `${r.profiles?.first_name || ''} ${r.profiles?.last_name || ''}`.trim() || r.profiles?.email,
          email: r.profiles?.email,
          subtitle: `Renews ${formatDate(new Date(r.next_billing_date), 'MMM d')} - ${r.services?.price_kwd} KWD`,
        })) || [],
      });
    } catch (error: any) {
      console.error('Error fetching work queue:', error);
      toast({
        title: "Error loading work queue",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const getMissingLegalDocs = (submission: any) => {
    const missing = [];
    if (!submission.agreed_terms) missing.push('T&C');
    if (!submission.agreed_privacy) missing.push('Privacy');
    if (!submission.agreed_refund_policy) missing.push('Refund');
    if (!submission.agreed_intellectual_property) missing.push('IP');
    if (!submission.agreed_medical_disclaimer) missing.push('Medical');
    return `Missing: ${missing.join(', ')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-[#E11D2E]" />
      </div>
    );
  }

  return (
    <>
      {/* KPI Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="New Signups"
          value={metrics.newSignups.value.toString()}
          change={metrics.newSignups.changePercent}
          changeType={metrics.newSignups.change >= 0 ? "positive" : "negative"}
          icon={Users}
          subtitle="This month"
        />
        <KPICard
          title="Active Subscriptions"
          value={metrics.activeSubscriptions.value.toString()}
          change={metrics.activeSubscriptions.changePercent}
          changeType={metrics.activeSubscriptions.change >= 0 ? "positive" : "negative"}
          icon={TrendingUp}
          subtitle="Total active"
        />
        <KPICard
          title="MRR"
          value={`${metrics.mrr.value.toLocaleString()} KWD`}
          change={metrics.mrr.changePercent}
          changeType={metrics.mrr.change >= 0 ? "positive" : "negative"}
          icon={DollarSign}
          subtitle="Monthly recurring"
        />
        <KPICard
          title="Payment Issues"
          value={metrics.paymentIssues.value.toString()}
          change={metrics.paymentIssues.value > 0 ? `${metrics.paymentIssues.value} issues` : "None"}
          changeType={metrics.paymentIssues.value > 0 ? "negative" : "neutral"}
          icon={AlertTriangle}
          subtitle="Failed/Overdue"
        />
      </div>

      {/* System Health Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <SystemHealthCard />
        </div>
      </div>

      {/* Client Pipeline & Stuck Clients Section */}
      <ClientPipelineSection />

      {/* Work Queue Section */}
      <div>
        <h2 className="text-lg font-semibold text-[#0F1720] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
          Work Queue
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WorkQueueCard 
            title="Pending Approvals" 
            count={workQueue.pendingApprovals.length} 
            items={workQueue.pendingApprovals}
            onItemClick={(id) => navigate(`/dashboard/clients`)}
            onViewAll={() => navigate(`/dashboard/clients`)}
          />
          <WorkQueueCard 
            title="Legal Not Accepted" 
            count={workQueue.legalIssues.length} 
            items={workQueue.legalIssues}
            onItemClick={(id) => navigate(`/dashboard/clients`)}
            onViewAll={() => navigate(`/dashboard/clients`)}
          />
          <WorkQueueCard 
            title="Payment Issues" 
            count={workQueue.paymentProblems.length} 
            items={workQueue.paymentProblems}
            onItemClick={(id) => navigate(`/dashboard/clients`)}
            onViewAll={() => navigate(`/dashboard/clients`)}
          />
          <WorkQueueCard 
            title="Renewals in 7 Days" 
            count={workQueue.upcomingRenewals.length} 
            items={workQueue.upcomingRenewals}
            onItemClick={(id) => navigate(`/dashboard/clients`)}
            onViewAll={() => navigate(`/dashboard/clients`)}
          />
        </div>
      </div>
    </>
  );
}

function CoachDashboardContent({ dateRange }: { dateRange: { from: Date; to: Date } }) {
  return (
    <>
      {/* Coach KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="My Clients"
          value="28"
          subtitle="Total assigned"
          icon={Users}
        />
        <KPICard
          title="Pending Check-ins"
          value="5"
          subtitle="Awaiting review"
          icon={TrendingUp}
        />
        <KPICard
          title="Program Updates"
          value="3"
          subtitle="Need attention"
          icon={AlertTriangle}
        />
        <KPICard
          title="Recent Messages"
          value="12"
          subtitle="Unread"
          icon={Bell}
        />
      </div>

      {/* Coach Work Queue */}
      <div>
        <h2 className="text-lg font-semibold text-[#0F1720] mb-4" style={{ fontFamily: 'Sora, sans-serif' }}>
          Today's Tasks
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <WorkQueueCard title="My Clients Today" count={8} items={[]} />
          <WorkQueueCard title="Pending Check-ins" count={5} items={[]} />
          <WorkQueueCard title="Program Updates Needed" count={3} items={[]} />
          <WorkQueueCard title="Recent Messages" count={12} items={[]} />
        </div>
      </div>
    </>
  );
}

interface KPICardProps {
  title: string;
  value: string;
  change?: string;
  changeType?: "positive" | "negative" | "neutral";
  icon: React.ElementType;
  subtitle: string;
}

function KPICard({ title, value, change, changeType, icon: Icon, subtitle }: KPICardProps) {
  return (
    <Card 
      className="bg-white border-[#E8EBF0] hover:shadow-lg transition-all cursor-pointer group"
      style={{ borderRadius: '12px' }}
    >
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-sm font-medium text-[#6B7280]">{title}</p>
          <Icon className="h-5 w-5 text-[#6B7280] group-hover:text-[#E11D2E] transition-colors" />
        </div>
        <div className="space-y-1">
          <p className="text-3xl font-bold text-[#0F1720]" style={{ fontFamily: 'Sora, sans-serif' }}>
            {value}
          </p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-[#6B7280]">{subtitle}</p>
            {change && (
              <Badge 
                variant="outline" 
                className={`text-xs ${
                  changeType === "positive" ? "text-[#16A34A] border-[#16A34A]" : 
                  changeType === "negative" ? "text-[#EF4444] border-[#EF4444]" : 
                  "text-[#6B7280] border-[#6B7280]"
                }`}
              >
                {change}
              </Badge>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface WorkQueueCardProps {
  title: string;
  count: number;
  items: any[];
  onItemClick?: (id: string) => void;
  onViewAll?: () => void;
}

function WorkQueueCard({ title, count, items, onItemClick, onViewAll }: WorkQueueCardProps) {
  return (
    <Card className="bg-white border-[#E8EBF0]" style={{ borderRadius: '12px' }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base" style={{ fontFamily: 'Sora, sans-serif' }}>
            {title}
          </CardTitle>
          <Badge variant="secondary" className="bg-[#F7F8FA] text-[#0F1720]">
            {count}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-sm text-[#6B7280] text-center py-4">
            No items to display
          </p>
        ) : (
          <div className="space-y-2">
            {items.map((item) => (
              <div 
                key={item.id} 
                onClick={() => onItemClick?.(item.id)}
                className="flex items-center justify-between p-3 hover:bg-[#F7F8FA] rounded-lg cursor-pointer transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[#0F1720] truncate">{item.name}</p>
                  <p className="text-xs text-[#6B7280] truncate">{item.subtitle}</p>
                </div>
                <ChevronRight className="h-4 w-4 text-[#6B7280] group-hover:text-[#E11D2E] flex-shrink-0 ml-2" />
              </div>
            ))}
          </div>
        )}
        {count > 0 && (
          <button 
            onClick={onViewAll}
            className="w-full mt-3 text-sm text-[#E11D2E] hover:underline font-medium transition-all"
          >
            View all ({count})
          </button>
        )}
      </CardContent>
    </Card>
  );
}
