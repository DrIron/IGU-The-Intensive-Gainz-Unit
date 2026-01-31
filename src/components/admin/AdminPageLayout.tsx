import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AdminSidebar } from "./AdminSidebar";
import { Navigation } from "@/components/Navigation";
import { Badge } from "@/components/ui/badge";

const ADMIN_BUILD_VERSION = "Admin build 2025-12-13T10:30";

interface AdminPageLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  activeSection?: string;
}

export function AdminPageLayout({ 
  children, 
  title, 
  subtitle,
  activeSection = "system-health"
}: AdminPageLayoutProps) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [hasAdminRole, setHasAdminRole] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);

  useEffect(() => {
    loadUserRoles();
  }, []);

  const loadUserRoles = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        navigate("/auth");
        return;
      }
      setCurrentUser(user);

      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesData) {
        const roles = rolesData.map(r => r.role);
        setHasAdminRole(roles.includes("admin"));
        
        if (!roles.includes("admin")) {
          navigate("/dashboard");
          return;
        }
      }
    } catch (error) {
      console.error("Error loading user roles:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSectionChange = (section: string) => {
    navigate("/dashboard");
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
      <SidebarProvider defaultOpen={false}>
        <div className="flex min-h-screen w-full bg-gradient-to-br from-background via-background to-primary/5 pt-16">
          <AdminSidebar 
            activeSection={activeSection} 
            onSectionChange={handleSectionChange} 
            hasCoachRole={false}
            hasAdminRole={hasAdminRole}
          />
          
          <main className="flex-1 overflow-auto">
            <div className="bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b p-4 md:p-6">
              <div className="flex items-center gap-4">
                <SidebarTrigger className="md:hidden" />
                <div className="flex-1 min-w-0 flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div>
                      <h1 className="text-2xl md:text-3xl font-bold truncate">{title}</h1>
                      {subtitle && (
                        <p className="text-sm text-muted-foreground truncate">
                          {subtitle}
                        </p>
                      )}
                    </div>
                    <Badge variant="default" className="hidden sm:flex">
                      Admin
                    </Badge>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="p-4 md:p-6 pb-8 safe-area-bottom">
              <div className="max-w-7xl mx-auto">
                {children}
                <div className="mt-8 text-xs text-muted-foreground text-right">
                  {ADMIN_BUILD_VERSION}
                </div>
              </div>
            </div>
          </main>
        </div>
      </SidebarProvider>
    </>
  );
}
