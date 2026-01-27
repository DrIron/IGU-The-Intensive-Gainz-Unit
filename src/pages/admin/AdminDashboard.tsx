import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { AdminDashboardLayout } from "@/components/admin/AdminDashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

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

  useDocumentTitle({
    title: "Admin Dashboard | Intensive Gainz Unit",
    description: "Admin management dashboard for IGU.",
  });

  // Derive active section from URL path
  const activeSection = SECTION_MAP[section || "dashboard"] || "dashboard";

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate("/auth");
        return;
      }
      setCurrentUser(user);

      // Check user roles
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesData && rolesData.length > 0) {
        const roles = rolesData.map(r => r.role);
        const isAdmin = roles.includes('admin');
        const isCoach = roles.includes('coach');
        
        setHasAdminRole(isAdmin);
        setHasCoachRole(isCoach);

        // STRICT: Only admin role grants access - no exceptions
        // RoleProtectedRoute is the primary guard, this is defense-in-depth
        if (!isAdmin) {
          // Don't redirect - let RoleProtectedRoute handle it with the No Access screen
          setLoading(false);
          return;
        }
      } else {
        // No roles found - RoleProtectedRoute will show No Access screen
        setLoading(false);
        return;
      }
    } catch (error: any) {
      console.error("Error loading user data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Handle section changes by navigating to new URL
  const handleSectionChange = (newSection: string) => {
    // Map internal section IDs back to URL paths
    const urlPath = newSection === "dashboard" ? "dashboard" : newSection;
    
    // Preserve query params
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
