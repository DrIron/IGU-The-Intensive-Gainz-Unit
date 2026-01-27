import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import CoachManagement from "@/components/CoachManagement";
import { AdminClientDirectory } from "@/components/admin/AdminClientDirectory";
import CoachChangeRequests from "@/components/CoachChangeRequests";
import { ServiceConfiguration } from "@/components/ServiceConfiguration";
import { LegalDocumentsManager } from "@/components/LegalDocumentsManager";
import { TeamPlanSettings } from "@/components/TeamPlanSettings";
import TestimonialsManager from "@/components/TestimonialsManager";
import { ContentLibraryPanel } from "@/components/admin/ContentLibraryPanel";
import { DiscountSection } from "@/components/admin/DiscountSection";
import { SystemHealthView } from "@/components/admin/SystemHealthView";
import { PreLaunchValidation } from "@/components/admin/PreLaunchValidation";
import { SecurityChecklist } from "@/components/admin/SecurityChecklist";
import { PHIAccessAuditLog } from "@/components/admin/PHIAccessAuditLog";
import { PricingPayoutsPage } from "@/components/admin/PricingPayoutsPage";
import { AdminBillingManager } from "@/components/admin/AdminBillingManager";
import LaunchTestChecklist from "@/pages/admin/LaunchTestChecklist";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Users, UserCog, TrendingUp, AlertCircle, DollarSign, Activity, UserPen, MessageSquare, Settings, Library } from "lucide-react";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";

const ADMIN_BUILD_VERSION = "Admin build 2025-12-13T10:30";

interface AdminDashboardLayoutProps {
  user: any;
  hasCoachRole?: boolean;
  hasAdminRole?: boolean;
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

export function AdminDashboardLayout({ 
  user, 
  hasCoachRole = false,
  hasAdminRole = false,
  activeSection: externalActiveSection,
  onSectionChange: externalOnSectionChange
}: AdminDashboardLayoutProps) {
  const navigate = useNavigate();
  
  // Derive section from URL path for persistence
  const getSectionFromPath = (): string => {
    const path = window.location.pathname;
    if (path.includes('/admin/clients')) return 'clients';
    if (path.includes('/admin/coaches')) return 'coaches';
    if (path.includes('/admin/billing')) return 'billing';
    if (path.includes('/admin/pricing-payouts') || path.includes('/admin/plans-services')) return 'pricing-payouts';
    if (path.includes('/admin/discount-codes')) return 'discount-codes';
    if (path.includes('/admin/discord-legal')) return 'discord-legal';
    if (path.includes('/admin/exercises')) return 'exercises';
    if (path.includes('/admin/system-health')) return 'system-health';
    return 'dashboard';
  };

  const [internalActiveSection, setInternalActiveSection] = useState(getSectionFromPath());

  const activeSection = externalActiveSection || internalActiveSection;
  const setActiveSection = externalOnSectionChange || setInternalActiveSection;

  const renderContent = () => {
    // Check if navigating to coaches with a specific tab
    const coachesTab = activeSection.startsWith("coaches-tab:") 
      ? activeSection.replace("coaches-tab:", "") 
      : undefined;
    const effectiveSection = coachesTab ? "coaches" : activeSection;

    switch (effectiveSection) {
      // Admin sections
      case "dashboard":
        return <OverviewSection onNavigate={setActiveSection} />;
      case "clients":
        return <AdminClientDirectory />;
      case "coaches":
        return <CoachManagement defaultTab={coachesTab} />;
      case "testimonials":
        return <TestimonialsManager />;
      case "exercises":
      case "content":
      case "educational-videos":
        return <ContentLibraryPanel />;
      case "discount-codes":
        return <DiscountSection />;
      case "billing":
        return <AdminBillingManager />;
      case "pricing-payouts":
      case "plans-services":
        return <PricingPayoutsPage />;
      case "discord-legal":
        return <DiscordLegalSection />;
      case "system-health":
        return <SystemHealthView />;
      case "pre-launch":
        return <PreLaunchValidation />;
      case "security":
        return <SecurityChecklist />;
      case "phi-audit":
        return <PHIAccessAuditLog />;
      case "launch-checklist":
        return <LaunchTestChecklist />;
      
      // Fallback
      default:
        return <OverviewSection onNavigate={setActiveSection} />;
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
        <AdminSidebar 
          activeSection={activeSection} 
          onSectionChange={setActiveSection} 
          hasCoachRole={false}
          hasAdminRole={hasAdminRole}
        />
        
        <main className="flex-1 overflow-auto">
          <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 md:p-6">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div>
                    <h1 className="text-2xl md:text-3xl font-bold truncate">{getPageTitle(activeSection)}</h1>
                    <p className="text-sm text-muted-foreground truncate">
                      {getSectionTitle(activeSection)}
                    </p>
                  </div>
                  <Badge variant="default" className="hidden sm:flex">
                    Admin
                  </Badge>
                </div>
              </div>
            </div>
          </div>
          
          <div className="p-4 md:p-6 pb-8 safe-area-bottom">
            <div className="max-w-7xl mx-auto">
              <AdminErrorBoundary onReset={() => setActiveSection("exercises")}>
                {renderContent()}
              </AdminErrorBoundary>
              <div className="mt-8 text-xs text-muted-foreground text-right">
                {ADMIN_BUILD_VERSION}
              </div>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function getPageTitle(section: string): string {
  // Handle coaches-tab: sections
  if (section.startsWith("coaches-tab:")) {
    return "Coaches";
  }
  
const titles: Record<string, string> = {
    // Admin sections only
    dashboard: "Overview",
    overview: "Overview",
    clients: "Admin Client Directory",
    coaches: "Coaches",
    billing: "Billing Management",
    "pricing-payouts": "Pricing & Payouts",
    testimonials: "Testimonials",
    exercises: "Content Library",
    content: "Content Library",
    "educational-videos": "Content Library",
    "discount-codes": "Discounts & Promotions",
    "plans-services": "Plans & Services",
    "discord-legal": "Discord & Legal",
    "system-health": "System Health",
    "pre-launch": "Pre-Launch Validation",
    security: "Security Checklist",
    "phi-audit": "PHI Access Audit",
    "launch-checklist": "Launch Test Checklist",
    "debug-roles": "Roles Debug",
  };
  return titles[section] || "Admin";
}

function getSectionTitle(section: string): string {
  // Handle coaches-tab: sections
  if (section.startsWith("coaches-tab:")) {
    return "Manage coach accounts, capacity, payments, and applications";
  }
  
const titles: Record<string, string> = {
    // Admin sections only
    dashboard: "System overview and quick stats",
    overview: "System overview and quick stats",
    clients: "Admin-only: View and manage all coaching clients across IGU",
    coaches: "Manage coach accounts, capacity, payments, and applications",
    billing: "Manage client billing, grace periods, and manual payments",
    "pricing-payouts": "Manage service prices, add-ons, and payout rules (single source of truth)",
    testimonials: "Manage client testimonials",
    exercises: "Workout library, educational videos, and playlists",
    content: "Workout library, educational videos, and playlists",
    "educational-videos": "Workout library, educational videos, and playlists",
    "discount-codes": "Analytics and management for discount codes",
    "plans-services": "Manage pricing plans and service configuration",
    "discord-legal": "Discord roles and legal documents",
    "system-health": "Data integrity checks and production monitoring",
    "pre-launch": "Security and functionality validation before going live",
    security: "Security configuration and best practices",
    "phi-audit": "HIPAA compliance: Track all access to protected health information",
    "launch-checklist": "Internal QA tool for verifying end-to-end user flows",
    "debug-roles": "Debug role bootstrapping and role assignments",
  };
  return titles[section] || "Dashboard";
}

function OverviewSection({ onNavigate }: { onNavigate: (section: string) => void }) {
  const navigate = useNavigate();
  const [analytics, setAnalytics] = useState({
    newSignupsThisMonth: 0,
    activeSubscriptions: 0,
    totalMonthlyRevenue: 0,
    pendingCoachApprovals: 0,
    coachChangeRequests: 0,
    newTestimonials: 0,
  });
  const [monthlySignups, setMonthlySignups] = useState<{ month: string; count: number }[]>([]);

  useEffect(() => {
    fetchAnalytics();
    fetchMonthlySignups();
  }, []);

  const fetchAnalytics = async () => {
    try {
      // Get current month signups (excluding payment_exempt users)
      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);

      // Admin uses profiles_public for counts (RLS protected, admin has access)
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles_public")
        .select("id")
        .gte("created_at", startOfMonth.toISOString())
        .eq("payment_exempt", false);

      if (profilesError) throw profilesError;

      // Get active subscriptions (active paying clients only, excluding payment_exempt)
      const { data: subscriptions, error: subsError } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          services (
            price_kwd
          )
        `)
        .eq("status", "active");

      // Filter out payment_exempt users using profiles_public
      const payingSubscriptions = subscriptions?.filter(async (sub: any) => {
        const { data: profile } = await supabase
          .from("profiles_public")
          .select("payment_exempt")
          .eq("id", sub.user_id)
          .single();
        return !profile?.payment_exempt;
      }) || [];

      // Wait for all profile checks to complete - use profiles_public
      const filteredSubs = await Promise.all(
        subscriptions?.map(async (sub: any) => {
          const { data: profile } = await supabase
            .from("profiles_public")
            .select("payment_exempt")
            .eq("id", sub.user_id)
            .single();
          return !profile?.payment_exempt ? sub : null;
        }) || []
      ).then(results => results.filter(Boolean));

      if (subsError) throw subsError;

      // Calculate monthly revenue from active paying subscriptions
      const revenue = filteredSubs.reduce((sum, sub: any) => 
        sum + (sub.services?.price_kwd || 0), 0
      );

      // Get pending coach approvals
      const { data: pendingCoaches, error: coachError } = await supabase
        .from("coaches")
        .select("id")
        .eq("status", "pending");

      if (coachError) throw coachError;

      // Get coach change requests
      const { data: changeRequests, error: requestsError } = await supabase
        .from("coach_change_requests")
        .select("id")
        .eq("status", "pending");

      if (requestsError) throw requestsError;

      // Get new testimonials
      const { data: testimonials, error: testimonialsError } = await supabase
        .from("testimonials")
        .select("id")
        .eq("is_approved", false)
        .eq("is_archived", false);

      if (testimonialsError) throw testimonialsError;

      setAnalytics({
        newSignupsThisMonth: profiles?.length || 0,
        activeSubscriptions: filteredSubs.length,
        totalMonthlyRevenue: revenue,
        pendingCoachApprovals: pendingCoaches?.length || 0,
        coachChangeRequests: changeRequests?.length || 0,
        newTestimonials: testimonials?.length || 0,
      });
    } catch (error) {
      console.error("Error fetching analytics:", error);
    }
  };

  const fetchMonthlySignups = async () => {
    try {
      // Admin uses profiles_public for signup counts
      const { data, error } = await supabase
        .from("profiles_public")
        .select("created_at")
        .eq("payment_exempt", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Group by month
      const monthCounts: { [key: string]: number } = {};
      data?.forEach((profile) => {
        const date = new Date(profile.created_at);
        const monthKey = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthCounts[monthKey] = (monthCounts[monthKey] || 0) + 1;
      });

      // Convert to array and get last 6 months
      const monthsArray = Object.entries(monthCounts)
        .map(([month, count]) => ({ month, count }))
        .slice(0, 6);

      setMonthlySignups(monthsArray);
    } catch (error) {
      console.error("Error fetching monthly signups:", error);
    }
  };

  return (
    <div className="space-y-6">
      {/* Analytics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New Signups This Month</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.newSignupsThisMonth}</div>
            <p className="text-xs text-muted-foreground mt-2">
              {new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Active Subscriptions</CardTitle>
            <Activity className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.activeSubscriptions}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Paying clients
            </p>
          </CardContent>
        </Card>

        <Card className="border-border/50">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Monthly Revenue</CardTitle>
            <DollarSign className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.totalMonthlyRevenue} KWD</div>
            <p className="text-xs text-muted-foreground mt-2">
              Recurring income
            </p>
          </CardContent>
        </Card>

        <Card 
          className="border-border/50 hover:shadow-lg transition-shadow cursor-pointer" 
          onClick={() => onNavigate("coaches-tab:applications")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Pending Coach Approvals</CardTitle>
            <UserCog className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.pendingCoachApprovals}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Click to review
            </p>
          </CardContent>
        </Card>

        <Card 
          className="border-border/50 hover:shadow-lg transition-shadow cursor-pointer" 
          onClick={() => onNavigate("coaches")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Coach Change Requests</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{analytics.coachChangeRequests}</div>
            <p className="text-xs text-muted-foreground mt-2">
              Click to review
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Signups */}
      <Card className="border-border/50">
        <CardHeader>
          <CardTitle className="text-lg">Monthly Signups</CardTitle>
          <CardDescription>New user registrations by month (excluding payment exempt)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {monthlySignups.map((item) => (
              <div key={item.month} className="flex flex-col items-center justify-center p-4 border rounded-lg">
                <span className="text-sm font-medium text-muted-foreground">{item.month}</span>
                <span className="text-2xl font-bold mt-2">{item.count}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card className="border-border/50 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onNavigate("clients")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">All Clients</CardTitle>
            <Users className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">View and manage all client accounts</p>
          </CardContent>
        </Card>

        <Card className="border-border/50 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => onNavigate("coaches")}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Manage Coaches</CardTitle>
            <UserPen className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Manage coaching staff and applications</p>
          </CardContent>
        </Card>

        <Card 
          className="border-border/50 hover:shadow-lg transition-shadow cursor-pointer" 
          onClick={() => onNavigate("testimonials")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New Testimonials</CardTitle>
            <MessageSquare className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Review client testimonials</p>
              {analytics.newTestimonials > 0 && (
                <Badge variant="destructive">{analytics.newTestimonials}</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card 
          className="border-border/50 hover:shadow-lg transition-shadow cursor-pointer" 
          onClick={() => {
            onNavigate("discord-legal");
            // Scroll to team plan section after navigation
            setTimeout(() => {
              document.getElementById('team-plan-registration')?.scrollIntoView({ behavior: 'smooth' });
            }, 100);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Team Plan Settings</CardTitle>
            <Settings className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Configure team program settings</p>
          </CardContent>
        </Card>

        <Card 
          className="border-border/50 hover:shadow-lg transition-shadow cursor-pointer" 
          onClick={() => onNavigate("exercises")}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Exercise Library</CardTitle>
            <Library className="h-5 w-5 text-primary" />
          </CardHeader>
          <CardContent>
            <p className="text-xs text-muted-foreground">Manage workout exercises</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function DiscordLegalSection() {
  return (
    <div className="space-y-8">
      {/* Discord Automation Section */}
      <section id="discord-automation">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Discord Automation</h2>
          <p className="text-sm text-muted-foreground">Configure role IDs and automation for each service.</p>
        </div>
        <ServiceConfiguration />
      </section>

      {/* Legal Documents Section */}
      <section id="legal-documents">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Legal Documents</h2>
          <p className="text-sm text-muted-foreground">Documents clients see and sign during onboarding.</p>
        </div>
        <LegalDocumentsManager />
      </section>

      {/* Team Plan Registration Section */}
      <section id="team-plan-registration">
        <div className="mb-4">
          <h2 className="text-xl font-semibold">Team Plan Registration</h2>
          <p className="text-sm text-muted-foreground">Control registration window and start date for team programs displayed on the home page.</p>
        </div>
        <TeamPlanSettings />
      </section>
    </div>
  );
}
