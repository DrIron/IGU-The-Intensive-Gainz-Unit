import { useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Navigation } from "@/components/Navigation";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useRoleCache } from "@/hooks/useRoleCache";

interface ClientPageLayoutProps {
  children: React.ReactNode;
}

const STAFF_ROLES = ["coach", "admin", "dietitian"];
function deriveStaff(roles: string[]): { isStaff: boolean; userRole: string | undefined } {
  const isStaff = roles.some((r) => STAFF_ROLES.includes(r));
  const userRole = roles.includes("admin") ? "admin" : roles.includes("coach") || roles.includes("dietitian") ? "coach" : undefined;
  return { isStaff, userRole };
}

/**
 * Shared shell for standalone pages reachable by multiple roles (Nutrition,
 * Workouts, Learn, Account, Sessions, ...). ROLE-AWARE:
 *   - client  -> full client shell (top Navigation + left ClientSidebar)
 *   - staff   -> bare (top Navigation only, no client sidebar / no client role)
 * so a coach/admin who lands on a self-service client route doesn't get the
 * client sidebar or a forced "client" nav role.
 *
 * Role comes from useRoleCache (synchronous, warm after auth) with a user_roles
 * fallback fetch so a cold cache still resolves correctly.
 *
 * ClientSidebar is `hidden md:flex`, so the client shell only adds the left rail
 * on desktop; mobile uses the global bottom dock either way.
 */
export function ClientPageLayout({ children }: ClientPageLayoutProps) {
  const { user } = useAuthSession();
  const { cachedRoles } = useRoleCache();
  const [fetchedRoles, setFetchedRoles] = useState<string[] | null>(null);
  const [profile, setProfile] = useState<{ status: string } | null>(null);
  const [subscription, setSubscription] = useState<{ status: string; session_booking_enabled: boolean | null } | null>(null);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.id;
    if (!uid || fetchedFor.current === uid) return;
    fetchedFor.current = uid;
    void (async () => {
      const [profileRes, subRes, rolesRes] = await Promise.all([
        supabase.from("profiles_public").select("status").eq("id", uid).maybeSingle(),
        supabase.from("subscriptions").select("status, session_booking_enabled").eq("user_id", uid).order("created_at", { ascending: false }).limit(1).maybeSingle(),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      if (profileRes.data) setProfile(profileRes.data as { status: string });
      if (subRes.data) setSubscription(subRes.data as { status: string; session_booking_enabled: boolean | null });
      if (rolesRes.data) setFetchedRoles((rolesRes.data as { role: string }[]).map((r) => r.role));
    })();
  }, [user?.id]);

  const effectiveRoles = fetchedRoles ?? cachedRoles ?? [];
  const { isStaff, userRole } = deriveStaff(effectiveRoles);

  if (isStaff) {
    return (
      <>
        <Navigation user={user} userRole={userRole} />
        <main className="min-h-screen w-full bg-background pt-[var(--app-top-offset)]">{children}</main>
      </>
    );
  }

  return (
    <>
      <Navigation user={user} userRole="client" />
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-background pt-[var(--app-top-offset)]">
          <ClientSidebar profile={profile} subscription={subscription} sessionBookingEnabled={subscription?.session_booking_enabled === true} />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </SidebarProvider>
    </>
  );
}
