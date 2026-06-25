import { useEffect, useRef, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { Navigation } from "@/components/Navigation";
import { ClientSidebar } from "@/components/client/ClientSidebar";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";

interface ClientPageLayoutProps {
  children: React.ReactNode;
}

/**
 * Shared shell for standalone client pages (Nutrition, WorkoutCalendar, ...)
 * so they keep the same top Navigation + left ClientSidebar as the dashboard
 * instead of rendering bare (the "left nav disappears" bug). Mirrors the
 * dashboard's ClientDashboardLayout shell: SidebarProvider + flat bg + sidebar
 * + main.
 *
 * ClientSidebar is `hidden md:flex`, so this only adds the left rail on
 * desktop; mobile is untouched (the global bottom dock still handles nav).
 *
 * We fetch just the profile.status + subscription.status the sidebar needs to
 * gate nav-item visibility -- without them ClientSidebar treats the client as
 * inactive and hides workout-library / sessions / educational-videos.
 */
export function ClientPageLayout({ children }: ClientPageLayoutProps) {
  const { user } = useAuthSession();
  const [profile, setProfile] = useState<{ status: string } | null>(null);
  const [subscription, setSubscription] = useState<
    { status: string; session_booking_enabled: boolean | null } | null
  >(null);
  const fetchedFor = useRef<string | null>(null);

  useEffect(() => {
    const uid = user?.id;
    if (!uid || fetchedFor.current === uid) return;
    fetchedFor.current = uid;
    void (async () => {
      const [profileRes, subRes] = await Promise.all([
        supabase.from("profiles_public").select("status").eq("id", uid).maybeSingle(),
        supabase
          .from("subscriptions")
          .select("status, session_booking_enabled")
          .eq("user_id", uid)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (profileRes.data) setProfile(profileRes.data as { status: string });
      if (subRes.data)
        setSubscription(
          subRes.data as { status: string; session_booking_enabled: boolean | null },
        );
    })();
  }, [user?.id]);

  return (
    <>
      <Navigation user={user} userRole="client" />
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-background pt-[var(--app-top-offset)]">
          <ClientSidebar
            profile={profile}
            subscription={subscription}
            sessionBookingEnabled={subscription?.session_booking_enabled === true}
          />
          <main className="flex-1 min-w-0">{children}</main>
        </div>
      </SidebarProvider>
    </>
  );
}
