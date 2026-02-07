import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import CoachManagement from "@/components/CoachManagement";
import { AdminClientDirectory } from "@/components/admin/AdminClientDirectory";
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
import { Badge } from "@/components/ui/badge";
import { AdminErrorBoundary } from "@/components/admin/AdminErrorBoundary";
import { AdminMetricsCards } from "@/components/admin/AdminMetricsCards";
import { AdminRequiresAttention } from "@/components/admin/AdminRequiresAttention";
import { SubscriptionBreakdown } from "@/components/admin/SubscriptionBreakdown";
import { CoachWorkloadPanel } from "@/components/admin/CoachWorkloadPanel";
import { AdminQuickActions } from "@/components/admin/AdminQuickActions";
import { SiteContentManager } from "@/components/admin/SiteContentManager";
import { SubroleApprovalQueue } from "@/components/admin/SubroleApprovalQueue";

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
      case "site-content":
        return <SiteContentManager />;
      case "subrole-approvals":
        return <SubroleApprovalQueue />;

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
    "site-content": "Site Content",
    "subrole-approvals": "Subrole Approvals",
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
    "site-content": "Manage website content and copywriting",
    "subrole-approvals": "Review and approve practitioner credential requests",
    "debug-roles": "Debug role bootstrapping and role assignments",
  };
  return titles[section] || "Dashboard";
}

function OverviewSection({ onNavigate }: { onNavigate: (section: string) => void }) {
  return (
    <div className="space-y-6">
      {/* Requires Attention - Top Priority */}
      <AdminRequiresAttention />

      {/* Key Metrics */}
      <AdminMetricsCards />

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <SubscriptionBreakdown />
          <AdminQuickActions />
        </div>
        <div className="space-y-6">
          <CoachWorkloadPanel />
        </div>
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
