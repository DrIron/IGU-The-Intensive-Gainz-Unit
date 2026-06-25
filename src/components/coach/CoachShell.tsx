import { ReactNode } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { CoachSidebar } from "@/components/coach/CoachSidebar";
import { Navigation } from "@/components/Navigation";
import { useAuthSession } from "@/hooks/useAuthSession";

/**
 * CoachShell — the coach navigation chrome (top nav + left sidebar rail) for
 * STANDALONE coach pages that aren't routed through CoachDashboardLayout
 * (e.g. /coach/hub, /coach/content-assignments). Keeps the persistent left
 * rail so navigating to these pages doesn't drop the coach's nav.
 *
 * The sidebar highlights the active row from `location.pathname` internally,
 * so the `activeSection`/`onSectionChange` props are inert here. On mobile the
 * sidebar collapses (icon tier) and the global coach dock provides navigation.
 */
export function CoachShell({ children }: { children: ReactNode }) {
  const { user } = useAuthSession();
  return (
    <>
      <Navigation user={user} userRole="coach" />
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-background pt-[var(--app-top-offset)]">
          <CoachSidebar activeSection="" onSectionChange={() => {}} />
          <main className="flex-1 min-w-0 p-4 md:p-6 pb-24 md:pb-8 safe-area-bottom">
            <div className="max-w-7xl mx-auto">{children}</div>
          </main>
        </div>
      </SidebarProvider>
    </>
  );
}
