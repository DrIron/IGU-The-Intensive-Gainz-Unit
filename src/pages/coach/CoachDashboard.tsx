import { useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Navigation } from "@/components/Navigation";
import { CoachDashboardLayout } from "@/components/coach/CoachDashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

// Map URL paths to internal section IDs
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

  useDocumentTitle({
    title: "Coach Dashboard | Intensive Gainz Unit",
    description: "Coach management dashboard for IGU.",
  });

  // Derive active section from URL path
  const activeSection = SECTION_MAP[section || "dashboard"] || "overview";

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
        
        setHasCoachRole(isCoach);

        // STRICT: Only coaches can access coach routes - NO admin preview mode
        if (!isCoach) {
          toast({
            title: "Access Denied",
            description: isAdmin 
              ? "Admins must use a separate coach account to access coach features."
              : "You don't have permission to access the coach dashboard.",
            variant: "destructive",
          });
          if (isAdmin) {
            navigate("/admin/dashboard");
          } else {
            navigate("/dashboard");
          }
          return;
        }
      } else {
        // No roles found, redirect to client dashboard
        navigate("/dashboard");
        return;
      }
    } catch (error: any) {
      toast({
        title: "Error loading data",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handle section changes by navigating to new URL
  const handleSectionChange = (newSection: string) => {
    // Map internal section IDs to URL paths
    let urlPath = newSection;
    if (newSection === "overview") urlPath = "dashboard";
    if (newSection === "clients") urlPath = "clients";
    
    // Preserve query params
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
