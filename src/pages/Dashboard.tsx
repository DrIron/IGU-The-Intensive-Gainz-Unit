import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { Navigation } from "@/components/Navigation";
import { ClientDashboardLayout } from "@/components/client/ClientDashboardLayout";
import { useDocumentTitle } from "@/hooks/useDocumentTitle";

// Profile interface matches profiles_public schema
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

// Admin section mappings for legacy redirect
const ADMIN_SECTION_MAP: Record<string, string> = {
  dashboard: "dashboard",
  overview: "dashboard",
  clients: "clients",
  coaches: "coaches",
  "plans-services": "pricing-payouts",
  "pricing-payouts": "pricing-payouts",
  "discount-codes": "discount-codes",
  "discord-legal": "discord-legal",
  exercises: "exercises",
  content: "exercises",
  "educational-videos": "exercises",
  "system-health": "system-health",
  testimonials: "testimonials",
};

// Coach section mappings for legacy redirect
const COACH_SECTION_MAP: Record<string, string> = {
  dashboard: "dashboard",
  overview: "dashboard",
  "coach-dashboard": "dashboard",
  clients: "clients",
  "my-clients": "clients",
  sessions: "sessions",
  programs: "programs",
  profile: "profile",
  "client-nutrition": "nutrition",
};

// Sections that are admin-only
const ADMIN_ONLY_SECTIONS = [
  "clients", // Admin Client Directory
  "coaches",
  "pricing-payouts",
  "discount-codes",
  "discord-legal",
  "exercises",
  "content",
  "educational-videos",
  "system-health",
  "testimonials",
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
  
  // Read section from URL query param
  const sectionFromUrl = searchParams.get("section");
  const [activeSection, setActiveSection] = useState(sectionFromUrl || "overview");

  useDocumentTitle({
    title: "Dashboard | Intensive Gainz Unit",
    description: "View your plan, coach, progress, and payments in your IGU dashboard.",
  });

  useEffect(() => {
    loadUserData();
  }, []);

  const loadUserData = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUser(user);

      // Load profile - use profiles_public for client dashboard (RLS secured)
      // Client's own profile data is accessible through profiles_public
      const { data: profileData, error: profileError } = await supabase
        .from("profiles_public")
        .select("*")
        .eq("id", user.id)
        .single();

      if (profileError) throw profileError;
      setProfile(profileData);

      // Check user roles
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      if (rolesData && rolesData.length > 0) {
        const roles = rolesData.map(r => r.role);
        
        // Get section and other params for potential redirect
        const section = searchParams.get("section") || "dashboard";
        const filter = searchParams.get("filter");
        const tab = searchParams.get("tab");

        // Build query string (excluding section)
        const newParams = new URLSearchParams();
        if (filter) newParams.set("filter", filter);
        if (tab) newParams.set("tab", tab);
        const queryString = newParams.toString();

        // STRICT: Redirect admin to admin routes ONLY (no coach access)
        if (roles.includes('admin')) {
          const mappedSection = ADMIN_SECTION_MAP[section] || "dashboard";
          const url = `/admin/${mappedSection}${queryString ? `?${queryString}` : ''}`;
          navigate(url, { replace: true });
          return;
        }
        
        // STRICT: Redirect coach to coach routes ONLY
        if (roles.includes('coach')) {
          // If trying to access admin-only section, redirect to coach dashboard
          if (ADMIN_ONLY_SECTIONS.includes(section)) {
            navigate("/coach/dashboard", { replace: true });
            return;
          }
          
          const mappedSection = COACH_SECTION_MAP[section] || "dashboard";
          const url = `/coach/${mappedSection}${queryString ? `?${queryString}` : ''}`;
          navigate(url, { replace: true });
          return;
        }
        
        // Set role for client
        setUserRole(roles[0]);
      }

      // Load subscription for clients
      const { data: subscriptionData, error: subscriptionError } = await supabase
        .from("subscriptions")
        .select(`
          *,
          services (
            name,
            price_kwd
          )
        `)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (subscriptionError) throw subscriptionError;
      setSubscription(subscriptionData);
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

  // Custom section change handler for client dashboard
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
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  // Render client dashboard (admin/coach are redirected above)
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
  return (
    <ProtectedRoute>
      <DashboardContent />
    </ProtectedRoute>
  );
}
