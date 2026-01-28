import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Session } from "@supabase/supabase-js";

interface AuthGuardProps {
  children: React.ReactNode;
}

/**
 * Simple authentication guard - requires user to be logged in.
 * Does NOT check roles. Use RoleProtectedRoute for role-specific access.
 * 
 * Use this for routes accessible to any authenticated user:
 * - /dashboard, /account, /onboarding, etc.
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const navigate = useNavigate();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!mounted) return;
      setSession(session);
      setLoading(false);
      
      if (!session) {
        navigate("/auth", { replace: true });
      }
    });

    const checkAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!mounted) return;
      
      setSession(session);
      setLoading(false);
      
      if (!session) {
        navigate("/auth", { replace: true });
      }
    };

    checkAuth();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return session ? <>{children}</> : null;
}
