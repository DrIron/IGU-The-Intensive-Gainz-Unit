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
import { getClientNavItems } from "@/lib/routeConfig";
import { CreditCard, User } from "lucide-react";

interface ClientSidebarProps {
  activeSection?: string;
  onSectionChange?: (section: string) => void;
  isPendingApproval?: boolean;
  profile?: any;
  subscription?: any;
  sessionBookingEnabled?: boolean;
}

// Get nav items from route registry (sorted by navOrder)
const routeNavItems = getClientNavItems();

// Group definitions for organizing nav items
const groups = [
  { id: "main", label: "Dashboard", routeIds: ["client-dashboard"] },
  { id: "nutrition", label: "Nutrition", routeIds: ["nutrition"] },
  { id: "workouts", label: "Workouts", routeIds: ["client-workout-calendar", "client-workout-history", "workout-library"] },
  { id: "resources", label: "Resources", routeIds: ["educational-videos", "sessions"] },
];

export function ClientSidebar({ 
  activeSection, 
  onSectionChange, 
  isPendingApproval = false, 
  profile, 
  subscription, 
  sessionBookingEnabled = false 
}: ClientSidebarProps) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();

  // Check if user is active client (for content access)
  const isActiveClient = profile?.status === 'active' && subscription?.status === 'active';

  const handleNavigation = (path: string) => {
    navigate(path);
    
    // Close mobile drawer after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  // Determine active item from current path - URL is primary source of truth
  const isActive = (path: string) => {
    const currentPath = location.pathname;
    
    // Exact match for dashboard
    if (path === "/dashboard") {
      return currentPath === "/dashboard" || currentPath === "/client/dashboard";
    }
    
    // Prefix match for other routes
    return currentPath === path || currentPath.startsWith(path + "/");
  };

  // Filter nav items based on user status
  const getVisibleItems = () => {
    return routeNavItems.filter(item => {
      // Hide workout library and educational videos for non-active clients
      if (!isActiveClient && (item.id === 'workout-library' || item.id === 'educational-videos')) {
        return false;
      }
      
      // Hide sessions for non-active clients or if session booking is not enabled
      if (item.id === 'sessions' && (!isActiveClient || !sessionBookingEnabled)) {
        return false;
      }
      
      return true;
    });
  };

  const visibleItems = getVisibleItems();

  // Group items by their category
  const getGroupItems = (groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return [];
    
    return visibleItems.filter(item => group.routeIds.includes(item.id));
  };

  return (
    <Sidebar 
      className={`hidden md:flex ${collapsed ? "w-16 pt-16" : "w-64 pt-16"}`}
      collapsible="icon"
    >
      <SidebarContent>
        {groups.map((group) => {
          const groupItems = getGroupItems(group.id);
          
          // Don't render empty groups
          if (groupItems.length === 0) return null;
          
          return (
            <SidebarGroup key={group.id}>
              {!collapsed && <SidebarGroupLabel>{group.label}</SidebarGroupLabel>}
              <SidebarGroupContent>
                <SidebarMenu>
                  {groupItems.map((item) => {
                    const Icon = item.icon;
                    const active = isActive(item.path);
                    
                    return (
                      <SidebarMenuItem key={item.id}>
                        <SidebarMenuButton
                          onClick={() => handleNavigation(item.path)}
                          className={active ? "bg-primary/10 text-primary font-medium" : ""}
                          title={collapsed ? item.label : undefined}
                        >
                          {Icon && <Icon className="h-4 w-4" />}
                          {!collapsed && <span>{item.label}</span>}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          );
        })}
        
        {/* Account section - always visible */}
        <SidebarGroup>
          {!collapsed && <SidebarGroupLabel>Account</SidebarGroupLabel>}
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => handleNavigation("/account")}
                  className={isActive("/account") ? "bg-primary/10 text-primary font-medium" : ""}
                  title={collapsed ? "Account" : undefined}
                >
                  <User className="h-4 w-4" />
                  {!collapsed && <span>Account</span>}
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * Get nav items for mobile bottom navigation.
 * Returns simplified list for mobile use.
 */
export function getClientMobileNavItems() {
  return routeNavItems
    .filter(item => 
      ["client-dashboard", "nutrition", "client-workout-calendar", "workout-library"].includes(item.id)
    )
    .map(item => ({
      path: item.path,
      label: item.label,
      icon: item.icon!,
    }));
}
