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
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";
import { GraduationCap, Salad, UserCog } from "lucide-react";

interface CoachSidebarProps {
  activeSection: string;
  onSectionChange: (section: string) => void;
  trainingMode?: boolean;
}

// Get coach menu items from centralized config
const menuItems = getCoachNavItems();

// Synthetic nav entry for dietitians. Not in ROUTE_REGISTRY because its
// visibility is conditional (subrole-gated, not route-gated) -- we inject
// it directly when the viewer holds an approved `dietitian` subrole.
// `navOrder: 2.1` slots it between "My Clients" (2) and "My Teams" (2.5).
const DIETITIAN_NUTRITION_CLIENTS_ITEM = {
  id: "coach-nutrition-clients",
  label: "Nutrition clients",
  path: "/coach/nutrition-clients",
  icon: Salad,
  navOrder: 2.1,
};

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
  const { isDietitian } = useSubrolePermissions();

  // Inject the dietitian-only "Nutrition clients" entry just after "My Clients"
  // when the viewer has an approved dietitian subrole. Sorted by navOrder so
  // the placement is implicit; no re-sort needed below.
  const effectiveMenuItems = isDietitian
    ? [...menuItems, DIETITIAN_NUTRITION_CLIENTS_ITEM].sort(
        (a, b) => (a.navOrder ?? 99) - (b.navOrder ?? 99),
      )
    : menuItems;

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
        className={`hidden md:flex pt-[var(--app-top-offset)] ${collapsed ? "w-16" : "w-64"}`}
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
      className={`hidden md:flex pt-[var(--app-top-offset)] ${collapsed ? "w-16" : "w-64"}`}
      collapsible="icon"
    >
      <SidebarContent>
        {groups.map((group) => {
          const groupItems = effectiveMenuItems.filter(item => getGroup(item.navOrder) === group.id);

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

interface CoachMobileNavOptions {
  /** Viewer has approved `dietitian` subrole. */
  isDietitian?: boolean;
  /** Viewer has approved `coach` subrole. Used together with `isDietitian`
   *  to decide whether the dock is "pure-dietitian" or "dual-credentialed". */
  isCoach?: boolean;
}

/**
 * Get nav items for mobile bottom navigation.
 * Returns simplified list for mobile use.
 *
 * Default (no opts): Dashboard, Clients, Programs, Profile (4 slots).
 *
 * Pure dietitian (`isDietitian && !isCoach`): swap Programs -> Nutrition
 * clients so the most-used dietitian surface is one tap away. The dock
 * stays at 4 slots; "Programs" isn't useful when the viewer can't build
 * workouts anyway.
 *
 * Dual-credentialed (`isDietitian && isCoach`): keep the original 4 items.
 * Adding a 5th slot would crowd the dock past usable density, so the
 * sidebar surfaces "Nutrition clients" instead.
 */
// eslint-disable-next-line react-refresh/only-export-components
export function getCoachMobileNavItems(opts: CoachMobileNavOptions = {}) {
  const { isDietitian = false, isCoach = false } = opts;
  const MOBILE_LABELS: Record<string, string> = {
    "coach-dashboard": "Home",
    "coach-clients": "Clients",
    "coach-programs": "Programs",
    "coach-profile": "Profile",
  };
  const pureDietitian = isDietitian && !isCoach;
  // Pure dietitian: replace Programs with Nutrition clients.
  const baseIds = pureDietitian
    ? ["coach-dashboard", "coach-clients", "coach-profile"]
    : ["coach-dashboard", "coach-clients", "coach-programs", "coach-profile"];
  const items = menuItems
    .filter(item => baseIds.includes(item.id))
    .map(item => ({
      path: item.path,
      label: MOBILE_LABELS[item.id] ?? item.label,
      icon: item.icon!,
    }));

  if (pureDietitian) {
    // Slot Nutrition clients in position 3 (after Clients, before Profile).
    items.splice(2, 0, {
      path: DIETITIAN_NUTRITION_CLIENTS_ITEM.path,
      label: "Nutrition",
      icon: DIETITIAN_NUTRITION_CLIENTS_ITEM.icon,
    });
  }

  return items;
}
