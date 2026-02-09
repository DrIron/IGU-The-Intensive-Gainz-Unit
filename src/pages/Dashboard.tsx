import { useEffect, useState, useCallback, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { ClientDashboardLayout } from "@/components/client/ClientDashboardLayout";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";
import { useRoleCache } from "@/hooks/useRoleCache";
import { useAuthSession } from "@/hooks/useAuthSession";
import { TIMEOUTS } from "@/lib/constants";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

interface Profile {
  status: string;
  display_name: string | null;
  first_name: string | null;
  avatar_url: string | null;
  payment_exempt: boolean;
  payment_deadline: string | null;
}

interface Subscription {
  id: string;
  service_id: string;
  status: string;
  start_date: string;
  next_billing_date: string;
  cancel_at_period_end: boolean;
  services: {
    name: string;
    price_kwd: number;
  };
}

const ADMIN_SECTION_MAP: Record<string, string> = {
  dashboard: "dashboard", overview: "dashboard", clients: "clients",
  coaches: "coaches", "plans-services": "pricing-payouts",
  "pricing-payouts": "pricing-payouts", "discount-codes": "discount-codes",
  "discord-legal": "discord-legal", exercises: "exercises",
  content: "exercises", "educational-videos": "exercises",
  "system-health": "system-health", testimonials: "testimonials",
};

const COACH_SECTION_MAP: Record<string, string> = {
  dashboard: "dashboard", overview: "dashboard", "coach-dashboard": "dashboard",
  clients: "clients", "my-clients": "clients", sessions: "sessions",
  programs: "programs", profile: "profile", "client-nutrition": "nutrition",
};

const ADMIN_ONLY_SECTIONS = [
  "clients", "coaches", "pricing-payouts", "discount-codes",
  "discord-legal", "exercises", "content", "educational-videos",
  "system-health", "testimonials",
];

function DashboardContent() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [subscription, setSubscription] = useState<Subscription | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const hasLoadedData = useRef(false);

  const { cachedRoles, cachedUserId, setCachedRoles } = useRoleCache();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();

  const sectionFromUrl = searchParams.get("section");
  const [activeSection, setActiveSection] = useState(sectionFromUrl || "overview");

  useDocumentTitle({
    title: "Dashboard | Intensive Gainz Unit",
    description: "View your plan, coach, progress, and payments in your IGU dashboard.",
  });

  // Instant redirect for admin/coach using cached roles (no async wait)
  useEffect(() => {
    if (!cachedRoles || cachedRoles.length === 0) return;
    const section = searchParams.get("section") || "dashboard";
    const filter = searchParams.get("filter");
    const tab = searchParams.get("tab");
    const newParams = new URLSearchParams();
    if (filter) newParams.set("filter", filter);
    if (tab) newParams.set("tab", tab);
    const qs = newParams.toString();

    if (cachedRoles.includes("admin")) {
      const mapped = ADMIN_SECTION_MAP[section] || "dashboard";
      navigate(`/admin/${mapped}${qs ? `?${qs}` : ""}`, { replace: true });
    } else if (cachedRoles.includes("coach")) {
      const mapped = COACH_SECTION_MAP[section] || "dashboard";
      navigate(`/coach/${mapped}${qs ? `?${qs}` : ""}`, { replace: true });
    }
  }, [cachedRoles, navigate, searchParams]);

  const loadUserData = useCallback(async () => {
    try {
      const userId = sessionUser?.id || cachedUserId;

      if (!userId) {
        if (sessionLoading) {
          if (import.meta.env.DEV) console.log('[Dashboard] Session still loading, waiting...');
          return;
        }
        navigate("/auth");
        return;
      }

      const user = sessionUser || { id: userId, email: null };
      setCurrentUser(user);

      // Load profile with timeout
      try {
        const profilePromise = supabase
          .from("profiles_public")
          .select("*")
          .eq("id", userId)
          .single();

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Profile query timeout')), TIMEOUTS.ROLES_QUERY)
        );

        const { data, error } = await Promise.race([
          profilePromise,
          timeoutPromise
        ]) as { data: Profile | null; error: Error | null };

        if (!error) setProfile(data);
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Dashboard] Profile query timed out");
      }

      // Check roles with timeout
      let roles: string[] = cachedRoles || [];
      try {
        const rolesPromise = supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId);

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Roles query timeout')), TIMEOUTS.ROLES_QUERY)
        );

        const { data: rolesData } = await Promise.race([
          rolesPromise,
          timeoutPromise
        ]) as { data: { role: string }[] | null };

        if (rolesData && rolesData.length > 0) {
          roles = rolesData.map(r => r.role);
          setCachedRoles(roles, userId);
        }
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Dashboard] Roles query timed out, using cached roles");
      }

      // Role-based redirects
      if (roles.length > 0) {
        const section = searchParams.get("section") || "dashboard";
        const filter = searchParams.get("filter");
        const tab = searchParams.get("tab");

        const newParams = new URLSearchParams();
        if (filter) newParams.set("filter", filter);
        if (tab) newParams.set("tab", tab);
        const queryString = newParams.toString();

        if (roles.includes('admin')) {
          const mappedSection = ADMIN_SECTION_MAP[section] || "dashboard";
          navigate(`/admin/${mappedSection}${queryString ? `?${queryString}` : ''}`, { replace: true });
          return;
        }

        if (roles.includes('coach')) {
          if (ADMIN_ONLY_SECTIONS.includes(section)) {
            navigate("/coach/dashboard", { replace: true });
            return;
          }
          const mappedSection = COACH_SECTION_MAP[section] || "dashboard";
          navigate(`/coach/${mappedSection}${queryString ? `?${queryString}` : ''}`, { replace: true });
          return;
        }

        setUserRole(roles[0]);
      }

      // Load subscription with timeout
      try {
        const subPromise = supabase
          .from("subscriptions")
          .select(`*, services (name, price_kwd)`)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const timeoutPromise = new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Subscription query timeout')), TIMEOUTS.ROLES_QUERY)
        );

        const { data, error } = await Promise.race([
          subPromise,
          timeoutPromise
        ]) as { data: Subscription | null; error: Error | null };

        if (!error) setSubscription(data);
      } catch (e) {
        if (import.meta.env.DEV) console.warn("[Dashboard] Subscription query timed out");
      }
    } catch (error: any) {
      if (import.meta.env.DEV) console.error("[Dashboard] Error loading data:", error);
      toast({ title: "Error loading data", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [sessionUser, cachedUserId, sessionLoading, navigate, cachedRoles, setCachedRoles, searchParams, toast]);

  useEffect(() => {
    // Prevent infinite loop - only load once
    if (hasLoadedData.current) {
      return;
    }
    hasLoadedData.current = true;

    const timeout = setTimeout(() => {
      if (loading) {
        if (import.meta.env.DEV) console.error("[Dashboard] Loading timeout - forcing render");
        setLoading(false);
      }
    }, 5000);

    loadUserData();

    return () => clearTimeout(timeout);
  }, [cachedUserId, sessionUser, loadUserData, loading]);

  const handleSectionChange = (section: string) => {
    setActiveSection(section);
    if (section === "overview") {
      searchParams.delete("section");
    } else {
      searchParams.set("section", section);
    }
    setSearchParams(searchParams, { replace: true });
  };

  if (loading) {
    return <LoadingSpinner />;
  }

  return (
    <>
      <Navigation user={currentUser} userRole="client" onSectionChange={handleSectionChange} activeSection={activeSection} />
      <ClientDashboardLayout
        user={currentUser}
        profile={profile}
        subscription={subscription}
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
    </>
  );
}

export default function Dashboard() {
  return <DashboardContent />;
}
