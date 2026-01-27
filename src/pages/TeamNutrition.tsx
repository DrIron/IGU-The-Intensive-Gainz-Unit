import { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, TrendingUp } from "lucide-react";
import { NutritionGoal } from "@/components/nutrition/NutritionGoal";
import { NutritionProgress } from "@/components/nutrition/NutritionProgress";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function TeamNutrition() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const activeTab = searchParams.get("tab") || "goal";

  useEffect(() => {
    loadUser();
  }, []);

  const loadUser = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
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
          .select('id, status, service_id, services!inner(type)')
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

      // For clients: must be active with team subscription
      const isActiveClient = profile?.status === "active" && subscription?.status === "active";
      const isTeamMember = (subscription as any)?.services?.type === "team";

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
  };

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
      
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-4xl">
        <div className="text-center mb-12">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-full bg-gradient-to-r from-primary to-accent">
              <Calculator className="h-8 w-8 text-white" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">Nutrition</h1>
          <p className="text-xl text-muted-foreground">
            Team Plan – Self-service nutrition calculator and progress tracking
          </p>
          <p className="text-sm text-muted-foreground mt-2">
            Your Fe Squad coach may review and adjust these targets if needed.
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={(value) => navigate(`/nutrition-team?tab=${value}`)} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8">
            <TabsTrigger value="goal" className="flex items-center gap-2">
              <Calculator className="h-4 w-4" />
              Goal Setting
            </TabsTrigger>
            <TabsTrigger value="progress" className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4" />
              Progress Tracker
            </TabsTrigger>
          </TabsList>

          <TabsContent value="goal">
            <NutritionGoal />
          </TabsContent>

          <TabsContent value="progress">
            <NutritionProgress />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
