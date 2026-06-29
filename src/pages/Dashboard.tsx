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
import { captureException } from "@/lib/errorLogging";
import { selectWithRetry } from "@/lib/selectWithRetry";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

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
  team_id: string | null;
  last_team_change_at: string | null;
  services: {
    name: string;
    price_kwd: number;
    type: string;
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
  const [profileLoadFailed, setProfileLoadFailed] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const [currentUser, setCurrentUser] = useState<{ id: string; email: string | null } | null>(null);
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

      // Load profile -- one attempt, then a single retry if the first lost
      // the auth race (JWT not yet attached -> RLS returns 0 rows -> .single()
      // would throw, so use .maybeSingle() to keep the response shape clean).
      // After two failures we surface an error state with a Reload button
      // instead of leaving the layout stuck on its !profile skeleton forever
      // (Mubarak repro, Apr 26).
      // Mitigation for the documented getSession/GoTrue stall (CLAUDE.md "Auth
      // session persistence"): the profile / roles / subscription reads are
      // INDEPENDENT, so run them in PARALLEL (one exposure window, not three
      // sequential ones) and replace the old race-to-reject timeouts with
      // selectWithRetry — a transient pooler/connection blip now RETRIES per
      // attempt (each wrapped in withTimeout) instead of rejecting all three at
      // once and failing the dashboard. Reads are idempotent, so retry is safe.
      const ATTEMPTS = 3;
      const BACKOFF_MS = 400;

      // Profile: selectWithRetry handles stalls; the zero-row case (JWT not yet
      // attached -> RLS-self policy returns 0 rows, error null) still gets one
      // extra delayed retry, preserving the Mubarak (Apr 26) fix.
      const loadProfile = async (): Promise<{ data: Profile | null; error: { message: string } | null }> => {
        const runProfile = () =>
          supabase.from("profiles_public").select("*").eq("id", userId).maybeSingle();
        let res = await selectWithRetry(runProfile, ATTEMPTS, BACKOFF_MS, {
          timeoutMs: TIMEOUTS.ROLES_QUERY,
          label: "Profile query",
        });
        if (!res.data && !res.error) {
          await new Promise((r) => setTimeout(r, 1500));
          res = await selectWithRetry(runProfile, ATTEMPTS, BACKOFF_MS, {
            timeoutMs: TIMEOUTS.ROLES_QUERY,
            label: "Profile query (retry)",
          });
        }
        return res as { data: Profile | null; error: { message: string } | null };
      };

      const loadRoles = () =>
        selectWithRetry(
          () => supabase.from("user_roles").select("role").eq("user_id", userId),
          ATTEMPTS,
          BACKOFF_MS,
          { timeoutMs: TIMEOUTS.ROLES_QUERY, label: "Roles query" },
        ) as Promise<{ data: { role: string }[] | null; error: unknown }>;

      const loadSubscription = () =>
        selectWithRetry(
          () =>
            supabase
              .from("subscriptions")
              .select(`*, services (name, price_kwd, type)`)
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle(),
          ATTEMPTS,
          BACKOFF_MS,
          { timeoutMs: TIMEOUTS.ROLES_QUERY, label: "Subscription query" },
        ) as Promise<{ data: Subscription | null; error: Error | null }>;

      const [profileRes, rolesRes, subRes] = await Promise.all([
        loadProfile(),
        loadRoles(),
        loadSubscription(),
      ]);

      // ---- Profile ----
      if (profileRes.data) {
        setProfile(profileRes.data);
        setProfileLoadFailed(false);
      } else {
        setProfileLoadFailed(true);
        captureException(profileRes.error ?? new Error('Profile load returned null after retry'), {
          source: 'Dashboard.loadUserData.profile',
          severity: 'error',
          metadata: { userId, hadError: !!profileRes.error },
        });
      }

      // ---- Roles ---- Falls back to cachedRoles on miss/timeout so a transient
      // JWT race doesn't mis-route a coach/admin to /dashboard.
      let roles: string[] = cachedRoles || [];
      if (rolesRes.error) {
        captureException(rolesRes.error, {
          source: 'Dashboard.loadUserData.roles',
          severity: 'warning',
          metadata: { userId, fellBackToCache: roles.length > 0 },
        });
      } else if (rolesRes.data && rolesRes.data.length > 0) {
        roles = rolesRes.data.map((r) => r.role);
        setCachedRoles(roles, userId);
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

      // ---- Subscription ---- (loaded in the parallel batch above). Member-role
      // clients fall through to here; coach/admin already returned via redirect.
      if (subRes.error) {
        captureException(subRes.error, {
          source: 'Dashboard.loadUserData.subscription',
          severity: 'warning',
          metadata: { userId },
        });
      } else {
        setSubscription(subRes.data);
      }
    } catch (error: unknown) {
      if (import.meta.env.DEV) console.error("[Dashboard] Error loading data:", error);
      toast({ title: "Error loading data", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [sessionUser, cachedUserId, sessionLoading, navigate, cachedRoles, setCachedRoles, searchParams, toast]);

  useEffect(() => {
    if (hasLoadedData.current) {
      return;
    }
    // Don't lock the ref until we actually have a user to load. On a cold
    // mount sessionUser is briefly undefined; loadUserData would early-
    // return on `sessionLoading` without flipping `loading` or surfacing
    // an error, and the ref-lock would then block the re-run when
    // sessionUser later arrived -- profile stays null and the layout sits
    // on its !profile skeleton forever (Apr 28 client repro). Holding the
    // ref open until userId is present lets the effect fire fresh on the
    // next render that has the session attached.
    const userId = sessionUser?.id || cachedUserId;
    if (!userId && sessionLoading) {
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
  // eslint-disable-next-line react-hooks/exhaustive-deps -- loading excluded to prevent timeout leak on re-fire
  }, [cachedUserId, sessionUser, sessionLoading, loadUserData]);

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

  // Profile fetch failed twice -- show a recoverable error state instead of
  // letting ClientDashboardLayout sit on its !profile skeleton forever.
  if (profileLoadFailed && !profile) {
    const handleReload = () => {
      hasLoadedData.current = false;
      setProfileLoadFailed(false);
      setLoading(true);
      loadUserData();
    };
    return (
      <>
        <Navigation user={currentUser} userRole="client" onSectionChange={handleSectionChange} activeSection={activeSection} />
        <main className="flex min-h-screen items-center justify-center p-6">
          <div className="max-w-sm space-y-4 text-center">
            <AlertCircle className="h-10 w-10 text-destructive mx-auto" aria-hidden="true" />
            <h1 className="text-lg font-semibold">We couldn't load your dashboard</h1>
            <p className="text-sm text-muted-foreground">
              Your session may need to refresh. Tap reload to try again -- if this keeps happening, sign out and back in.
            </p>
            <div className="flex flex-col gap-2">
              <Button onClick={handleReload}>Reload</Button>
              <Button variant="outline" onClick={() => navigate('/auth')}>Sign out</Button>
            </div>
          </div>
        </main>
      </>
    );
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
