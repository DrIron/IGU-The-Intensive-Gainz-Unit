import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams, useLocation, useNavigate, Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { CoachSidebar } from "./CoachSidebar";
import CoachProfile from "@/components/CoachProfile";
import { ExerciseLibrary } from "./ExerciseLibrary";

import { CoachDashboardOverview } from "./CoachDashboardOverview";
import DietitianDashboardOverview from "./DietitianDashboardOverview";
import { CoachMyClientsPage } from "./CoachMyClientsPage";
import { CoachClientsWorkspace } from "./CoachClientsWorkspace";
import DietitianMyClientsPage from "@/pages/coach/DietitianMyClientsPage";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { CoachProgramsPage } from "./programs/CoachProgramsPage";
import { CoachClientDetail } from "./CoachClientDetail";
import { CoachSessions } from "./CoachSessions";
import { MyAssignmentsPanel } from "./MyAssignmentsPanel";
import { CoachTeamsPage } from "./teams";
import { CoachTestimonials } from "./CoachTestimonials";
import { CoachTrainingDashboard } from "@/pages/coach/CoachTrainingDashboard";
import { SectionErrorBoundary } from "@/components/SectionErrorBoundary";
import { supabase } from "@/integrations/supabase/client";

interface CoachDashboardLayoutProps {
  user: any;
  activeSection?: string;
  onSectionChange?: (section: string) => void;
}

export function CoachDashboardLayout({
  user,
  activeSection: externalActiveSection,
  onSectionChange: externalOnSectionChange
}: CoachDashboardLayoutProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const navigate = useNavigate();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [coachStatus, setCoachStatus] = useState<string | null>(null);
  const hasFetchedStatus = useRef(false);

  // Pure dietitian = approved dietitian subrole WITHOUT the coach subrole.
  // Dual-credentialed coach+dietitian users stay on the coach overview --
  // its signals are a superset for them.
  const { isDietitian, approvedSlugs } = useSubrolePermissions(user?.id);
  const isPureDietitian = isDietitian && !approvedSlugs.includes("coach");

  // Fetch coach status to determine if in training mode
  useEffect(() => {
    if (!user?.id || hasFetchedStatus.current) return;
    hasFetchedStatus.current = true;

    supabase
      .from("coaches")
      .select("status")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.status) setCoachStatus(data.status);
      });
  }, [user?.id]);

  const isTrainingMode = coachStatus === "training";

  // Derive active section from URL path for persistence
  const getSectionFromPath = useCallback((): string => {
    const path = location.pathname;
    // Check the more-specific dietitian path BEFORE `/coach/clients` so the
    // substring match doesn't collide. (`/coach/nutrition-clients` does not
    // actually contain `/coach/clients` as a substring, but ordering by
    // specificity keeps the intent obvious.)
    if (path.includes('/coach/nutrition-clients')) return 'nutrition-clients';
    if (path.includes('/coach/clients')) return 'clients';
    if (path.includes('/coach/teams')) return 'teams';
    if (path.includes('/coach/assignments')) return 'assignments';
    if (path.includes('/coach/sessions')) return 'sessions';
    if (path.includes('/coach/programs')) return 'programs';
    if (path.includes('/coach/exercises')) return 'exercises';
    if (path.includes('/coach/testimonials')) return 'testimonials';
    if (path.includes('/coach/profile')) return 'profile';
    return 'overview';
  }, [location.pathname]);

  const [internalActiveSection, setInternalActiveSection] = useState(getSectionFromPath());

  // Sync section with URL path changes
  useEffect(() => {
    setInternalActiveSection(getSectionFromPath());
  }, [getSectionFromPath]);

  const activeSection = externalActiveSection || internalActiveSection;
  const setActiveSection = externalOnSectionChange || setInternalActiveSection;

  const handleNavigateWithFilter = (section: string, filter?: string) => {
    const sectionToPath: Record<string, string> = {
      overview: "/coach",
      clients: "/coach/clients",
      "nutrition-clients": "/coach/nutrition-clients",
      teams: "/coach/teams",
      assignments: "/coach/assignments",
      sessions: "/coach/sessions",
      programs: "/coach/programs",
      exercises: "/coach/exercises",
      testimonials: "/coach/testimonials",
      profile: "/coach/profile",
    };
    const targetPath = sectionToPath[section] ?? "/coach";
    const search = filter ? `?filter=${encodeURIComponent(filter)}` : "";
    navigate(`${targetPath}${search}`);
  };

  const handleViewClientDetail = (clientId: string) => {
    navigate(`/coach/clients/${clientId}`);
  };

  // Kept temporarily; the inline CoachClientDetail render block below becomes
  // dead once every caller navigates. Removal is a follow-up PR.
  const handleBackFromClientDetail = () => {
    setSelectedClientId(null);
  };

  const handleTrainingComplete = useCallback(() => {
    setCoachStatus("active");
  }, []);

  const renderContent = () => {
    // Defensive guard: the parent (CoachDashboard) is supposed to wait for
    // auth to resolve before rendering this layout, but the user prop is
    // typed `any` and there's a real-world race where `loading` flips to
    // false with `currentUser === null` (expired session, failed refresh).
    // Without this branch, every `case` below crashes on `user.id` and the
    // GlobalErrorBoundary swallows the page -- the user lands on "Something
    // went wrong" instead of a login prompt.
    if (!user?.id) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 py-20 text-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
          <div className="space-y-1 max-w-sm">
            <p className="font-medium">Session not available</p>
            <p className="text-sm text-muted-foreground">
              We couldn't load your coach account. Try signing in again.
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link to="/auth">Sign in</Link>
          </Button>
        </div>
      );
    }

    // Training mode: only show training + profile
    if (isTrainingMode) {
      if (activeSection === "profile") {
        return <CoachProfile />;
      }
      return <CoachTrainingDashboard coachUserId={user.id} onTrainingComplete={handleTrainingComplete} />;
    }

    // If viewing client detail
    if (selectedClientId) {
      return <CoachClientDetail clientUserId={selectedClientId} onBack={handleBackFromClientDetail} />;
    }

    switch (activeSection) {
      case "overview":
        return isPureDietitian
          ? <DietitianDashboardOverview userId={user.id} onNavigate={handleNavigateWithFilter} />
          : <CoachDashboardOverview coachUserId={user.id} onNavigate={handleNavigateWithFilter} />;
      case "clients":
        // CO6: master-detail workspace (condensed roster + ClientOverviewPanel).
        // The full Client Queue (Pending/Awaiting/At-Risk + approvals) stays
        // reachable from the workspace via "Full queue" (?view=queue).
        return <CoachClientsWorkspace coachUserId={user.id} />;
      case "nutrition-clients":
        return <DietitianMyClientsPage />;
      case "teams":
        return user && <CoachTeamsPage coachUserId={user.id} />;
      case "assignments":
        return <MyAssignmentsPanel onClientSelect={handleViewClientDetail} />;
      case "sessions":
        return user && <CoachSessions coachUserId={user.id} />;
      case "pending-clients":
      case "pending-approvals":
        // Redirect to clients section with pending filter
        return (
          <CoachMyClientsPage
            coachUserId={user.id}
            onViewClient={handleViewClientDetail}
          />
        );
      case "programs":
        return user && <CoachProgramsPage coachUserId={user.id} />;
      case "exercises":
        return <ExerciseLibrary coachUserId={user.id} />;
      case "testimonials":
        return <CoachTestimonials coachUserId={user.id} />;
      case "profile":
        return <CoachProfile />;
      default:
        return <CoachDashboardOverview coachUserId={user.id} onNavigate={handleNavigateWithFilter} />;
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-background pt-[var(--app-top-offset)]">
        <CoachSidebar activeSection={isTrainingMode ? "training" : activeSection} onSectionChange={setActiveSection} trainingMode={isTrainingMode} />
        
        <main className="flex-1 min-w-0">
          {/* The page header is dead space on a client-detail view (you're
              looking at one client, not browsing). The detail's own breadcrumb
              + identity card carry the context, so suppress it there. */}
          {!/^\/coach\/clients\/[^/]+/.test(location.pathname) &&
            !/^\/coach\/teams\/[^/]+/.test(location.pathname) && (
            <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 md:p-6">
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h1 className="text-2xl md:text-3xl font-bold truncate">{getPageTitle(activeSection)}</h1>
                  <p className="text-sm text-muted-foreground truncate">
                    {getSectionSubtitle(activeSection)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="p-4 md:p-6 pb-24 md:pb-8 safe-area-bottom">
            <div className="max-w-7xl mx-auto">
              <SectionErrorBoundary name="Dashboard">
                {renderContent()}
              </SectionErrorBoundary>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}

function getPageTitle(section: string): string {
  const titles: Record<string, string> = {
    overview: "Dashboard",
    training: "Coach Training",
    clients: "My Clients",
    "nutrition-clients": "Nutrition Clients",
    teams: "My Teams",
    assignments: "My Assignments",
    sessions: "Sessions & Time Slots",
    "pending-clients": "Pending Clients",
    "pending-approvals": "Pending Approvals",
    programs: "Programs",
    exercises: "Exercise Library",
    testimonials: "Testimonials",
    profile: "My Profile",
    "my-documents": "My Documents",
  };
  return titles[section] || "Dashboard";
}

function getSectionSubtitle(section: string): string {
  const titles: Record<string, string> = {
    overview: "Here's what needs attention today",
    training: "Complete required training to activate your account",
    clients: "View and manage all your clients",
    "nutrition-clients": "Clients on whom you hold an active dietitian assignment",
    teams: "Manage your team plans and members",
    assignments: "Clients you're assigned to as a specialist",
    sessions: "Manage your availability and view booked sessions",
    "pending-clients": "Review pending client approvals",
    "pending-approvals": "Review pending client approvals",
    programs: "Your coaching programs",
    exercises: "Browse and search exercises for your programs",
    testimonials: "Choose which client reviews appear on your public profile",
    profile: "View and edit your profile",
    "my-documents": "Upload your documents",
  };
  return titles[section] || "Here's what needs attention today";
}
