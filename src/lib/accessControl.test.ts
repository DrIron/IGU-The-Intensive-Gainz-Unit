import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isRouteBlocked,
  getPrimaryDashboard,
  hasFeaturePermission,
  getRequiredRoleForRoute,
  BLOCKED_ROUTES,
  ROUTE_PERMISSIONS,
  logAccessViolation,
} from "@/lib/accessControl";

describe("Access Control Matrix", () => {
  describe("isRouteBlocked", () => {
    it("should block admin routes for coaches", () => {
      expect(isRouteBlocked("/admin", "coach")).toBe(true);
      expect(isRouteBlocked("/admin/dashboard", "coach")).toBe(true);
      expect(isRouteBlocked("/admin/clients", "coach")).toBe(true);
      expect(isRouteBlocked("/admin/pricing-payouts", "coach")).toBe(true);
      expect(isRouteBlocked("/admin/system-health", "coach")).toBe(true);
    });

    it("should block coach routes for admins", () => {
      expect(isRouteBlocked("/coach", "admin")).toBe(true);
      expect(isRouteBlocked("/coach/dashboard", "admin")).toBe(true);
      expect(isRouteBlocked("/coach/clients", "admin")).toBe(true);
      expect(isRouteBlocked("/coach/my-clients", "admin")).toBe(true);
    });

    it("should block admin and coach routes for clients", () => {
      expect(isRouteBlocked("/admin", "client")).toBe(true);
      expect(isRouteBlocked("/admin/dashboard", "client")).toBe(true);
      expect(isRouteBlocked("/coach", "client")).toBe(true);
      expect(isRouteBlocked("/coach/dashboard", "client")).toBe(true);
    });

    it("should NOT block client routes for clients", () => {
      expect(isRouteBlocked("/dashboard", "client")).toBe(false);
      expect(isRouteBlocked("/billing/pay", "client")).toBe(false);
      expect(isRouteBlocked("/account", "client")).toBe(false);
    });

    it("should handle nested routes correctly", () => {
      expect(isRouteBlocked("/admin/clients/123", "coach")).toBe(true);
      expect(isRouteBlocked("/coach/clients/456", "admin")).toBe(true);
    });
  });

  describe("getPrimaryDashboard", () => {
    it("should return correct dashboard for each role", () => {
      expect(getPrimaryDashboard("admin")).toBe("/admin/dashboard");
      expect(getPrimaryDashboard("coach")).toBe("/coach/dashboard");
      expect(getPrimaryDashboard("client")).toBe("/dashboard");
    });
  });

  describe("hasFeaturePermission", () => {
    it("should allow admins to view PHI", () => {
      expect(hasFeaturePermission("viewPHI", "admin")).toBe(true);
    });

    it("should NOT allow coaches to view PHI", () => {
      expect(hasFeaturePermission("viewPHI", "coach")).toBe(false);
    });

    it("should NOT allow clients to view PHI", () => {
      expect(hasFeaturePermission("viewPHI", "client")).toBe(false);
    });

    it("should allow both admin and coach to view assigned clients", () => {
      expect(hasFeaturePermission("viewAssignedClients", "admin")).toBe(true);
      expect(hasFeaturePermission("viewAssignedClients", "coach")).toBe(true);
    });

    it("should only allow admins to edit pricing", () => {
      expect(hasFeaturePermission("editPricing", "admin")).toBe(true);
      expect(hasFeaturePermission("editPricing", "coach")).toBe(false);
      expect(hasFeaturePermission("editPricing", "client")).toBe(false);
    });

    it("should only allow admins to view system health", () => {
      expect(hasFeaturePermission("viewSystemHealth", "admin")).toBe(true);
      expect(hasFeaturePermission("viewSystemHealth", "coach")).toBe(false);
      expect(hasFeaturePermission("viewSystemHealth", "client")).toBe(false);
    });
  });

  describe("getRequiredRoleForRoute", () => {
    it("should return admin for admin routes", () => {
      expect(getRequiredRoleForRoute("/admin")).toBe("admin");
      expect(getRequiredRoleForRoute("/admin/dashboard")).toBe("admin");
      expect(getRequiredRoleForRoute("/admin/clients")).toBe("admin");
    });

    it("should return coach for coach routes", () => {
      expect(getRequiredRoleForRoute("/coach")).toBe("coach");
      expect(getRequiredRoleForRoute("/coach/dashboard")).toBe("coach");
      expect(getRequiredRoleForRoute("/coach/clients")).toBe("coach");
    });

    it("should return client for client routes", () => {
      expect(getRequiredRoleForRoute("/dashboard")).toBe("client");
      expect(getRequiredRoleForRoute("/client/dashboard")).toBe("client");
    });
  });

  describe("BLOCKED_ROUTES configuration", () => {
    it("should have admin routes blocked for coaches", () => {
      const coachBlocked = BLOCKED_ROUTES.coach;
      expect(coachBlocked).toContain("/admin");
      expect(coachBlocked).toContain("/admin/dashboard");
      expect(coachBlocked).toContain("/admin/clients");
      expect(coachBlocked).toContain("/admin/pricing-payouts");
    });

    it("should have coach routes blocked for admins", () => {
      const adminBlocked = BLOCKED_ROUTES.admin;
      expect(adminBlocked).toContain("/coach");
      expect(adminBlocked).toContain("/coach/dashboard");
      expect(adminBlocked).toContain("/coach/clients");
    });

    it("should have admin and coach routes blocked for clients", () => {
      const clientBlocked = BLOCKED_ROUTES.client;
      expect(clientBlocked).toContain("/admin");
      expect(clientBlocked).toContain("/coach");
    });
  });

  describe("ROUTE_PERMISSIONS configuration", () => {
    it("should have admin-only routes configured correctly", () => {
      expect(ROUTE_PERMISSIONS["/admin"]).toEqual(["admin"]);
      expect(ROUTE_PERMISSIONS["/admin/dashboard"]).toEqual(["admin"]);
      expect(ROUTE_PERMISSIONS["/admin/system-health"]).toEqual(["admin"]);
    });

    it("should have coach-only routes configured correctly", () => {
      expect(ROUTE_PERMISSIONS["/coach"]).toEqual(["coach"]);
      expect(ROUTE_PERMISSIONS["/coach/dashboard"]).toEqual(["coach"]);
      expect(ROUTE_PERMISSIONS["/coach/clients"]).toEqual(["coach"]);
    });

    it("should have shared routes for multiple roles", () => {
      expect(ROUTE_PERMISSIONS["/account"]).toContain("admin");
      expect(ROUTE_PERMISSIONS["/account"]).toContain("coach");
      expect(ROUTE_PERMISSIONS["/account"]).toContain("client");
    });
  });

  describe("logAccessViolation", () => {
    beforeEach(() => {
      vi.spyOn(console, "error").mockImplementation(() => {});
    });

    it("should log violation details to console", () => {
      const violation = {
        timestamp: new Date("2025-01-01T12:00:00Z"),
        userId: "test-user-123",
        attemptedRole: "admin" as const,
        actualRoles: ["coach" as const],
        route: "/admin/dashboard",
        action: "blocked" as const,
      };

      logAccessViolation(violation);

      expect(console.error).toHaveBeenCalledWith(
        "[ACCESS VIOLATION]",
        expect.objectContaining({
          userId: "test-user-123",
          attemptedRoute: "/admin/dashboard",
          attemptedRole: "admin",
          actualRoles: ["coach"],
          action: "blocked",
        })
      );
    });
  });
});
