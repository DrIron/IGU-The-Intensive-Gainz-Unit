import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { CoachDashboardLayout } from "@/components/coach/CoachDashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRoleCache } from "@/hooks/useRoleCache";
import { useAuthSession } from "@/hooks/useAuthSession";

const SECTION_MAP: Record<string, string> = {
  dashboard: "overview",
  overview: "overview",
  clients: "clients",
  "my-clients": "clients",
  teams: "teams",
  sessions: "sessions",
  programs: "programs",
  exercises: "exercises",
  "workout-library": "exercises",
  assignments: "assignments",
  profile: "profile",
};

export default function CoachDashboard() {
  const navigate = useNavigate();
  const { section } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasCoachRole, setHasCoachRole] = useState(false);
  const hasLoadedData = useRef<string | null>(null);

  const { cachedRoles, cachedUserId, setCachedRoles } = useRoleCache();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();

  useDocumentTitle({
    title: "Coach Dashboard | Intensive Gainz Unit",
    description: "Coach management dashboard for IGU.",
  });

  const activeSection = SECTION_MAP[section || "dashboard"] || "overview";

  useEffect(() => {
    if (cachedRoles && cachedRoles.length > 0) {
      setHasCoachRole(cachedRoles.includes('coach'));
    }
  }, [cachedRoles]);

  const loadUserData = useCallback(async () => {
    try {
      // FIX: CACHE-FIRST - Use cached user ID if session isn't ready
      // CRITICAL: If we have cachedUserId, use it IMMEDIATELY without waiting for session
      // This prevents blocking when getSession() hangs
      const userId = cachedUserId || sessionUser?.id;

      if (!userId) {
        // Three sub-paths:
        //  - session still resolving -> stay in loading state (do NOT setLoading(false))
        //  - session resolved with no user -> redirect to /auth + clear loading
        //  - session not loading but somehow no sessionUser either -> same as above
        if (!sessionLoading && !sessionUser) {
          if (import.meta.env.DEV) console.log('[CoachDashboard] No user found (cache empty, session empty), redirecting to auth');
          navigate("/auth");
          setLoading(false);
        } else if (sessionLoading) {
          if (import.meta.env.DEV) console.log('[CoachDashboard] No cache, waiting for session...');
          // Intentionally leave loading=true -- the loading-screen spinner
          // stays up while the session resolves. The safety-net timeout
          // (5s) in the useEffect below bails if this never completes.
        }
        return;
      }

      if (import.meta.env.DEV) console.log('[CoachDashboard] Using userId:', userId, '(from cache:', !!cachedUserId, ')');

      const user = sessionUser || { id: userId, email: null };
      setCurrentUser(user);

      try {
        const rolesPromise = supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Roles query timeout')), 3000)
        );

        const { data: rolesData } = await Promise.race([
          rolesPromise,
          timeoutPromise
        ]) as { data: { role: string }[] | null };

        if (rolesData && rolesData.length > 0) {
          const roles = rolesData.map(r => r.role);
          const isAdmin = roles.includes('admin');
          const isCoach = roles.includes('coach');

          setHasCoachRole(isCoach);
          setCachedRoles(roles, userId);

          if (!isCoach) {
            toast({
              title: "Access Denied",
              description: isAdmin
                ? "Admins must use a separate coach account to access coach features."
                : "You don't have permission to access the coach dashboard.",
              variant: "destructive",
            });
            navigate(isAdmin ? "/admin/dashboard" : "/dashboard");
            return;
          }
        } else if (cachedRoles && !cachedRoles.includes('coach')) {
          navigate("/dashboard");
          return;
        }
      } catch (timeoutErr) {
        if (import.meta.env.DEV) console.warn("[CoachDashboard] Roles query timed out, using cached roles");
        if (cachedRoles && !cachedRoles.includes('coach')) {
          navigate("/dashboard");
          return;
        }
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("[CoachDashboard] Error loading user data:", error);
    }
    // Every path that reaches here has set currentUser + hasCoachRole
    // (or otherwise navigated away). Clearing loading here -- rather than
    // in a `finally` -- means the "still waiting for session" early return
    // can stay in the loading state without flipping into the dashboard
    // render with a null user.
    setLoading(false);
  }, [sessionUser, cachedUserId, sessionLoading, navigate, setCachedRoles, cachedRoles, toast]);

  useEffect(() => {
    // Re-run whenever the (cached user id, session user, session loading)
    // tuple changes. Key the guard on the resolved userId so the effect
    // can retry once a late-arriving session delivers a user -- the old
    // hasLoadedData.current=true short-circuit permanently blocked that
    // retry, leaving the page stuck in loading if the session was slow.
    const userId = cachedUserId || sessionUser?.id || null;
    const key = userId ?? (sessionLoading ? "__waiting__" : "__unauth__");
    if (hasLoadedData.current === key) return;
    hasLoadedData.current = key;

    const timeout = setTimeout(() => {
      setLoading((current) => {
        if (current && import.meta.env.DEV) {
          console.error("[CoachDashboard] Loading timeout - forcing render");
        }
        return false;
      });
    }, 5000);

    loadUserData();

    return () => clearTimeout(timeout);
  }, [loadUserData, cachedUserId, sessionUser, sessionLoading]);

  const handleSectionChange = (newSection: string) => {
    let urlPath = newSection;
    if (newSection === "overview") urlPath = "dashboard";
    if (newSection === "clients") urlPath = "clients";

    const queryString = searchParams.toString();
    const url = `/coach/${urlPath}${queryString ? `?${queryString}` : ''}`;
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
        userRole="coach"
        onSectionChange={handleSectionChange}
        activeSection={activeSection}
      />
      <CoachDashboardLayout
        user={currentUser}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
    </>
  );
}
