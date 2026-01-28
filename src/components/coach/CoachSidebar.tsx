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
import { getCoachNavItems } from "@/lib/routeConfig";

interface CoachSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
}

// Get coach menu items from centralized config
const menuItems = getCoachNavItems();

// Group configuration - separate "main" and "settings" items
const getGroup = (navOrder: number | undefined) => {
  // Profile (navOrder 6) goes in settings, rest in main
  return navOrder === 6 ? "settings" : "main";
};

const groups = [
  { id: "main", label: "Dashboard" },
  { id: "settings", label: "Settings" },
];

export function CoachSidebar({ activeSection, onSectionChange }: CoachSidebarProps) {
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

  // Determine active item from current path - primary source of truth
  const getIsActive = (item: typeof menuItems[0]) => {
    const currentPath = location.pathname;
    
    // Exact match first
    if (currentPath === item.path) return true;
    
    // Check if path starts with item path (for nested routes)
    if (item.path !== "/coach/dashboard" && currentPath.startsWith(item.path)) return true;
    
    // Handle dashboard as default for /coach base path
    if (item.id === "coach-dashboard" && currentPath === "/coach") return true;
    
    return false;
  };

  return (
    <Sidebar 
      className={`hidden md:flex ${collapsed ? "w-16 pt-16" : "w-64 pt-16"}`}
      collapsible="icon"
    >
      <SidebarContent>
        {groups.map((group) => {
          const groupItems = menuItems.filter(item => getGroup(item.navOrder) === group.id);
          
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
                          onClick={() => handleNavigation(item.path)}
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
          );
        })}
      </SidebarContent>
    </Sidebar>
  );
}
