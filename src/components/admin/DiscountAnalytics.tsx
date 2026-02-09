import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Loader2, Tag, DollarSign, TrendingDown, Users, Search, Eye, BarChart3, HelpCircle } from "lucide-react";
import { format, subDays, subMonths, startOfMonth, endOfMonth } from "date-fns";
import { cn } from "@/lib/utils";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

interface DiscountCodeSummary {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  duration_type: string | null;
  duration_cycles: number | null;
  is_active: boolean;
  timesUsed: number;
  activeSubscriptions: number;
  totalDiscountGiven: number;
  avgDiscountPerClient: number;
}

interface DiscountDetailData {
  code: DiscountCodeSummary;
  redemptions: Array<{
    id: string;
    user_id: string;
    subscription_id: string;
    created_at: string;
    cycle_number: number;
    amount_before_kwd: number;
    amount_after_kwd: number;
    total_saved_kwd: number;
    status: string;
    userName?: string;
    serviceName?: string;
    subscriptionStatus?: string;
  }>;
  monthlyBreakdown: Array<{
    month: string;
    redemptions: number;
    totalDiscount: number;
    grossRevenue: number;
    netRevenue: number;
  }>;
}

interface KPIData {
  totalCodes: number;
  activeCodes: number;
  exhaustedCodes: number;
  cancelledCodes: number;
  totalDiscountGiven: number;
  grossRevenue: number;
  netRevenue: number;
  activeCodesInUse: number;
}

export function DiscountAnalytics() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<string>("90");
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [sortBy, setSortBy] = useState<string>("totalDiscountGiven");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  
  const [kpiData, setKpiData] = useState<KPIData>({
    totalCodes: 0,
    activeCodes: 0,
    exhaustedCodes: 0,
    cancelledCodes: 0,
    totalDiscountGiven: 0,
    grossRevenue: 0,
    netRevenue: 0,
    activeCodesInUse: 0,
  });
  
  const [discountCodes, setDiscountCodes] = useState<DiscountCodeSummary[]>([]);
  const [selectedCode, setSelectedCode] = useState<DiscountCodeSummary | null>(null);
  const [detailData, setDetailData] = useState<DiscountDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);

  const fetchAnalyticsData = useCallback(async () => {
    const getDateFilter = () => {
      if (dateRange === "all") return null;
      const days = parseInt(dateRange);
      return subDays(new Date(), days);
    };
    try {
      setLoading(true);
      const dateFilter = getDateFilter();

      // 1. Fetch all discount codes
      const { data: codes, error: codesError } = await supabase
        .from('discount_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (codesError) throw codesError;

      // 2. Fetch all redemptions (with optional date filter)
      let redemptionsQuery = supabase
        .from('discount_redemptions')
        .select(`
          id,
          discount_code_id,
          subscription_id,
          user_id,
          total_saved_kwd,
          amount_before_kwd,
          amount_after_kwd,
          status,
          created_at
        `);

      if (dateFilter) {
        redemptionsQuery = redemptionsQuery.gte('created_at', dateFilter.toISOString());
      }

      const { data: redemptions, error: redemptionsError } = await redemptionsQuery;
      if (redemptionsError) throw redemptionsError;

      // 3. Get subscription statuses for active count
      const subscriptionIds = [...new Set(redemptions?.map(r => r.subscription_id) || [])];
      const subscriptionStatuses: Record<string, string> = {};
      
      if (subscriptionIds.length > 0) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('id, status')
          .in('id', subscriptionIds);
        
        subs?.forEach(s => {
          subscriptionStatuses[s.id] = s.status;
        });
      }

      // 4. Build aggregates per code
      const codeAggregates: Record<string, {
        timesUsed: number;
        activeSubscriptions: Set<string>;
        totalDiscountGiven: number;
        uniqueSubscriptions: Set<string>;
      }> = {};

      redemptions?.forEach(r => {
        if (!codeAggregates[r.discount_code_id]) {
          codeAggregates[r.discount_code_id] = {
            timesUsed: 0,
            activeSubscriptions: new Set(),
            totalDiscountGiven: 0,
            uniqueSubscriptions: new Set(),
          };
        }
        const agg = codeAggregates[r.discount_code_id];
        agg.timesUsed++;
        agg.totalDiscountGiven += r.total_saved_kwd || 0;
        agg.uniqueSubscriptions.add(r.subscription_id);
        
        if (subscriptionStatuses[r.subscription_id] === 'active') {
          agg.activeSubscriptions.add(r.subscription_id);
        }
      });

      // 5. Build discount code summaries
      const codeSummaries: DiscountCodeSummary[] = (codes || []).map(code => {
        const agg = codeAggregates[code.id] || {
          timesUsed: 0,
          activeSubscriptions: new Set(),
          totalDiscountGiven: 0,
          uniqueSubscriptions: new Set(),
        };
        
        return {
          id: code.id,
          code: code.code,
          description: code.description,
          discount_type: code.discount_type,
          discount_value: code.discount_value,
          duration_type: code.duration_type,
          duration_cycles: code.duration_cycles,
          is_active: code.is_active,
          timesUsed: agg.uniqueSubscriptions.size,
          activeSubscriptions: agg.activeSubscriptions.size,
          totalDiscountGiven: agg.totalDiscountGiven,
          avgDiscountPerClient: agg.uniqueSubscriptions.size > 0 
            ? agg.totalDiscountGiven / agg.uniqueSubscriptions.size 
            : 0,
        };
      });

      setDiscountCodes(codeSummaries);

      // 6. Calculate KPIs
      const totalDiscountGiven = redemptions?.reduce((sum, r) => sum + (r.total_saved_kwd || 0), 0) || 0;
      const grossRevenue = redemptions?.reduce((sum, r) => sum + (r.amount_before_kwd || 0), 0) || 0;
      const netRevenue = grossRevenue - totalDiscountGiven;
      
      // Count codes with at least 1 redemption in period
      const codesWithRedemptions = new Set(redemptions?.map(r => r.discount_code_id) || []);
      
      setKpiData({
        totalCodes: codes?.length || 0,
        activeCodes: codes?.filter(c => c.is_active).length || 0,
        exhaustedCodes: codes?.filter(c => !c.is_active && c.max_redemptions && 
          codeAggregates[c.id]?.timesUsed >= c.max_redemptions).length || 0,
        cancelledCodes: codes?.filter(c => !c.is_active).length || 0,
        totalDiscountGiven,
        grossRevenue,
        netRevenue,
        activeCodesInUse: codesWithRedemptions.size,
      });

    } catch (error: any) {
      console.error('Error fetching discount analytics:', error);
      toast({
        title: "Error loading analytics",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [dateRange, toast]);

  useEffect(() => {
    fetchAnalyticsData();
  }, [fetchAnalyticsData]);

  const fetchCodeDetails = async (code: DiscountCodeSummary) => {
    try {
      setDetailLoading(true);
      setSelectedCode(code);
      setSheetOpen(true);

      // Fetch all redemptions for this code
      const { data: redemptions, error: redemptionsError } = await supabase
        .from('discount_redemptions')
        .select(`
          id,
          user_id,
          subscription_id,
          created_at,
          cycle_number,
          amount_before_kwd,
          amount_after_kwd,
          total_saved_kwd,
          status
        `)
        .eq('discount_code_id', code.id)
        .order('created_at', { ascending: false });

      if (redemptionsError) throw redemptionsError;

      // Get user and subscription details
      const userIds = [...new Set(redemptions?.map(r => r.user_id) || [])];
      const subscriptionIds = [...new Set(redemptions?.map(r => r.subscription_id) || [])];

      const userNames: Record<string, string> = {};
      const subscriptionDetails: Record<string, { serviceName: string; status: string }> = {};

      if (userIds.length > 0) {
        // Admin: use profiles_public for names + RPC for email
        for (const userId of userIds) {
          const [{ data: pub }, { data: priv }] = await Promise.all([
            supabase.from('profiles_public').select('id, first_name, display_name').eq('id', userId).maybeSingle(),
            supabase.rpc('admin_get_profile_private', { p_user_id: userId })
          ]);
          
          if (pub) {
            const fullName = priv?.[0]?.full_name || pub.display_name || '';
            const lastName = priv?.[0]?.last_name || '';
            const email = priv?.[0]?.email || '';
            userNames[userId] = fullName || `${pub.first_name || ''} ${lastName}`.trim() || email;
          }
        }
      }

      if (subscriptionIds.length > 0) {
        const { data: subs } = await supabase
          .from('subscriptions')
          .select('id, status, services(name)')
          .in('id', subscriptionIds);
        
        subs?.forEach((s: any) => {
          subscriptionDetails[s.id] = {
            serviceName: s.services?.name || 'Unknown',
            status: s.status,
          };
        });
      }

      // Build monthly breakdown
      const monthlyMap: Record<string, {
        redemptions: number;
        totalDiscount: number;
        grossRevenue: number;
      }> = {};

      redemptions?.forEach(r => {
        const month = format(new Date(r.created_at), 'yyyy-MM');
        if (!monthlyMap[month]) {
          monthlyMap[month] = { redemptions: 0, totalDiscount: 0, grossRevenue: 0 };
        }
        monthlyMap[month].redemptions++;
        monthlyMap[month].totalDiscount += r.total_saved_kwd || 0;
        monthlyMap[month].grossRevenue += r.amount_before_kwd || 0;
      });

      const monthlyBreakdown = Object.entries(monthlyMap)
        .map(([month, data]) => ({
          month,
          redemptions: data.redemptions,
          totalDiscount: data.totalDiscount,
          grossRevenue: data.grossRevenue,
          netRevenue: data.grossRevenue - data.totalDiscount,
        }))
        .sort((a, b) => b.month.localeCompare(a.month));

      // Enrich redemptions with user/subscription details
      const enrichedRedemptions = (redemptions || []).map(r => ({
        ...r,
        userName: userNames[r.user_id] || 'Unknown',
        serviceName: subscriptionDetails[r.subscription_id]?.serviceName || 'Unknown',
        subscriptionStatus: subscriptionDetails[r.subscription_id]?.status || 'unknown',
      }));

      setDetailData({
        code,
        redemptions: enrichedRedemptions,
        monthlyBreakdown,
      });

    } catch (error: any) {
      console.error('Error fetching code details:', error);
      toast({
        title: "Error loading details",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setDetailLoading(false);
    }
  };

  const getDurationLabel = (code: DiscountCodeSummary) => {
    if (code.duration_type === "one_time") return "First payment only";
    if (code.duration_type === "lifetime") return "All payments";
    if (code.duration_type === "limited_cycles") return `First ${code.duration_cycles} payments`;
    return "Unknown";
  };

  const getDiscountLabel = (code: DiscountCodeSummary) => {
    if (code.discount_type === "percent") return `${code.discount_value}%`;
    return `${code.discount_value} KWD`;
  };

  // Filter and sort codes
  const filteredCodes = discountCodes
    .filter(code => {
      // Search filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!code.code.toLowerCase().includes(q) && 
            !(code.description || '').toLowerCase().includes(q)) {
          return false;
        }
      }
      // Status filter
      if (statusFilter === "active" && !code.is_active) return false;
      if (statusFilter === "inactive" && code.is_active) return false;
      // Type filter
      if (typeFilter === "percent" && code.discount_type !== "percent") return false;
      if (typeFilter === "fixed" && code.discount_type !== "fixed") return false;
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "totalDiscountGiven":
          comparison = a.totalDiscountGiven - b.totalDiscountGiven;
          break;
        case "timesUsed":
          comparison = a.timesUsed - b.timesUsed;
          break;
        case "code":
          comparison = a.code.localeCompare(b.code);
          break;
        case "is_active":
          comparison = (a.is_active ? 1 : 0) - (b.is_active ? 1 : 0);
          break;
        default:
          comparison = a.totalDiscountGiven - b.totalDiscountGiven;
      }
      return sortOrder === "desc" ? -comparison : comparison;
    });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h2 className="text-2xl font-bold">Discounts & Promotions</h2>
          <p className="text-muted-foreground">Analytics and reporting for discount codes</p>
        </div>
        <Select value={dateRange} onValueChange={setDateRange}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
            <SelectItem value="365">Last 365 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* KPI Cards */}
      <TooltipProvider>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Discount Codes</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p>Total number of discount codes created, including both active and inactive codes.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Tag className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpiData.totalCodes}</div>
              <div className="flex gap-2 mt-1">
                <Badge variant="default" className="text-xs">{kpiData.activeCodes} active</Badge>
                <Badge variant="outline" className="text-xs">{kpiData.cancelledCodes} inactive</Badge>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Discount Given</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p>Total KWD value of all redeemed discounts in the selected period.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <TrendingDown className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600">{kpiData.totalDiscountGiven.toFixed(2)} KWD</div>
              <p className="text-xs text-muted-foreground mt-1">Revenue reduction from discounts</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium text-muted-foreground">Gross vs Net Revenue</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[250px]">
                    <p>Gross = list price of subscriptions with discounts. Net = actual amount collected after discounts for paid subscriptions.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <DollarSign className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross:</span>
                  <span className="font-medium">{kpiData.grossRevenue.toFixed(2)} KWD</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Net:</span>
                  <span className="font-bold text-green-600">{kpiData.netRevenue.toFixed(2)} KWD</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div className="flex items-center gap-1.5">
                <CardTitle className="text-sm font-medium text-muted-foreground">Active Codes in Use</CardTitle>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/60 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[220px]">
                    <p>Number of distinct discount codes that have at least one redemption in the selected period.</p>
                  </TooltipContent>
                </Tooltip>
              </div>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpiData.activeCodesInUse}</div>
              <p className="text-xs text-muted-foreground mt-1">Codes with redemptions in period</p>
            </CardContent>
          </Card>
        </div>
      </TooltipProvider>

      {/* Per-Code Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Discount Code Performance
          </CardTitle>
          <CardDescription>
            Detailed breakdown of each discount code
          </CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by code or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="percent">Percentage</SelectItem>
                <SelectItem value="fixed">Flat Amount</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={setSortBy}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="totalDiscountGiven">Total Discount</SelectItem>
                <SelectItem value="timesUsed">Times Used</SelectItem>
                <SelectItem value="code">Code Name</SelectItem>
                <SelectItem value="is_active">Status</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              onClick={() => setSortOrder(sortOrder === "desc" ? "asc" : "desc")}
              title={sortOrder === "desc" ? "Descending" : "Ascending"}
            >
              {sortOrder === "desc" ? "↓" : "↑"}
            </Button>
          </div>

          {/* Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Code</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-center">Used</TableHead>
                  <TableHead className="text-center">Active Subs</TableHead>
                  <TableHead className="text-right">Total Discount</TableHead>
                  <TableHead className="text-right">Avg/Client</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredCodes.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No discount codes found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredCodes.map(code => (
                    <TableRow key={code.id} className="cursor-pointer hover:bg-muted/50" onClick={() => fetchCodeDetails(code)}>
                      <TableCell>
                        <div>
                          <p className="font-mono font-medium text-primary hover:underline">{code.code}</p>
                          {code.description && (
                            <p className="text-xs text-muted-foreground truncate max-w-[150px]">
                              {code.description}
                            </p>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {code.discount_type === "percent" ? "%" : "KWD"}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-medium">
                        {getDiscountLabel(code)}
                      </TableCell>
                      <TableCell className="text-sm">
                        {getDurationLabel(code)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={code.is_active ? "default" : "secondary"}>
                          {code.is_active ? "Active" : "Inactive"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">{code.timesUsed}</TableCell>
                      <TableCell className="text-center">{code.activeSubscriptions}</TableCell>
                      <TableCell className="text-right font-medium">
                        {code.totalDiscountGiven.toFixed(2)} KWD
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {code.avgDiscountPerClient.toFixed(2)} KWD
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => fetchCodeDetails(code)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Detail Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              {selectedCode?.code}
            </SheetTitle>
            <SheetDescription>
              {selectedCode?.description || "No description"}
            </SheetDescription>
          </SheetHeader>

          {detailLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : detailData ? (
            <div className="space-y-6 mt-6">
              {/* Code Details */}
              <div className="grid grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <p className="text-sm text-muted-foreground">Type & Amount</p>
                  <p className="font-medium">
                    {detailData.code.discount_type === "percent" ? "Percentage" : "Fixed"}: {getDiscountLabel(detailData.code)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Duration</p>
                  <p className="font-medium">{getDurationLabel(detailData.code)}</p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Status</p>
                  <Badge variant={detailData.code.is_active ? "default" : "secondary"}>
                    {detailData.code.is_active ? "Active" : "Inactive"}
                  </Badge>
                </div>
              </div>

              {/* Usage Metrics */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Usage Metrics</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-2xl font-bold">{detailData.redemptions.length}</p>
                    <p className="text-sm text-muted-foreground">Total Redemptions</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{detailData.code.timesUsed}</p>
                    <p className="text-sm text-muted-foreground">Distinct Subscriptions</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">{detailData.code.activeSubscriptions}</p>
                    <p className="text-sm text-muted-foreground">Active Subscriptions</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-amber-600">
                      {detailData.code.totalDiscountGiven.toFixed(2)} KWD
                    </p>
                    <p className="text-sm text-muted-foreground">Total Discount Given</p>
                  </div>
                </CardContent>
              </Card>

              {/* Monthly Breakdown */}
              {detailData.monthlyBreakdown.length > 0 && (
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">Monthly Breakdown</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Month</TableHead>
                          <TableHead className="text-center">Redemptions</TableHead>
                          <TableHead className="text-right">Discount</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Net</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {detailData.monthlyBreakdown.map(mb => (
                          <TableRow key={mb.month}>
                            <TableCell className="font-medium">{mb.month}</TableCell>
                            <TableCell className="text-center">{mb.redemptions}</TableCell>
                            <TableCell className="text-right text-amber-600">
                              {mb.totalDiscount.toFixed(2)} KWD
                            </TableCell>
                            <TableCell className="text-right">
                              {mb.grossRevenue.toFixed(2)} KWD
                            </TableCell>
                            <TableCell className="text-right text-green-600 font-medium">
                              {mb.netRevenue.toFixed(2)} KWD
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}

              {/* Recent Redemptions */}
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Recent Redemptions</CardTitle>
                </CardHeader>
                <CardContent>
                  {detailData.redemptions.length === 0 ? (
                    <p className="text-center py-4 text-muted-foreground">No redemptions found</p>
                  ) : (
                    <div className="space-y-3 max-h-[300px] overflow-y-auto">
                      {detailData.redemptions.slice(0, 20).map(r => (
                        <div 
                          key={r.id} 
                          className="flex items-center justify-between p-3 bg-muted/30 rounded-lg"
                        >
                          <div>
                            <p className="font-medium text-sm">{r.userName}</p>
                            <p className="text-xs text-muted-foreground">
                              {r.serviceName} • Cycle #{r.cycle_number}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-medium text-amber-600">
                              -{r.total_saved_kwd.toFixed(2)} KWD
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(r.created_at), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : null}
        </SheetContent>
      </Sheet>
    </div>
  );
}
