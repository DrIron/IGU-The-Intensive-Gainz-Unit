import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

// This page now redirects to the coach's My Clients section
// PendingClientApprovals is integrated directly into the MyClientsList component
export default function PendingClientsPage() {
  const navigate = useNavigate();

  useEffect(() => {
    const checkAuthAndRedirect = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate("/auth");
        return;
      }

      // Check if user has coach role
      const { data: roles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);

      const isCoach = roles?.some(r => r.role === "coach");
      
      if (!isCoach) {
        navigate("/dashboard");
        return;
      }

      // Redirect to dashboard - the coach sidebar will handle showing my-clients section
      // The My Clients section now includes PendingClientApprovals at the top
      navigate("/dashboard");
    };

    checkAuthAndRedirect();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
    </div>
  );
}
