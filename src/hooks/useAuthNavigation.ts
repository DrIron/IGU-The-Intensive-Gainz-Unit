import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCallback } from "react";

/**
 * Hook that provides centralized auth navigation logic.
 * Use this anywhere you have a "Log In" / "Client Dashboard" CTA.
 * 
 * - If user is NOT authenticated → navigates to /auth (login flow)
 * - If user IS authenticated → navigates to /dashboard
 */
export function useAuthNavigation() {
  const navigate = useNavigate();

  /**
   * Navigates to dashboard if authenticated, otherwise to auth page
   */
  const navigateToAuthOrDashboard = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    
    if (user) {
      navigate("/dashboard");
    } else {
      navigate("/auth");
    }
  }, [navigate]);

  /**
   * Sync version that uses provided user state (for components that already have user)
   */
  const goToAuthOrDashboard = useCallback((user: any) => {
    if (user) {
      navigate("/dashboard");
    } else {
      navigate("/auth");
    }
  }, [navigate]);

  return {
    navigateToAuthOrDashboard,
    goToAuthOrDashboard,
  };
}
