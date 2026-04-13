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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { getAdminNavItems } from "@/lib/routeConfig";

interface AdminSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  hasCoachRole?: boolean;
  hasAdminRole?: boolean;
}

// Get admin menu items from centralized config
const adminMenuItems = getAdminNavItems();

export function AdminSidebar({ 
  activeSection, 
  onSectionChange, 
  hasCoachRole = false,
  hasAdminRole = false 
}: AdminSidebarProps) {
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = state === "collapsed";
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigation = (path: string) => {
    navigate(path);
    
    // Close mobile drawer after navigation
    if (isMobile) {
      setOpenMobile(false);
    }
  };

  // Determine active item from current path - URL is primary source of truth
  const getIsActive = (item: typeof adminMenuItems[0]) => {
    const currentPath = location.pathname;
    
    // Exact path match first
    if (currentPath === item.path) return true;
    
    // Check for partial path matches (for nested routes)
    if (item.path !== "/admin/dashboard" && currentPath.startsWith(item.path)) return true;
    
    // Handle dashboard as default for /admin base path
    if (item.id === "admin-dashboard" && currentPath === "/admin") return true;
    
    // Content Library covers multiple paths
    if (item.id === "admin-exercises") {
      return currentPath.includes("/exercises") || 
             currentPath.includes("/content") || 
             currentPath.includes("/educational-videos");
    }
    
    return false;
  };

  return (
    <Sidebar 
      className={`hidden md:flex ${collapsed ? "w-16 pt-16" : "w-64 pt-16"}`}
      collapsible="icon"
    >
      <SidebarContent>
        {/* Admin Section - always shown since this component is only rendered on admin routes */}
        <SidebarGroup>
            {!collapsed && (
              <SidebarGroupLabel className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Admin Pages
              </SidebarGroupLabel>
            )}
            <SidebarGroupContent>
              <SidebarMenu>
                {adminMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = getIsActive(item);

                  const button = (
                    <SidebarMenuButton
                      onClick={() => handleNavigation(item.path)}
                      className={isActive ? "bg-primary/10 text-primary font-medium" : ""}
                    >
                      {Icon && <Icon className="h-4 w-4" />}
                      {!collapsed && <span>{item.label}</span>}
                    </SidebarMenuButton>
                  );

                  return (
                    <SidebarMenuItem key={item.id}>
                      {collapsed ? (
                        <Tooltip delayDuration={0}>
                          <TooltipTrigger asChild>
                            {button}
                          </TooltipTrigger>
                          <TooltipContent side="right" sideOffset={8}>
                            {item.label}
                          </TooltipContent>
                        </Tooltip>
                      ) : (
                        button
                      )}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

        {/* NOTE: Coach pages removed - STRICT role isolation. Admins must use separate coach account. */}
      </SidebarContent>
    </Sidebar>
  );
}

/**
 * Get nav items for mobile bottom navigation.
 * Returns simplified list for mobile use.
 * Picks 4 most-used admin items: Overview, Clients, Coaches, Billing
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getAdminMobileNavItems() {
  const MOBILE_LABELS: Record<string, string> = {
    "admin-dashboard": "Home",
    "admin-clients": "Clients",
    "admin-coaches": "Coaches",
    "admin-billing": "Billing",
  };
  return adminMenuItems
    .filter(item =>
      ["admin-dashboard", "admin-clients", "admin-coaches", "admin-billing"].includes(item.id)
    )
    .map(item => ({
      path: item.path,
      label: MOBILE_LABELS[item.id] ?? item.label,
      icon: item.icon!,
    }));
}
