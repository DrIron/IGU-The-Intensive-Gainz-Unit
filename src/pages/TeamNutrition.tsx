import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import type { User as SupabaseUser } from "@supabase/supabase-js";
import { Navigation } from "@/components/Navigation";
import { Calculator } from "lucide-react";
import { NutritionProgress } from "@/components/nutrition/NutritionProgress";
import { supabase } from "@/integrations/supabase/client";
import { useAuthSession } from "@/hooks/useAuthSession";
import { useToast } from "@/hooks/use-toast";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function TeamNutrition() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user: sessionUser, isLoading: sessionLoading } = useAuthSession();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadUser = useCallback(async (user: SupabaseUser | null) => {
    try {
      if (!user) {
        navigate('/nutrition');
        return;
      }

      // Verify access: must be active team member or coach/admin
      // Use profiles_public for client status check (RLS secured)
      const [{ data: profile }, { data: subscription }, { data: roles }] = await Promise.all([
        supabase
          .from('profiles_public')
          .select('status')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('subscriptions')
          .select('id, status, service_id')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', user.id)
      ]);

      const isCoach = roles?.some(r => r.role === 'coach');
      const isAdmin = roles?.some(r => r.role === 'admin');

      // Coaches and admins can access
      if (isCoach || isAdmin) {
        setUser(user);
        setLoading(false);
        return;
      }

      // For clients: must be active with team subscription. Resolve service
      // type via a separate query -- CLAUDE.md bans nested PostgREST FK joins
      // on subscriptions.
      let serviceType: string | null = null;
      if (subscription?.service_id) {
        const { data: service } = await supabase
          .from('services')
          .select('type')
          .eq('id', subscription.service_id)
          .maybeSingle();
        serviceType = service?.type ?? null;
      }
      const isActiveClient = profile?.status === "active" && subscription?.status === "active";
      const isTeamMember = serviceType === "team";

      if (!isActiveClient || !isTeamMember) {
        toast({
          title: "Access Restricted",
          description: "This page is for team plan members only.",
          variant: "destructive",
        });
        navigate('/nutrition');
        return;
      }

      setUser(user);
      setLoading(false);
    } catch (err) {
      console.error("Error loading user:", err);
      setError(true);
      setLoading(false);
    }
  }, [navigate, toast]);

  // Keyed on session state so the effect retries once session resolves
  // (vs. a one-shot auth.getUser at mount that caches null on the race).
  const hasFetched = useRef<string | null>(null);

  useEffect(() => {
    const key = sessionUser?.id ?? (sessionLoading ? "__waiting__" : "__unauth__");
    if (hasFetched.current === key) return;
    hasFetched.current = key;
    if (sessionLoading) return;
    loadUser(sessionUser ?? null);
  }, [sessionUser, sessionLoading, loadUser]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="animate-pulse text-lg text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
        <Navigation user={null} />
        <main className="container mx-auto px-4 pt-24">
          <ErrorFallback onRetry={() => window.location.reload()} />
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Navigation user={user} />
      
      <main className="container mx-auto px-4 pt-24 pb-24 md:pb-12 max-w-4xl">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-gradient-to-r from-primary to-accent">
              <Calculator className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Nutrition</h1>
          <p className="text-xl text-muted-foreground">
            Team Plan – Your targets, trend, and weekly check-ins
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Your IGU coach may review and adjust these targets if needed.
          </p>
        </div>

        <NutritionProgress />
      </main>
    </div>
  );
}
