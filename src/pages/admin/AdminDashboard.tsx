import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRoleCache } from "@/hooks/useRoleCache";
import { useAuthSession } from "@/hooks/useAuthSession";

// Map URL paths to internal section IDs
const SECTION_MAP: Record<string, string> = {
  dashboard: "dashboard",
  overview: "dashboard",
  clients: "clients",
  coaches: "coaches",
  billing: "billing",
  "pricing-payouts": "pricing-payouts",
  "plans-services": "pricing-payouts",
  "discount-codes": "discount-codes",
  "discord-legal": "discord-legal",
  exercises: "exercises",
  content: "exercises",
  "educational-videos": "exercises",
  "system-health": "system-health",
  testimonials: "testimonials",
  "site-content": "site-content",
  "pre-launch": "pre-launch",
  security: "security",
  "phi-audit": "phi-audit",
};

export default function AdminDashboard() {
  const navigate = useNavigate();
  const { section } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [hasCoachRole, setHasCoachRole] = useState(false);
  const hasLoadedData = useRef(false);

  // FIX: Use cached roles and user from the cache-first auth system
  const { cachedRoles, cachedUserId, setCachedRoles } = useRoleCache();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();

  // CACHE-FIRST: Check cached roles immediately to render sidebar
  useEffect(() => {
    if (cachedRoles && cachedRoles.length > 0) {
      setHasAdminRole(cachedRoles.includes('admin'));
      setHasCoachRole(cachedRoles.includes('coach'));
    }
  }, [cachedRoles]);

  useDocumentTitle({
    title: "Admin Dashboard | Intensive Gainz Unit",
    description: "Admin management dashboard for IGU.",
  });

  // Derive active section from URL path
  const activeSection = SECTION_MAP[section || "dashboard"] || "dashboard";

  const loadUserData = useCallback(async () => {
    try {
      // FIX: CACHE-FIRST - Use cached user ID if session isn't ready
      // CRITICAL: If we have cachedUserId, use it IMMEDIATELY without waiting for session
      // This prevents blocking when getSession() hangs
      const userId = cachedUserId || sessionUser?.id;

      if (!userId) {
        // Only redirect to auth if:
        // 1. No cached user ID AND
        // 2. Session loading is complete AND
        // 3. No session user
        if (!sessionLoading && !sessionUser) {
          console.log('[AdminDashboard] No user found (cache empty, session empty), redirecting to auth');
          navigate("/auth");
        } else if (sessionLoading) {
          console.log('[AdminDashboard] No cache, waiting for session...');
        }
        return;
      }

      console.log('[AdminDashboard] Using userId:', userId, '(from cache:', !!cachedUserId, ')');

      const user = sessionUser || { id: userId, email: null };
      setCurrentUser(user);

      // FIX: Try to fetch roles with timeout, fall back to cache
      try {
        const rolesPromise = supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Roles query timeout')), 3000)
        );

        const { data: rolesData, error: rolesError } = await Promise.race([
          rolesPromise,
          timeoutPromise
        ]) as { data: { role: string }[] | null; error: Error | null };

        if (rolesError) {
          console.warn("[AdminDashboard] Error fetching roles, using cache:", rolesError);
        } else if (rolesData && rolesData.length > 0) {
          const roles = rolesData.map(r => r.role);
          setHasAdminRole(roles.includes('admin'));
          setHasCoachRole(roles.includes('coach'));
          setCachedRoles(roles, userId);
        }
      } catch (timeoutErr) {
        console.warn("[AdminDashboard] Roles query timed out, using cached roles");
      }
    } catch (error: any) {
      console.error("[AdminDashboard] Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  }, [sessionUser, cachedUserId, sessionLoading, navigate, setCachedRoles]);

  useEffect(() => {
    // Prevent infinite loop - only load once
    if (hasLoadedData.current) {
      return;
    }
    hasLoadedData.current = true;

    const timeout = setTimeout(() => {
      if (loading) {
        console.error("[AdminDashboard] Loading timeout - forcing render");
        setLoading(false);
      }
    }, 5000);

    loadUserData();

    return () => clearTimeout(timeout);
  }, [loadUserData, loading]);

  const handleSectionChange = (newSection: string) => {
    const urlPath = newSection === "dashboard" ? "dashboard" : newSection;
    const queryString = searchParams.toString();
    const url = `/admin/${urlPath}${queryString ? `?${queryString}` : ''}`;
    navigate(url, { replace: true });
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <>
      <Navigation
        user={currentUser}
        userRole="admin"
        onSectionChange={handleSectionChange}
        activeSection={activeSection}
      />
      <AdminDashboardLayout
        user={currentUser}
        hasCoachRole={hasCoachRole}
        hasAdminRole={hasAdminRole}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
    </>
  );
}
