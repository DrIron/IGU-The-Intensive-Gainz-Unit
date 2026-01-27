import { 
  LayoutDashboard, 
  CreditCard, 
  Calculator,
  Dumbbell,
  Apple,
  User,
  Video,
  CalendarDays,
  Calendar,
  History
} from "lucide-react";
import { useNavigate, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";

interface ClientSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  isPendingApproval?: boolean;
  profile?: any;
  subscription?: any;
  sessionBookingEnabled?: boolean;
}

// Menu items with optional paths for route-based navigation
const menuItems = [
  { 
    id: "overview", 
    title: "Overview", 
    icon: LayoutDashboard,
    group: "main",
    path: "/dashboard"
  },
  { 
    id: "subscription", 
    title: "My Subscription", 
    icon: CreditCard,
    group: "main",
    path: "/dashboard?section=subscription"
  },
  { 
    id: "workouts", 
    title: "Today's Workouts", 
    icon: Dumbbell,
    group: "workouts",
    path: "/dashboard"
  },
  { 
    id: "calendar", 
    title: "Workout Calendar", 
    icon: Calendar,
    group: "workouts",
    path: "/client/workout/calendar"
  },
  { 
    id: "history", 
    title: "Exercise History", 
    icon: History,
    group: "workouts",
    path: "/client/workout/history"
  },
  { 
    id: "nutrition", 
    title: "Nutrition & Calculator", 
    icon: Apple,
    group: "tools",
    path: "/nutrition"
  },
  { 
    id: "sessions", 
    title: "Sessions", 
    icon: CalendarDays,
    group: "tools",
    requiresSessionBooking: true,
    path: "/sessions"
  },
  { 
    id: "exercises", 
    title: "Exercise Library", 
    icon: Dumbbell,
    group: "tools",
    path: "/workout-library"
  },
  { 
    id: "educational-videos", 
    title: "Educational Videos", 
    icon: Video,
    group: "tools",
    path: "/educational-videos"
  },
  { 
    id: "profile", 
    title: "Profile", 
    icon: User,
    group: "settings",
    path: "/dashboard?section=profile"
  },
];

const groups = [
  { id: "main", label: "Dashboard" },
  { id: "workouts", label: "Workouts" },
  { id: "tools", label: "Resources" },
  { id: "settings", label: "Settings" },
];

export function ClientSidebar({ activeSection, onSectionChange, isPendingApproval = false, profile, subscription, sessionBookingEnabled = false }: ClientSidebarProps) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();

  // Check if user is active client (for content access)
  const isActiveClient = profile?.status === 'active' && subscription?.status === 'active';

  const handleNavigation = (item: typeof menuItems[0]) => {
    const targetPath = item.path || '/dashboard';
    
    // DEV: Log single navigation trigger
    if (process.env.NODE_ENV === 'development') {
      console.log('[ClientSidebar] Single navigation:', targetPath);
    }
    
    // Single navigation action - navigate first
    navigate(targetPath);
    
    // Close mobile drawer AFTER navigation initiated
    if (isMobile) {
      setOpenMobile(false);
    }
    
    // Update section state (for UI highlighting only, not navigation)
    onSectionChange(item.id);
  };

  // Determine active item from current path - URL is primary source of truth
  const getIsActive = (item: typeof menuItems[0]) => {
    const currentPath = location.pathname;
    const searchParams = new URLSearchParams(location.search);
    const sectionParam = searchParams.get("section");
    
    // Check section param for dashboard sub-sections
    if (sectionParam && item.id === sectionParam) return true;
    
    // Check path matches
    if (item.path) {
      const itemPath = item.path.split("?")[0]; // Remove query params for comparison
      if (currentPath === itemPath) return true;
    }
    
    // Fallback to activeSection prop
    return activeSection === item.id;
  };

  return (
    <Sidebar 
      className={`hidden md:flex ${collapsed ? "w-16 pt-16" : "w-64 pt-16"}`}
      collapsible="icon"
    >
      <SidebarContent>
        {groups.map((group) => {
          const groupItems = menuItems.filter(item => {
            // Hide workout library and educational videos for non-active clients
            if (!isActiveClient && (item.id === 'exercises' || item.id === 'educational-videos')) {
              return false;
            }
            
            // Hide sessions for non-active clients or if session booking is not enabled
            if (item.id === 'sessions' && (!isActiveClient || !sessionBookingEnabled)) {
              return false;
            }
            
            // Hide restricted items when pending approval (legacy check)
            if (isPendingApproval && item.id === 'nutrition') {
              return false;
            }
            
            return item.group === group.id;
          });
          
          // Don't render empty groups
          if (groupItems.length === 0) return null;
          
          return (
            <SidebarGroup key={group.id}>
              {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const isActive = getIsActive(item);
                    
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={() => handleNavigation(item)}
                          className={isActive ? "bg-primary/10 text-primary font-medium" : ""}
                          title={collapsed ? item.title : undefined}
                        >
                          <Icon className="h-4 w-4" />
                          {!collapsed && <span>{item.title}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
