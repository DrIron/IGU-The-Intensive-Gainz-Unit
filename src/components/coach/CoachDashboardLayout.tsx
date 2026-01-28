import { useState, useEffect } from "react";
import { useSearchParams, useLocation } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { CoachSidebar } from "./CoachSidebar";
import CoachProfile from "@/components/CoachProfile";
import { ExerciseLibrary } from "./ExerciseLibrary";

import { CoachDashboardOverview } from "./CoachDashboardOverview";
import { CoachMyClientsPage } from "./CoachMyClientsPage";
import { CoachProgramsPage } from "./programs/CoachProgramsPage";
import { CoachClientDetail } from "./CoachClientDetail";
import { CoachSessions } from "./CoachSessions";
import { MyAssignmentsPanel } from "./MyAssignmentsPanel";

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
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);

  // Derive active section from URL path for persistence
  const getSectionFromPath = (): string => {
    const path = location.pathname;
    if (path.includes('/coach/clients')) return 'clients';
    if (path.includes('/coach/assignments')) return 'assignments';
    if (path.includes('/coach/sessions')) return 'sessions';
    if (path.includes('/coach/programs')) return 'programs';
    if (path.includes('/coach/exercises')) return 'exercises';
    if (path.includes('/coach/profile')) return 'profile';
    return 'overview';
  };

  const [internalActiveSection, setInternalActiveSection] = useState(getSectionFromPath());

  // Sync section with URL path changes
  useEffect(() => {
    setInternalActiveSection(getSectionFromPath());
  }, [location.pathname]);

  const activeSection = externalActiveSection || internalActiveSection;
  const setActiveSection = externalOnSectionChange || setInternalActiveSection;

  const handleNavigateWithFilter = (section: string, filter?: string) => {
    if (section === 'clients') {
      setActiveSection("clients");
      const newParams = new URLSearchParams(searchParams);
      newParams.set('section', 'my-clients');
      if (filter) {
        newParams.set('filter', filter);
      } else {
        newParams.delete('filter');
      }
      setSearchParams(newParams);
    } else {
      setActiveSection(section);
    }
  };

  const handleViewClientDetail = (clientId: string) => {
    setSelectedClientId(clientId);
  };

  const handleBackFromClientDetail = () => {
    setSelectedClientId(null);
  };

  const renderContent = () => {
    // If viewing client detail
    if (selectedClientId) {
      return <CoachClientDetail clientUserId={selectedClientId} onBack={handleBackFromClientDetail} />;
    }

    switch (activeSection) {
      case "overview":
        return <CoachDashboardOverview coachUserId={user.id} onNavigate={handleNavigateWithFilter} />;
      case "clients":
        return (
          <CoachMyClientsPage 
            coachUserId={user.id} 
            onViewClient={handleViewClientDetail}
          />
        );
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
        return <ExerciseLibrary />;
      case "profile":
        return <CoachProfile />;
      default:
        return <CoachDashboardOverview coachUserId={user.id} onNavigate={handleNavigateWithFilter} />;
    }
  };

  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
        <CoachSidebar activeSection={activeSection} onSectionChange={setActiveSection} />
        
        <main className="flex-1 overflow-auto">
          <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 md:p-6">
            <div className="flex items-center gap-4">
              <SidebarTrigger className="md:hidden" />
              <div className="flex-1 min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold truncate">{getPageTitle(activeSection)}</h1>
                <p className="text-sm text-muted-foreground truncate">
                  {getSectionSubtitle(activeSection)}
                </p>
              </div>
            </div>
          </div>
          
          <div className="p-4 md:p-6 pb-8 safe-area-bottom">
            <div className="max-w-7xl mx-auto">
              {renderContent()}
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
    clients: "My Clients",
    assignments: "My Assignments",
    sessions: "Sessions & Time Slots",
    "pending-clients": "Pending Clients",
    "pending-approvals": "Pending Approvals",
    programs: "Programs",
    exercises: "Exercise Library",
    profile: "My Profile",
    "my-documents": "My Documents",
  };
  return titles[section] || "Dashboard";
}

function getSectionSubtitle(section: string): string {
  const titles: Record<string, string> = {
    overview: "Here's what needs attention today",
    clients: "View and manage all your clients",
    assignments: "Clients you're assigned to as a specialist",
    sessions: "Manage your availability and view booked sessions",
    "pending-clients": "Review pending client approvals",
    "pending-approvals": "Review pending client approvals",
    programs: "Your coaching programs",
    exercises: "Browse and search exercises for your programs",
    profile: "View and edit your profile",
    "my-documents": "Upload your documents",
  };
  return titles[section] || "Here's what needs attention today";
}
