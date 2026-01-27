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

  const handleNavigation = (path: string, sectionId: string) => {
    // DEV: Log single navigation trigger
    if (process.env.NODE_ENV === 'development') {
      console.log('[AdminSidebar] Single navigation:', path);
    }
    
    // Single navigation action
    navigate(path);
    
    // Close mobile drawer AFTER navigation initiated
    if (isMobile) {
      setOpenMobile(false);
    }
    
    // Update section state (for UI highlighting only, not navigation)
    onSectionChange(sectionId);
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
        {/* Admin Section */}
        {hasAdminRole && (
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
                  
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => handleNavigation(item.path, item.id)}
                        className={isActive ? "bg-primary/10 text-primary font-medium" : ""}
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
        )}

        {/* NOTE: Coach pages removed - STRICT role isolation. Admins must use separate coach account. */}
      </SidebarContent>
    </Sidebar>
  );
}
