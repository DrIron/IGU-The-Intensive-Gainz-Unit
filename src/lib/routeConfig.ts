/**
 * ============================================================================
 * CENTRALIZED ROUTE CONFIGURATION
 * ============================================================================
 * 
 * SINGLE SOURCE OF TRUTH for all app routing.
 * This file drives:
 *   1. Router configuration (App.tsx)
 *   2. Navigation menus (AdminSidebar, CoachSidebar, ClientSidebar)
 *   3. Route guards (RoleProtectedRoute)
 *   4. Diagnostics page (SiteMapDiagnostics)
 * 
 * DO NOT add routes elsewhere. All routing must be defined here.
 * ============================================================================
 */

import { LucideIcon, LayoutDashboard, Users, UserCog, Shield, ShieldCheck, 
  Library, Tag, Activity, CreditCard, Wallet, ClipboardCheck, Bug, 
  Stethoscope, CalendarDays, BookOpen, UsersRound, Dumbbell, Apple, 
  User, Video, Calendar, History, Home } from "lucide-react";
import { Role, getDashboardForRole, isRouteBlocked } from "@/auth/roles";

// Re-export Role as AppRole for backward compatibility
export type AppRole = Role | "authenticated" | "public";
export type LayoutType = "AdminLayout" | "CoachLayout" | "ClientLayout" | "Public";
export type NavGroup = "admin" | "coach" | "client" | null;

export interface RouteConfig {
  /** Unique route identifier */
  id: string;
  /** URL path pattern */
  path: string;
  /** Human-readable label */
  label: string;
  /** Layout wrapper to use */
  layout: LayoutType;
  /** Roles that can access this route */
  requiredRoles: AppRole[];
  /** Navigation group (determines which sidebar shows this item) */
  navGroup: NavGroup;
  /** Whether to show in navigation sidebar */
  showInNav: boolean;
  /** Icon component for nav items */
  icon?: LucideIcon;
  /** Description for diagnostics */
  description?: string;
  /** Feature flag (if any) */
  featureFlag?: string;
  /** Sort order within nav group */
  navOrder?: number;
}

/**
 * MASTER ROUTE REGISTRY
 * All routes must be defined here
 */
export const ROUTE_REGISTRY: RouteConfig[] = [
  // ============================================
  // PUBLIC ROUTES (no auth required)
  // ============================================
  { id: "home", path: "/", label: "Home", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "auth", path: "/auth", label: "Sign In", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "services", path: "/services", label: "Services", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "reset-password", path: "/reset-password", label: "Reset Password", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "calorie-calculator", path: "/calorie-calculator", label: "Calorie Calculator", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "testimonial", path: "/testimonial", label: "Testimonial", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "client-submission", path: "/client-submission/:userId", label: "Client Submission", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "meet-our-team", path: "/meet-our-team", label: "Meet Our Team", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "coach-signup", path: "/coach-signup", label: "Coach Signup", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "coach-password-setup", path: "/coach-password-setup", label: "Coach Password Setup", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "coach-password-set", path: "/coach-password-set", label: "Coach Password Set", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "testimonials-management", path: "/testimonials-management", label: "Testimonials", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: null, showInNav: false },
  { id: "unauthorized", path: "/unauthorized", label: "Unauthorized", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },
  { id: "not-found", path: "*", label: "Not Found", layout: "Public", requiredRoles: ["public"], navGroup: null, showInNav: false },

  // ============================================
  // ADMIN ROUTES (admin role ONLY - coaches BLOCKED)
  // ============================================
  { id: "admin-root", path: "/admin", label: "Admin Dashboard", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: false },
  { id: "admin-dashboard", path: "/admin/dashboard", label: "Overview", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: LayoutDashboard, navOrder: 1 },
  { id: "admin-clients", path: "/admin/clients", label: "Admin Client Directory", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Users, navOrder: 2, description: "Global client list - ADMIN ONLY" },
  { id: "admin-coaches", path: "/admin/coaches", label: "Coaches", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: UserCog, navOrder: 3 },
  { id: "admin-billing", path: "/admin/billing", label: "Billing Management", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: CreditCard, navOrder: 4 },
  { id: "admin-pricing-payouts", path: "/admin/pricing-payouts", label: "Pricing & Payouts", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Wallet, navOrder: 5 },
  { id: "admin-discount-codes", path: "/admin/discount-codes", label: "Discounts & Promotions", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Tag, navOrder: 6 },
  { id: "admin-discord-legal", path: "/admin/discord-legal", label: "Discord & Legal", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Shield, navOrder: 7 },
  { id: "admin-exercises", path: "/admin/exercises", label: "Content Library", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Library, navOrder: 8 },
  { id: "admin-system-health", path: "/admin/system-health", label: "System Health", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Activity, navOrder: 9 },
  { id: "admin-pre-launch", path: "/admin/pre-launch", label: "Pre-Launch Check", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Shield, navOrder: 10 },
  { id: "admin-security", path: "/admin/security", label: "Security Checklist", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: ShieldCheck, navOrder: 11 },
  { id: "admin-phi-audit", path: "/admin/phi-audit", label: "PHI Access Audit", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Shield, navOrder: 12 },
  { id: "admin-launch-checklist", path: "/admin/launch-checklist", label: "Launch Test Checklist", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: ClipboardCheck, navOrder: 13 },
  { id: "admin-debug-roles", path: "/admin/debug/roles", label: "Roles Debug", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Bug, navOrder: 14 },
  { id: "admin-diagnostics-index", path: "/admin/diagnostics", label: "Diagnostics", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: true, icon: Stethoscope, navOrder: 15 },
  { id: "admin-diagnostics-sitemap", path: "/admin/diagnostics/site-map", label: "Site Map Audit", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: false },
  { id: "admin-client-diagnostics", path: "/admin/client-diagnostics", label: "Client Diagnostics", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: false },
  { id: "admin-email-log", path: "/admin/email-log", label: "Email Log", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: false },
  { id: "admin-workout-qa", path: "/admin/workout-qa", label: "Workout Builder QA", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: false },
  { id: "admin-security-checklist", path: "/admin/security-checklist", label: "Security Hardening", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: false },
  { id: "admin-section", path: "/admin/:section", label: "Admin Section", layout: "AdminLayout", requiredRoles: ["admin"], navGroup: "admin", showInNav: false },

  // ============================================
  // COACH ROUTES (coach role ONLY - admins must use separate account)
  // ============================================
  { id: "coach-root", path: "/coach", label: "Coach Dashboard", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: false },
  { id: "coach-dashboard", path: "/coach/dashboard", label: "Dashboard", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: true, icon: LayoutDashboard, navOrder: 1 },
  { id: "coach-clients", path: "/coach/clients", label: "My Clients", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: true, icon: Users, navOrder: 2, description: "Coach's assigned clients only" },
  { id: "coach-assignments", path: "/coach/assignments", label: "My Assignments", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: true, icon: UsersRound, navOrder: 3 },
  { id: "coach-sessions", path: "/coach/sessions", label: "Sessions", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: true, icon: CalendarDays, navOrder: 4 },
  { id: "coach-programs", path: "/coach/programs", label: "Program Library", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: true, icon: BookOpen, navOrder: 5 },
  { id: "coach-exercises", path: "/coach/exercises", label: "Exercise Library", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: true, icon: Dumbbell, navOrder: 5.5 },
  { id: "coach-profile", path: "/coach/profile", label: "My Profile", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: true, icon: UserCog, navOrder: 6 },
  { id: "coach-pending-clients", path: "/coach/pending-clients", label: "Pending Clients", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: false },
  { id: "coach-section", path: "/coach/:section", label: "Coach Section", layout: "CoachLayout", requiredRoles: ["coach"], navGroup: "coach", showInNav: false },

  // ============================================
  // CLIENT ROUTES (authenticated users, no special role)
  // ============================================
  { id: "client-dashboard", path: "/dashboard", label: "Dashboard", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: true, icon: LayoutDashboard, navOrder: 1 },
  { id: "client-root", path: "/client", label: "Client Home", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "client-dashboard-alt", path: "/client/dashboard", label: "Client Dashboard", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "client-workout-session", path: "/client/workout/session/:moduleId", label: "Workout Session", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "client-workout-calendar", path: "/client/workout/calendar", label: "Workout Calendar", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: true, icon: Calendar, navOrder: 3 },
  { id: "client-workout-history", path: "/client/workout/history", label: "Exercise History", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: true, icon: History, navOrder: 4 },
  { id: "account", path: "/account", label: "Account", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "onboarding", path: "/onboarding", label: "Onboarding", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "workout-library", path: "/workout-library", label: "Exercise Library", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: true, icon: Dumbbell, navOrder: 5 },
  { id: "nutrition", path: "/nutrition", label: "Nutrition", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: true, icon: Apple, navOrder: 2 },
  { id: "nutrition-team", path: "/nutrition-team", label: "Team Nutrition", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "nutrition-client", path: "/nutrition-client", label: "Client Nutrition", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "coach-client-nutrition", path: "/coach-client-nutrition", label: "Coach Client Nutrition", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "payment-status", path: "/payment-status", label: "Payment Status", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "payment-return", path: "/payment-return", label: "Payment Return", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "billing-pay", path: "/billing/pay", label: "Billing Payment", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
  { id: "educational-videos", path: "/educational-videos", label: "Educational Videos", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: true, icon: Video, navOrder: 6 },
  { id: "sessions", path: "/sessions", label: "Sessions", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: true, icon: CalendarDays, navOrder: 7 },
  { id: "access-debug", path: "/access-debug", label: "Access Debug", layout: "ClientLayout", requiredRoles: ["authenticated"], navGroup: "client", showInNav: false },
];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get routes for a specific navigation group
 */
export function getNavRoutes(group: NavGroup): RouteConfig[] {
  return ROUTE_REGISTRY
    .filter(r => r.navGroup === group && r.showInNav)
    .sort((a, b) => (a.navOrder || 99) - (b.navOrder || 99));
}

/**
 * Check if a user with given roles can access a route
 */
export function canAccessRoute(routePath: string, userRoles: string[]): boolean {
  // Find matching route config
  const route = ROUTE_REGISTRY.find(r => {
    // Exact match
    if (r.path === routePath) return true;
    // Check if it's a parameterized route (contains :)
    if (r.path.includes(":")) {
      const pattern = r.path.replace(/:[^/]+/g, "[^/]+");
      const regex = new RegExp(`^${pattern}$`);
      return regex.test(routePath);
    }
    return false;
  });

  if (!route) {
    // Check prefix-based access for dynamic admin/coach routes
    if (routePath.startsWith("/admin")) {
      return userRoles.includes("admin");
    }
    if (routePath.startsWith("/coach")) {
      return userRoles.includes("coach");
    }
    return true; // Unknown routes default to accessible
  }

  // Public routes are always accessible
  if (route.requiredRoles.includes("public")) return true;

  // Authenticated routes require any authenticated user
  if (route.requiredRoles.includes("authenticated")) {
    return userRoles.length > 0 || userRoles.includes("client");
  }

  // Check specific role requirements
  return route.requiredRoles.some(required => userRoles.includes(required));
}

/**
 * Check if a route is BLOCKED for a specific role (hard block)
 * Delegates to canonical implementation in @/auth/roles
 */
export function isRouteBlockedForRole(routePath: string, role: AppRole): boolean {
  // For extended roles (authenticated, public), no blocking
  if (role === "authenticated" || role === "public") {
    return false;
  }
  return isRouteBlocked(routePath, role);
}

/**
 * Get the primary dashboard for a role
 * Delegates to canonical implementation in @/auth/roles
 */
export function getPrimaryDashboardForRole(role: AppRole): string {
  if (role === "authenticated" || role === "public") {
    return "/dashboard";
  }
  return getDashboardForRole(role);
}

/**
 * Get redirect destination when access is denied
 */
export function getAccessDeniedRedirect(userRoles: string[]): string {
  if (userRoles.includes("admin")) return "/admin/dashboard";
  if (userRoles.includes("coach")) return "/coach/dashboard";
  return "/dashboard";
}

/**
 * Get all admin nav items for AdminSidebar
 */
export function getAdminNavItems() {
  return getNavRoutes("admin");
}

/**
 * Get all coach nav items for CoachSidebar
 */
export function getCoachNavItems() {
  return getNavRoutes("coach");
}

/**
 * Get all client nav items for ClientSidebar
 */
export function getClientNavItems() {
  return getNavRoutes("client");
}

/**
 * Find route config by path
 */
export function findRouteByPath(path: string): RouteConfig | undefined {
  return ROUTE_REGISTRY.find(r => r.path === path);
}

/**
 * Find route config by id
 */
export function findRouteById(id: string): RouteConfig | undefined {
  return ROUTE_REGISTRY.find(r => r.id === id);
}
