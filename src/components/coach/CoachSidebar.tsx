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
import { GraduationCap, UserCog } from "lucide-react";

interface CoachSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  trainingMode?: boolean;
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

// Training mode sidebar items
const trainingMenuItems = [
  { id: "training", label: "Training", path: "/coach/dashboard", icon: GraduationCap, navOrder: 1 },
  { id: "profile", label: "My Profile", path: "/coach/profile", icon: UserCog, navOrder: 6 },
];

export function CoachSidebar({ activeSection, onSectionChange, trainingMode }: CoachSidebarProps) {
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
  const getIsActive = (item: { id: string; path: string }) => {
    const currentPath = location.pathname;

    // Exact match first
    if (currentPath === item.path) return true;

    // Check if path starts with item path (for nested routes)
    if (item.path !== "/coach/dashboard" && currentPath.startsWith(item.path)) return true;

    // Handle dashboard as default for /coach base path
    if ((item.id === "coach-dashboard" || item.id === "training") && currentPath === "/coach") return true;

    return false;
  };

  // Training mode: show only Training + Profile
  if (trainingMode) {
    return (
      <Sidebar
        className={`hidden md:flex ${collapsed ? "w-16 pt-16" : "w-64 pt-16"}`}
        collapsible="icon"
      >
        <SidebarContent>
          <SidebarGroup>
            {!collapsed && <SidebarGroupLabel>Training</SidebarGroupLabel>}
            <SidebarGroupContent>
              <SidebarMenu>
                {trainingMenuItems.map((item) => {
                  const Icon = item.icon;
                  const isActive = getIsActive(item);
                  return (
                    <SidebarMenuItem key={item.id}>
                      <SidebarMenuButton
                        onClick={() => handleNavigation(item.path)}
                        className={isActive ? "bg-primary/10 text-primary font-medium" : ""}
                        title={collapsed ? item.label : undefined}
                      >
                        <Icon className="h-4 w-4" />
                        {!collapsed && <span>{item.label}</span>}
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
      </Sidebar>
    );
  }

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

/**
 * Get nav items for mobile bottom navigation.
 * Returns simplified list for mobile use.
 * Picks 4 most-used coach items: Dashboard, Clients, Programs, Profile
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getCoachMobileNavItems() {
  const MOBILE_LABELS: Record<string, string> = {
    "coach-dashboard": "Home",
    "coach-clients": "Clients",
    "coach-programs": "Programs",
    "coach-profile": "Profile",
  };
  return menuItems
    .filter(item =>
      ["coach-dashboard", "coach-clients", "coach-programs", "coach-profile"].includes(item.id)
    )
    .map(item => ({
      path: item.path,
      label: MOBILE_LABELS[item.id] ?? item.label,
      icon: item.icon!,
    }));
}
