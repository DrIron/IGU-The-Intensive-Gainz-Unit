import { useEffect, useState, useCallback } from "react";
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
  sessions: "sessions",
  programs: "programs",
  exercises: "exercises",
  profile: "profile",
  nutrition: "client-nutrition",
  "client-nutrition": "client-nutrition",
};

export default function CoachDashboard() {
  const navigate = useNavigate();
  const { section } = useParams();
  const [searchParams] = useSearchParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [hasCoachRole, setHasCoachRole] = useState(false);

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
      const userId = sessionUser?.id || cachedUserId;

      if (!userId) {
        if (sessionLoading) {
          console.log('[CoachDashboard] Session still loading, waiting...');
          return;
        }
        navigate("/auth");
        return;
      }

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
        console.warn("[CoachDashboard] Roles query timed out, using cached roles");
        if (cachedRoles && !cachedRoles.includes('coach')) {
          navigate("/dashboard");
          return;
        }
      }
    } catch (error: any) {
      console.error("[CoachDashboard] Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  }, [sessionUser, cachedUserId, sessionLoading, navigate, setCachedRoles, cachedRoles, toast]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      if (loading) {
        console.error("[CoachDashboard] Loading timeout - forcing render");
        setLoading(false);
      }
    }, 5000);

    loadUserData();

    return () => clearTimeout(timeout);
  }, [loadUserData, loading]);

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
