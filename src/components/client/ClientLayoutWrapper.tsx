import { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ClientSidebar, getClientMobileNavItems } from "./ClientSidebar";
import { MobileBottomNav } from "@/components/layouts/MobileBottomNav";

interface ClientLayoutWrapperProps {
  children: ReactNode;
  activeSection: string;
  onSectionChange: (section: string) => void;
  profile?: any;
  subscription?: any;
  isPendingApproval?: boolean;
  sessionBookingEnabled?: boolean;
  /** If true, adds extra bottom padding for mobile bottom nav */
  withBottomNav?: boolean;
  /** Optional header content */
  header?: ReactNode;
}

/**
 * Wrapper component for client dashboard layouts.
 * Provides consistent sidebar, mobile bottom nav, and responsive behavior.
 */
export function ClientLayoutWrapper({
  children,
  activeSection,
  onSectionChange,
  profile,
  subscription,
  isPendingApproval = false,
  sessionBookingEnabled = false,
  withBottomNav = true,
  header,
}: ClientLayoutWrapperProps) {
  return (
    <SidebarProvider defaultOpen={false}>
      <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
        <ClientSidebar
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          isPendingApproval={isPendingApproval}
          profile={profile}
          subscription={subscription}
          sessionBookingEnabled={sessionBookingEnabled}
        />
        <main className="flex-1 overflow-auto">
          {header && (
            <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 md:p-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="md:hidden" />
                {header}
              </div>
            </div>
          )}
          <div className={`p-4 md:p-6 ${withBottomNav ? 'pb-24 md:pb-8' : 'pb-8'} safe-area-bottom`}>
            <div className="max-w-7xl mx-auto">
              {children}
            </div>
          </div>
        </main>
        {/* Mobile Bottom Navigation - only show for active users with nav */}
        {withBottomNav && <MobileBottomNav items={getClientMobileNavItems()} />}
      </div>
    </SidebarProvider>
  );
}
