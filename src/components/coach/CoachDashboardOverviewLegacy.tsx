import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, TrendingUp, AlertCircle, Calendar as CalendarIcon, Activity, CheckCircle2, Download, Filter, X, ChevronLeft, ChevronRight, ZoomIn } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { startOfWeek, endOfWeek, startOfMonth, subMonths, subDays, startOfYear, format, isWithinInterval } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from "recharts";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { ChartDrillDown } from "./ChartDrillDown";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { MyCapacityCard } from "./MyCapacityCard";
import jsPDF from "jspdf";
import "jspdf-autotable";

interface CoachMetrics {
  totalClients: number;
  activeClients: number;
  newClientsThisWeek: number;
  pendingApprovals: number;
  clientsNeedingCheckIn: number;
  recentActivity: RecentActivityItem[];
  weightTrends: WeightTrendData[];
  adherenceTrends: AdherenceData[];
  clientActivityTrends: ClientActivityData[];
}

interface WeightTrendData {
  month: string;
  avgWeightLoss: number;
  clientCount: number;
}

interface AdherenceData {
  month: string;
  adherenceRate: number;
}

interface ClientActivityData {
  month: string;
  activeClients: number;
  newClients: number;
}

interface RecentActivityItem {
  id: string;
  type: 'new_client' | 'check_in' | 'approval' | 'nutrition_update';
  clientName: string;
  timestamp: string;
  description: string;
}

interface CoachDashboardOverviewProps {
  coachUserId: string;
  onNavigate?: (section: string) => void;
}

export function CoachDashboardOverview({ coachUserId, onNavigate }: CoachDashboardOverviewProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<CoachMetrics>({
    totalClients: 0,
    activeClients: 0,
    newClientsThisWeek: 0,
    pendingApprovals: 0,
    clientsNeedingCheckIn: 0,
    recentActivity: [],
    weightTrends: [],
    adherenceTrends: [],
    clientActivityTrends: [],
  });

  // Filter state
  const [dateRange, setDateRange] = useState<{ from: Date; to: Date }>({
    from: subMonths(new Date(), 6),
    to: new Date(),
  });
  const [selectedClientId, setSelectedClientId] = useState<string>("all");
  const [clientOptions, setClientOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [showFilters, setShowFilters] = useState(false);
  const isMobile = useIsMobile();

  // Pagination state for Recent Activity
  const [activityLimit, setActivityLimit] = useState(10);

  // Date range popover state
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const handleRangeSelect = (range: { from?: Date; to?: Date } | undefined) => {
    if (!range) return;
    if (range.from && range.to) {
      setDateRange({ from: range.from, to: range.to });
      setDatePickerOpen(false);
    } else if (range.from) {
      setDateRange({ from: range.from, to: dateRange.to });
    }
  };

  // Zoom modal state for mobile
  const [zoomChart, setZoomChart] = useState<{
    isOpen: boolean;
    type: 'weight' | 'adherence' | 'activity' | null;
    title: string;
  }>({
    isOpen: false,
    type: null,
    title: '',
  });

  // Haptic feedback for mobile interactions
  const triggerHaptic = () => {
    if (isMobile && 'vibrate' in navigator) {
      navigator.vibrate(10); // Short 10ms vibration
    }
  };

  // Drill-down state
  const [drillDownOpen, setDrillDownOpen] = useState(false);
  const [drillDownData, setDrillDownData] = useState<{
    title: string;
    month: string;
    clients: Array<{ id: string; name: string; value: number; status?: string }>;
    valueLabel: string;
  }>({
    title: "",
    month: "",
    clients: [],
    valueLabel: "",
  });

  useEffect(() => {
    if (coachUserId) {
      fetchCoachMetrics();
      fetchClientOptions();
    }
  }, [coachUserId, dateRange, selectedClientId]);

  const fetchClientOptions = async () => {
    try {
      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select(`
          user_id,
          profiles!inner(
            id,
            full_name,
            first_name,
            last_name
          )
        `)
        .eq("coach_id", coachUserId);

      if (subscriptions) {
        const clients = subscriptions.map(sub => ({
          id: sub.user_id,
          name: sub.profiles?.full_name || 
            (sub.profiles?.first_name && sub.profiles?.last_name 
              ? `${sub.profiles.first_name} ${sub.profiles.last_name}` 
              : 'Unknown'),
        }));

        // Remove duplicates
        const uniqueClients = clients.filter((client, index, self) =>
          index === self.findIndex(c => c.id === client.id)
        );

        setClientOptions(uniqueClients);
      }
    } catch (error) {
      console.error("Error fetching client options:", error);
    }
  };

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
        from = subMonths(now, 6);
    }
    
    setDateRange({ from, to: now });
    toast({
      title: "Date Range Updated",
      description: `Showing data from ${format(from, "PPP")} to ${format(now, "PPP")}`,
    });
  };

  const fetchCoachMetrics = async () => {
    try {
      setLoading(true);

      // Build client filter
      let clientFilter = selectedClientId !== "all" ? selectedClientId : null;

      // Get all subscriptions for this coach - use profiles_public only (no PII)
      let subscriptionsQuery = supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          status,
          created_at,
          profiles_public!inner(
            id,
            first_name,
            display_name,
            status
          )
        `)
        .eq("coach_id", coachUserId);

      if (clientFilter) {
        subscriptionsQuery = subscriptionsQuery.eq("user_id", clientFilter);
      }

      const { data: allSubscriptions, error: allSubsError } = await subscriptionsQuery;

      if (allSubsError) throw allSubsError;

      const totalClients = allSubscriptions?.length || 0;
      
      // Active clients - must have both subscription.status = 'active' AND profile.status = 'active'
      const activeClients = allSubscriptions?.filter(s => 
        s.status === 'active' && (s.profiles_public as any)?.status === 'active'
      ).length || 0;

      // New clients this week
      const weekStart = startOfWeek(new Date());
      const weekEnd = endOfWeek(new Date());
      const newThisWeek = allSubscriptions?.filter(s => {
        const createdDate = new Date(s.created_at);
        return createdDate >= weekStart && createdDate <= weekEnd;
      }).length || 0;

      // Pending approvals - use profiles_public only (no PII access)
      const { data: pendingData } = await supabase
        .from('subscriptions')
        .select(`
          id,
          user_id,
          service_id,
          created_at,
          profiles_public!inner(first_name, display_name, status),
          services!inner(name, type)
        `)
        .eq('coach_id', coachUserId)
        .eq('status', 'pending')
        .eq('profiles_public.status', 'pending_coach_approval');

      const pendingApprovals = pendingData?.length || 0;

      // Get nutrition phases that need check-ins (active phases with no recent weight logs)
      const { data: nutritionPhases } = await supabase
        .from("nutrition_phases")
        .select(`
          id,
          user_id,
          updated_at,
          profiles_public!inner(first_name, display_name)
        `)
        .eq("coach_id", coachUserId)
        .eq("is_active", true);

      // Count clients who haven't logged weight in the last 7 days
      let clientsNeedingCheckIn = 0;
      if (nutritionPhases && nutritionPhases.length > 0) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        for (const phase of nutritionPhases) {
          const { data: recentLogs } = await supabase
            .from("weight_logs")
            .select("id")
            .eq("phase_id", phase.id)
            .gte("log_date", sevenDaysAgo.toISOString())
            .limit(1);

          if (!recentLogs || recentLogs.length === 0) {
            clientsNeedingCheckIn++;
          }
        }
      }

      // Build recent activity feed
      const recentActivity: RecentActivityItem[] = [];

      // Add pending client approvals (subscriptions with pending status)
      const { data: pendingSubs } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          created_at,
          profiles_public!inner(
            first_name,
            display_name
          ),
          services!inner(
            name
          )
        `)
        .eq("coach_id", coachUserId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(10);

      pendingSubs?.forEach(sub => {
        const clientName = (sub.profiles_public as any)?.display_name || 
          (sub.profiles_public as any)?.first_name || 'Client';
        
        recentActivity.push({
          id: sub.id,
          type: 'approval',
          clientName,
          timestamp: sub.created_at,
          description: `Awaiting approval for ${(sub.services as any)?.name || 'service'}`,
        });
      });

      // Add new clients from this week
      allSubscriptions?.forEach(sub => {
        const createdDate = new Date(sub.created_at);
        if (createdDate >= weekStart && createdDate <= weekEnd && sub.status === 'active') {
          const clientName = (sub.profiles_public as any)?.display_name || 
            (sub.profiles_public as any)?.first_name || 'Client';
          
          recentActivity.push({
            id: sub.id,
            type: 'new_client',
            clientName,
            timestamp: sub.created_at,
            description: 'New client assigned',
          });
        }
      });

      // Get recent nutrition adjustments
      const { data: recentAdjustments } = await supabase
        .from("nutrition_adjustments")
        .select(`
          id,
          created_at,
          status,
          nutrition_phases!inner(
            id,
            user_id,
            profiles!inner(first_name, last_name, full_name)
          )
        `)
        .eq("nutrition_phases.coach_id", coachUserId)
        .order("created_at", { ascending: false })
        .limit(5);

      recentAdjustments?.forEach(adj => {
        const profile = (adj.nutrition_phases as any)?.profiles;
        const clientName = profile?.full_name || 
          (profile?.first_name && profile?.last_name 
            ? `${profile.first_name} ${profile.last_name}` 
            : 'Unknown');
        
        recentActivity.push({
          id: adj.id,
          type: 'nutrition_update',
          clientName,
          timestamp: adj.created_at,
          description: `Nutrition adjustment ${adj.status}`,
        });
      });

      // Sort by timestamp
      recentActivity.sort((a, b) => 
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );

      // Fetch weight trends (based on date range)
      const monthCount = Math.ceil((dateRange.to.getTime() - dateRange.from.getTime()) / (1000 * 60 * 60 * 24 * 30));
      const weightTrends: WeightTrendData[] = [];
      
      for (let i = 0; i < Math.min(monthCount, 12); i++) {
        const monthDate = subMonths(dateRange.to, monthCount - 1 - i);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

        if (monthStart < dateRange.from || monthEnd > dateRange.to) continue;
        
        let weightLogsQuery = supabase
          .from("weight_logs")
          .select(`
            weight_kg,
            log_date,
            nutrition_phases!inner(coach_id, user_id)
          `)
          .eq("nutrition_phases.coach_id", coachUserId)
          .gte("log_date", monthStart.toISOString())
          .lte("log_date", monthEnd.toISOString());

        if (clientFilter) {
          weightLogsQuery = weightLogsQuery.eq("nutrition_phases.user_id", clientFilter);
        }

        const { data: monthWeightLogs } = await weightLogsQuery;

        if (monthWeightLogs && monthWeightLogs.length > 0) {
          // Calculate average weight loss per client
          const clientWeights: Record<string, number[]> = {};
          monthWeightLogs.forEach((log: any) => {
            const userId = log.nutrition_phases.user_id;
            if (!clientWeights[userId]) clientWeights[userId] = [];
            clientWeights[userId].push(log.weight_kg);
          });

          const weightLosses = Object.values(clientWeights).map(weights => {
            if (weights.length < 2) return 0;
            return weights[0] - weights[weights.length - 1];
          });

          weightTrends.push({
            month: format(monthDate, 'MMM'),
            avgWeightLoss: weightLosses.reduce((a, b) => a + b, 0) / weightLosses.length || 0,
            clientCount: Object.keys(clientWeights).length,
          });
        } else {
          weightTrends.push({
            month: format(monthDate, 'MMM'),
            avgWeightLoss: 0,
            clientCount: 0,
          });
        }
      }

      // Fetch adherence trends (based on date range)
      const adherenceTrends: AdherenceData[] = [];
      
      for (let i = 0; i < Math.min(monthCount, 12); i++) {
        const monthDate = subMonths(dateRange.to, monthCount - 1 - i);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

        if (monthStart < dateRange.from || monthEnd > dateRange.to) continue;
        
        let adherenceQuery = supabase
          .from("adherence_logs")
          .select(`
            followed_calories,
            tracked_accurately,
            nutrition_phases!inner(coach_id, user_id)
          `)
          .eq("nutrition_phases.coach_id", coachUserId)
          .gte("created_at", monthStart.toISOString())
          .lte("created_at", monthEnd.toISOString());

        if (clientFilter) {
          adherenceQuery = adherenceQuery.eq("nutrition_phases.user_id", clientFilter);
        }

        const { data: adherenceLogs } = await adherenceQuery;

        if (adherenceLogs && adherenceLogs.length > 0) {
          const adherentCount = adherenceLogs.filter(
            (log: any) => log.followed_calories && log.tracked_accurately
          ).length;
          
          adherenceTrends.push({
            month: format(monthDate, 'MMM'),
            adherenceRate: Math.round((adherentCount / adherenceLogs.length) * 100),
          });
        } else {
          adherenceTrends.push({
            month: format(monthDate, 'MMM'),
            adherenceRate: 0,
          });
        }
      }

      // Client activity trends (based on date range)
      const clientActivityTrends: ClientActivityData[] = [];
      
      for (let i = 0; i < Math.min(monthCount, 12); i++) {
        const monthDate = subMonths(dateRange.to, monthCount - 1 - i);
        const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
        const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

        if (monthStart < dateRange.from || monthEnd > dateRange.to) continue;
        
        const activeInMonth = allSubscriptions?.filter(s => {
          const created = new Date(s.created_at);
          return s.status === 'active' && created <= monthEnd;
        }).length || 0;

        const newInMonth = allSubscriptions?.filter(s => {
          const created = new Date(s.created_at);
          return created >= monthStart && created <= monthEnd;
        }).length || 0;

        clientActivityTrends.push({
          month: format(monthDate, 'MMM'),
          activeClients: activeInMonth,
          newClients: newInMonth,
        });
      }

      setMetrics({
        totalClients,
        activeClients,
        newClientsThisWeek: newThisWeek,
        pendingApprovals,
        clientsNeedingCheckIn,
        recentActivity: recentActivity, // Store full array, not sliced
        weightTrends,
        adherenceTrends,
        clientActivityTrends,
      });

    } catch (error: any) {
      console.error("Error fetching coach metrics:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const KPICard = ({ 
    title, 
    value, 
    subtitle, 
    icon: Icon, 
    trend,
    onClick 
  }: { 
    title: string; 
    value: string | number; 
    subtitle: string; 
    icon: any; 
    trend?: { value: number; isPositive: boolean };
    onClick?: () => void;
  }) => (
    <Card 
      className={onClick ? "cursor-pointer hover:shadow-lg transition-shadow" : ""}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <Icon className="h-4 w-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
          <span>{subtitle}</span>
          {trend && (
            <Badge variant={trend.isPositive ? "default" : "secondary"} className="text-xs">
              {trend.isPositive ? '+' : ''}{trend.value}
            </Badge>
          )}
        </div>
      </CardContent>
    </Card>
  );

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'new_client':
        return <Users className="h-4 w-4 text-primary" />;
      case 'check_in':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'approval':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'nutrition_update':
        return <Activity className="h-4 w-4 text-blue-500" />;
      default:
        return <Activity className="h-4 w-4" />;
    }
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  const handleWeightLossClick = async (data: any) => {
    if (!data || !data.month) return;

    try {
      const monthIndex = metrics.weightTrends.findIndex(t => t.month === data.month);
      if (monthIndex === -1) return;

      const monthDate = subMonths(new Date(), 5 - monthIndex);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      const { data: weightLogs } = await supabase
        .from("weight_logs")
        .select(`
          weight_kg,
          log_date,
          user_id,
          nutrition_phases!inner(coach_id, user_id, profiles!inner(full_name, first_name, last_name))
        `)
        .eq("nutrition_phases.coach_id", coachUserId)
        .gte("log_date", monthStart.toISOString())
        .lte("log_date", monthEnd.toISOString());

      if (weightLogs) {
        const clientWeights: Record<string, { name: string; weights: number[] }> = {};
        
        weightLogs.forEach((log: any) => {
          const userId = log.user_id;
          const profile = log.nutrition_phases?.profiles;
          const name = profile?.full_name || 
            (profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : 'Unknown');
          
          if (!clientWeights[userId]) {
            clientWeights[userId] = { name, weights: [] };
          }
          clientWeights[userId].weights.push(log.weight_kg);
        });

        const clients = Object.entries(clientWeights).map(([id, data]) => ({
          id,
          name: data.name,
          value: data.weights.length >= 2 ? data.weights[0] - data.weights[data.weights.length - 1] : 0,
          status: 'Active',
        }));

        setDrillDownData({
          title: "Weight Loss Details",
          month: data.month,
          clients,
          valueLabel: "kg lost",
        });
        setDrillDownOpen(true);
      }
    } catch (error) {
      console.error("Error fetching drill-down data:", error);
    }
  };

  const handleAdherenceClick = async (data: any) => {
    if (!data || !data.month) return;

    try {
      const monthIndex = metrics.adherenceTrends.findIndex(t => t.month === data.month);
      if (monthIndex === -1) return;

      const monthDate = subMonths(new Date(), 5 - monthIndex);
      const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
      const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);

      const { data: adherenceLogs } = await supabase
        .from("adherence_logs")
        .select(`
          followed_calories,
          tracked_accurately,
          user_id,
          nutrition_phases!inner(coach_id, profiles!inner(full_name, first_name, last_name))
        `)
        .eq("nutrition_phases.coach_id", coachUserId)
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString());

      if (adherenceLogs) {
        const clientAdherence: Record<string, { name: string; total: number; adherent: number }> = {};

        adherenceLogs.forEach((log: any) => {
          const userId = log.user_id;
          const profile = log.nutrition_phases?.profiles;
          const name = profile?.full_name || 
            (profile?.first_name && profile?.last_name ? `${profile.first_name} ${profile.last_name}` : 'Unknown');

          if (!clientAdherence[userId]) {
            clientAdherence[userId] = { name, total: 0, adherent: 0 };
          }
          clientAdherence[userId].total++;
          if (log.followed_calories && log.tracked_accurately) {
            clientAdherence[userId].adherent++;
          }
        });

        const clients = Object.entries(clientAdherence).map(([id, data]) => ({
          id,
          name: data.name,
          value: (data.adherent / data.total) * 100,
          status: `${data.adherent}/${data.total} logs`,
        }));

        setDrillDownData({
          title: "Adherence Details",
          month: data.month,
          clients,
          valueLabel: "% adherent",
        });
        setDrillDownOpen(true);
      }
    } catch (error) {
      console.error("Error fetching drill-down data:", error);
    }
  };

  const exportToCSV = () => {
    const csvData = [
      ["Month", "Avg Weight Loss (kg)", "Adherence Rate (%)", "Active Clients", "New Clients"],
      ...metrics.weightTrends.map((_, index) => [
        metrics.weightTrends[index]?.month || "",
        metrics.weightTrends[index]?.avgWeightLoss.toFixed(2) || "",
        metrics.adherenceTrends[index]?.adherenceRate || "",
        metrics.clientActivityTrends[index]?.activeClients || "",
        metrics.clientActivityTrends[index]?.newClients || "",
      ]),
    ];

    const csvContent = csvData.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `coach-dashboard-${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast({
      title: "Export Complete",
      description: "Chart data exported to CSV successfully.",
    });
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    
    doc.setFontSize(18);
    doc.text("Coach Dashboard Report", 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Generated: ${format(new Date(), "PPP")}`, 14, 30);
    doc.text(`Total Clients: ${metrics.totalClients} | Active: ${metrics.activeClients}`, 14, 37);

    // Weight Loss Table
    doc.setFontSize(14);
    doc.text("Weight Loss Trends", 14, 50);
    
    (doc as any).autoTable({
      startY: 55,
      head: [["Month", "Avg Weight Loss (kg)", "Client Count"]],
      body: metrics.weightTrends.map(t => [t.month, t.avgWeightLoss.toFixed(2), t.clientCount]),
      theme: "grid",
      headStyles: { fillColor: [225, 29, 46] },
    });

    // Adherence Table
    const finalY = (doc as any).lastAutoTable.finalY || 100;
    doc.setFontSize(14);
    doc.text("Adherence Trends", 14, finalY + 10);
    
    (doc as any).autoTable({
      startY: finalY + 15,
      head: [["Month", "Adherence Rate (%)"]],
      body: metrics.adherenceTrends.map(t => [t.month, t.adherenceRate]),
      theme: "grid",
      headStyles: { fillColor: [225, 29, 46] },
    });

    // Client Activity Table
    const finalY2 = (doc as any).lastAutoTable.finalY || 150;
    doc.setFontSize(14);
    doc.text("Client Activity", 14, finalY2 + 10);
    
    (doc as any).autoTable({
      startY: finalY2 + 15,
      head: [["Month", "Active Clients", "New Clients"]],
      body: metrics.clientActivityTrends.map(t => [t.month, t.activeClients, t.newClients]),
      theme: "grid",
      headStyles: { fillColor: [225, 29, 46] },
    });

    doc.save(`coach-dashboard-${format(new Date(), "yyyy-MM-dd")}.pdf`);

    toast({
      title: "Export Complete",
      description: "Dashboard report exported to PDF successfully.",
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 w-full max-w-full overflow-hidden px-2 md:px-0">
      <div>
        <h2 className="text-2xl font-bold" style={{ fontFamily: 'Sora, sans-serif' }}>Coach Dashboard</h2>
        <p className="text-muted-foreground">Overview of your clients and activities</p>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5" />
            Recent Activity
          </CardTitle>
          <CardDescription>
            Latest updates from your clients
          </CardDescription>
        </CardHeader>
        <CardContent>
          {metrics.recentActivity.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>No recent activity</p>
            </div>
          ) : (
            <>
              <div className="space-y-4">
                {metrics.recentActivity.slice(0, activityLimit).map((activity) => (
                  <div key={activity.id} className="flex items-start gap-4 pb-4 border-b last:border-0">
                    <div className="mt-1">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{activity.clientName}</p>
                      <p className="text-sm text-muted-foreground">{activity.description}</p>
                    </div>
                    <div className="text-sm text-muted-foreground whitespace-nowrap">
                      {formatTimestamp(activity.timestamp)}
                    </div>
                  </div>
                ))}
              </div>
              
              {/* Load More Button */}
              {metrics.recentActivity.length > activityLimit && (
                <div className="mt-4 text-center">
                  <Button
                    variant="outline"
                    onClick={() => setActivityLimit(prev => prev + 10)}
                  >
                    Load More ({metrics.recentActivity.length - activityLimit} remaining)
                  </Button>
                </div>
              )}
              
              {/* Show Less Button when expanded */}
              {activityLimit > 10 && metrics.recentActivity.length <= activityLimit && (
                <div className="mt-4 text-center">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setActivityLimit(10)}
                  >
                    Show Less
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <KPICard
          title="Total Clients"
          value={metrics.totalClients}
          subtitle="All assigned clients"
          icon={Users}
          onClick={() => onNavigate?.('my-clients')}
        />
        <KPICard
          title="Active Clients"
          value={metrics.activeClients}
          subtitle="Currently active"
          icon={CheckCircle2}
          trend={{ value: metrics.newClientsThisWeek, isPositive: true }}
          onClick={() => onNavigate?.('my-clients')}
        />
        <KPICard
          title="Pending Approvals"
          value={metrics.pendingApprovals}
          subtitle="Awaiting approval"
          icon={AlertCircle}
          onClick={() => onNavigate?.('my-clients')}
        />
        <KPICard
          title="Need Check-in"
          value={metrics.clientsNeedingCheckIn}
          subtitle="No logs in 7 days"
          icon={Calendar}
          onClick={() => onNavigate?.('client-nutrition')}
        />
      </div>

      {/* My Capacity Card - Full width on mobile, sidebar on desktop */}
      <MyCapacityCard coachUserId={coachUserId} onNavigate={onNavigate} />

      {/* Charts Section */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold">Performance Trends</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
            >
              <Filter className="h-4 w-4 mr-2" />
              {showFilters ? "Hide" : "Show"} Filters
            </Button>
          </div>
          <div className="flex gap-2">
            <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm">
                  <CalendarIcon className="h-4 w-4 mr-2" />
                  {format(dateRange.from, 'MMM d, yyyy')} – {format(dateRange.to, 'MMM d, yyyy')}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 z-50" align="end">
                <Calendar
                  mode="range"
                  selected={dateRange}
                  onSelect={handleRangeSelect}
                  numberOfMonths={isMobile ? 1 : 2}
                  initialFocus
                  className={cn('p-3 pointer-events-auto')}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="sm" onClick={exportToCSV}>
              <Download className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" size="sm" onClick={exportToPDF}>
              <Download className="h-4 w-4 mr-2" />
              Export PDF
            </Button>
          </div>
        </div>


        {/* Charts Section - Mobile Carousel / Desktop Grid */}
        {isMobile ? (
          <Carousel className="w-full">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Performance Trends</h3>
              <div className="flex gap-2">
                <CarouselPrevious className="relative static translate-y-0 h-10 w-10" />
                <CarouselNext className="relative static translate-y-0 h-10 w-10" />
              </div>
            </div>
            <CarouselContent>
              {/* Weight Loss Trends - Mobile */}
              <CarouselItem>
                <Card className="w-full overflow-hidden border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <TrendingUp className="h-5 w-5" />
                          Weight Loss Trends
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Tap data points for details
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          triggerHaptic();
                          setZoomChart({ isOpen: true, type: 'weight', title: 'Weight Loss Trends' });
                        }}
                      >
                        <ZoomIn className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="w-full overflow-hidden pb-6">
                    <ChartContainer
                      config={{
                        avgWeightLoss: {
                          label: "Avg Weight Loss (kg)",
                          color: "hsl(var(--primary))",
                        },
                      }}
                      className="h-[280px] w-full aspect-auto px-2 touch-pan-y"
                    >
                      <LineChart data={metrics.weightTrends} onClick={handleWeightLossClick} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="month" 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Line 
                          type="monotone" 
                          dataKey="avgWeightLoss" 
                          stroke="hsl(var(--primary))" 
                          strokeWidth={3}
                          dot={{ fill: "hsl(var(--primary))", r: 6, cursor: "pointer" }}
                          activeDot={{ r: 8, onClick: triggerHaptic }}
                        />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </CarouselItem>

              {/* Nutrition Adherence - Mobile */}
              <CarouselItem>
                <Card className="w-full overflow-hidden border-2">
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <CheckCircle2 className="h-5 w-5" />
                          Nutrition Adherence
                        </CardTitle>
                        <CardDescription className="text-sm">
                          Tap bars for details
                        </CardDescription>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          triggerHaptic();
                          setZoomChart({ isOpen: true, type: 'adherence', title: 'Nutrition Adherence' });
                        }}
                      >
                        <ZoomIn className="h-5 w-5" />
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="w-full overflow-hidden pb-6">
                    <ChartContainer
                      config={{
                        adherenceRate: {
                          label: "Adherence Rate (%)",
                          color: "hsl(var(--chart-2))",
                        },
                      }}
                      className="h-[280px] w-full aspect-auto px-2 touch-pan-y"
                    >
                      <BarChart data={metrics.adherenceTrends} onClick={handleAdherenceClick} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="month" 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Bar 
                          dataKey="adherenceRate" 
                          fill="hsl(var(--chart-2))" 
                          radius={[8, 8, 0, 0]}
                          cursor="pointer"
                          onClick={triggerHaptic}
                        />
                      </BarChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </CarouselItem>

              {/* Client Activity - Mobile */}
              <CarouselItem>
                <Card className="w-full overflow-hidden border-2">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Users className="h-5 w-5" />
                      Client Activity
                    </CardTitle>
                    <CardDescription className="text-sm">
                      Last 6 months
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="w-full overflow-hidden pb-6">
                    <ChartContainer
                      config={{
                        activeClients: {
                          label: "Active Clients",
                          color: "hsl(var(--chart-1))",
                        },
                        newClients: {
                          label: "New Clients",
                          color: "hsl(var(--chart-3))",
                        },
                      }}
                      className="h-[280px] w-full aspect-auto px-2 touch-pan-y"
                    >
                      <LineChart data={metrics.clientActivityTrends} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis 
                          dataKey="month" 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <YAxis 
                          stroke="hsl(var(--muted-foreground))"
                          tick={{ fontSize: 12 }}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line 
                          type="monotone" 
                          dataKey="activeClients" 
                          stroke="hsl(var(--chart-1))" 
                          strokeWidth={3}
                          dot={{ fill: "hsl(var(--chart-1))", r: 5 }}
                          activeDot={{ r: 7, onClick: triggerHaptic }}
                        />
                        <Line 
                          type="monotone" 
                          dataKey="newClients" 
                          stroke="hsl(var(--chart-3))" 
                          strokeWidth={3}
                          dot={{ fill: "hsl(var(--chart-3))", r: 5 }}
                          activeDot={{ r: 7, onClick: triggerHaptic }}
                        />
                      </LineChart>
                    </ChartContainer>
                  </CardContent>
                </Card>
              </CarouselItem>
            </CarouselContent>
          </Carousel>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full max-w-full overflow-hidden">
              {/* Weight Loss Trends - Desktop */}
              <Card className="cursor-pointer hover:shadow-lg transition-shadow w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Weight Loss Trends
                  </CardTitle>
                  <CardDescription>
                    Average weight loss per client - click data points for details
                  </CardDescription>
                </CardHeader>
                <CardContent className="w-full overflow-hidden">
                  <ChartContainer
                    config={{
                      avgWeightLoss: {
                        label: "Avg Weight Loss (kg)",
                        color: "hsl(var(--primary))",
                      },
                    }}
                    className="h-[300px] w-full aspect-auto px-2"
                  >
                    <LineChart data={metrics.weightTrends} onClick={handleWeightLossClick} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Line 
                        type="monotone" 
                        dataKey="avgWeightLoss" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        dot={{ fill: "hsl(var(--primary))", cursor: "pointer", r: 4 }}
                        activeDot={{ r: 6, onClick: triggerHaptic }}
                      />
                    </LineChart>
                  </ChartContainer>
                </CardContent>
              </Card>

              {/* Adherence Rate - Desktop */}
              <Card className="cursor-pointer hover:shadow-lg transition-shadow w-full overflow-hidden">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Nutrition Adherence
                  </CardTitle>
                  <CardDescription>
                    Client adherence to nutrition plans - click bars for details
                  </CardDescription>
                </CardHeader>
                <CardContent className="w-full overflow-hidden">
                  <ChartContainer
                    config={{
                      adherenceRate: {
                        label: "Adherence Rate (%)",
                        color: "hsl(var(--chart-2))",
                      },
                    }}
                    className="h-[300px] w-full aspect-auto px-2"
                  >
                    <BarChart data={metrics.adherenceTrends} onClick={handleAdherenceClick} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                      <YAxis stroke="hsl(var(--muted-foreground))" />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar 
                        dataKey="adherenceRate" 
                        fill="hsl(var(--chart-2))" 
                        radius={[4, 4, 0, 0]}
                        cursor="pointer"
                        onClick={triggerHaptic}
                      />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>

            {/* Client Activity - Desktop */}
            <Card className="w-full overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5" />
                  Client Activity
                </CardTitle>
                <CardDescription>
                  Active clients and new signups over the last 6 months
                </CardDescription>
              </CardHeader>
              <CardContent className="w-full overflow-hidden">
                <ChartContainer
                  config={{
                    activeClients: {
                      label: "Active Clients",
                      color: "hsl(var(--chart-1))",
                    },
                    newClients: {
                      label: "New Clients",
                      color: "hsl(var(--chart-3))",
                    },
                  }}
                  className="h-[300px] w-full aspect-auto px-2"
                >
                  <LineChart data={metrics.clientActivityTrends} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <Legend />
                    <Line 
                      type="monotone" 
                      dataKey="activeClients" 
                      stroke="hsl(var(--chart-1))" 
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-1))", r: 3 }}
                      activeDot={{ r: 5, onClick: triggerHaptic }}
                    />
                    <Line 
                      type="monotone" 
                      dataKey="newClients" 
                      stroke="hsl(var(--chart-3))" 
                      strokeWidth={2}
                      dot={{ fill: "hsl(var(--chart-3))", r: 3 }}
                      activeDot={{ r: 5, onClick: triggerHaptic }}
                    />
                  </LineChart>
                </ChartContainer>
              </CardContent>
            </Card>
          </>
        )}
      </div>

      {/* Drill-down Dialog */}
      <ChartDrillDown
        isOpen={drillDownOpen}
        onClose={() => setDrillDownOpen(false)}
        title={drillDownData.title}
        month={drillDownData.month}
        clients={drillDownData.clients}
        valueLabel={drillDownData.valueLabel}
      />

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
          <CardDescription>Common tasks and shortcuts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => onNavigate?.('my-clients')}
            >
              <Users className="h-5 w-5" />
              <span>View All Clients</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => onNavigate?.('client-nutrition')}
            >
              <TrendingUp className="h-5 w-5" />
              <span>Manage Nutrition</span>
            </Button>
            <Button
              variant="outline"
              className="h-auto py-4 flex-col gap-2"
              onClick={() => navigate('/workout-library')}
            >
              <Activity className="h-5 w-5" />
              <span>Exercise Library</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Zoom Modal for Mobile Charts */}
      <Dialog open={zoomChart.isOpen} onOpenChange={(open) => setZoomChart({ isOpen: open, type: null, title: '' })}>
        <DialogContent className="max-w-[95vw] max-h-[90vh] p-4">
          <DialogHeader>
            <DialogTitle>{zoomChart.title}</DialogTitle>
          </DialogHeader>
          <div className="w-full overflow-auto">
            {zoomChart.type === 'weight' && (
              <ChartContainer
                config={{
                  avgWeightLoss: {
                    label: "Avg Weight Loss (kg)",
                    color: "hsl(var(--primary))",
                  },
                }}
                className="h-[400px] w-full aspect-auto px-2"
              >
                <LineChart data={metrics.weightTrends} onClick={handleWeightLossClick} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 14 }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 14 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Line 
                    type="monotone" 
                    dataKey="avgWeightLoss" 
                    stroke="hsl(var(--primary))" 
                    strokeWidth={4}
                    dot={{ fill: "hsl(var(--primary))", r: 8, cursor: "pointer" }}
                    activeDot={{ r: 10, onClick: triggerHaptic }}
                  />
                </LineChart>
              </ChartContainer>
            )}
            
            {zoomChart.type === 'adherence' && (
              <ChartContainer
                config={{
                  adherenceRate: {
                    label: "Adherence Rate (%)",
                    color: "hsl(var(--chart-2))",
                  },
                }}
                className="h-[400px] w-full aspect-auto px-2"
              >
                <BarChart data={metrics.adherenceTrends} onClick={handleAdherenceClick} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 14 }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 14 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar 
                    dataKey="adherenceRate" 
                    fill="hsl(var(--chart-2))" 
                    radius={[8, 8, 0, 0]}
                    cursor="pointer"
                    onClick={triggerHaptic}
                  />
                </BarChart>
              </ChartContainer>
            )}
            
            {zoomChart.type === 'activity' && (
              <ChartContainer
                config={{
                  activeClients: {
                    label: "Active Clients",
                    color: "hsl(var(--chart-1))",
                  },
                  newClients: {
                    label: "New Clients",
                    color: "hsl(var(--chart-3))",
                  },
                }}
                className="h-[400px] w-full aspect-auto px-2"
              >
                <LineChart data={metrics.clientActivityTrends} margin={{ top: 8, right: 12, bottom: 12, left: 12 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="month" 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 14 }}
                  />
                  <YAxis 
                    stroke="hsl(var(--muted-foreground))"
                    tick={{ fontSize: 14 }}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Legend wrapperStyle={{ fontSize: '14px' }} />
                  <Line 
                    type="monotone" 
                    dataKey="activeClients" 
                    stroke="hsl(var(--chart-1))" 
                    strokeWidth={4}
                    dot={{ fill: "hsl(var(--chart-1))", r: 6 }}
                    activeDot={{ r: 8, onClick: triggerHaptic }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="newClients" 
                    stroke="hsl(var(--chart-3))" 
                    strokeWidth={4}
                    dot={{ fill: "hsl(var(--chart-3))", r: 6 }}
                    activeDot={{ r: 8, onClick: triggerHaptic }}
                  />
                </LineChart>
              </ChartContainer>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
