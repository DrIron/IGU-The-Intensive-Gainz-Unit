import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Navigation } from "@/components/Navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2 } from "lucide-react";
import { ClientNutritionGoal } from "@/components/nutrition/ClientNutritionGoal";
import { ClientNutritionProgress } from "@/components/nutrition/ClientNutritionProgress";
import { ClientNutritionAdjustments } from "@/components/nutrition/ClientNutritionAdjustments";
import { WeightProgressGraph } from "@/components/nutrition/WeightProgressGraph";
import { BodyFatProgressGraph } from "@/components/nutrition/BodyFatProgressGraph";
import { PhaseSummaryReport } from "@/components/nutrition/PhaseSummaryReport";
import { generatePhaseSummary } from "@/utils/nutritionCalculations";
import { ErrorFallback } from "@/components/ui/error-fallback";

export default function ClientNutrition() {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [activePhase, setActivePhase] = useState<any>(null);
  const [user, setUser] = useState<any>(null);
  const [weightLogs, setWeightLogs] = useState<any[]>([]);
  const [userGender, setUserGender] = useState<string | null>(null);
  const [initialBodyFat, setInitialBodyFat] = useState<number | null>(null);
  const [phaseSummary, setPhaseSummary] = useState<any>(null);
  const [weeklyProgress, setWeeklyProgress] = useState<any[]>([]);
  const [error, setError] = useState(false);

  const loadActivePhase = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Load active nutrition phase
      const { data: phase, error: phaseError } = await supabase
        .from('nutrition_phases')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .maybeSingle();

      if (phaseError) throw phaseError;
      setActivePhase(phase);

      if (phase) {
        // Load additional data for graphs and summary
        const [weightsRes, adherenceRes, adjustmentsRes, weeklyProgressRes] = await Promise.all([
          supabase.from('weight_logs').select('*').eq('phase_id', phase.id).order('log_date', { ascending: true }),
          supabase.from('adherence_logs').select('*').eq('phase_id', phase.id),
          supabase.from('nutrition_adjustments').select('*').eq('phase_id', phase.id),
          supabase.from('weekly_progress').select('week_number, body_fat_percentage').eq('goal_id', phase.id).order('week_number', { ascending: true })
        ]);

        setWeightLogs(weightsRes.data || []);
        setWeeklyProgress(weeklyProgressRes.data || []);

        // Check if user had initial body fat
        if (weightsRes.data && weightsRes.data.length > 0) {
          const { data: weeklyProgress } = await supabase
            .from('weekly_progress')
            .select('body_fat_percentage')
            .eq('goal_id', phase.id)
            .eq('week_number', 1)
            .maybeSingle();

          setInitialBodyFat(weeklyProgress?.body_fat_percentage || null);
        }

        // Generate phase summary if phase is complete
        const weeksSinceStart = Math.floor(
          (new Date().getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
        ) + 1;

        const estimatedWeeks = phase.estimated_end_date
          ? Math.floor((new Date(phase.estimated_end_date).getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000))
          : null;

        if (estimatedWeeks && weeksSinceStart >= estimatedWeeks) {
          const summary = generatePhaseSummary(
            phase,
            weightsRes.data || [],
            adherenceRes.data || [],
            adjustmentsRes.data || []
          );
          setPhaseSummary(summary);
        }
      }
    } catch (error: any) {
      console.error('Error loading nutrition phase:', error);
      toast({
        title: "Error",
        description: "Failed to load nutrition data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadUser = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) {
        navigate('/nutrition');
        return;
      }

      // Verify access: must be active 1:1 client
      // Use profiles_public for status + profiles_private for gender (own user only)
      const [{ data: profilePublic }, { data: profilePrivate }, { data: subscription }] = await Promise.all([
        supabase
          .from('profiles_public')
          .select('status')
          .eq('id', user.id)
          .maybeSingle(),
        supabase
          .from('profiles_private')
          .select('gender')
          .eq('profile_id', user.id)
          .maybeSingle(),
        supabase
          .from('subscriptions')
          .select('id, status, service_id, services!inner(type)')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      ]);

      const isActiveClient = profilePublic?.status === "active" && subscription?.status === "active";
      const isOneToOne = (subscription as any)?.services?.type === "one_to_one";

      if (!isActiveClient || !isOneToOne) {
        toast({
          title: "Access Restricted",
          description: "This page is for 1:1 coaching clients only.",
          variant: "destructive",
        });
        navigate('/nutrition');
        return;
      }

      setUser(user);
      setUserGender(profilePrivate?.gender || null);
      loadActivePhase();
    } catch (err) {
      console.error("Error loading user:", err);
      setError(true);
      setLoading(false);
    }
  }, [navigate, toast, loadActivePhase]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

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
      
      <main className="container mx-auto px-4 pt-24 pb-12 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-4xl font-bold mb-2">Nutrition</h1>
          <p className="text-muted-foreground">Track your nutrition goals and progress</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : !activePhase ? (
          <Card>
            <CardHeader>
              <CardTitle>No Active Nutrition Phase</CardTitle>
              <CardDescription>
                Your coach hasn't set up a nutrition phase yet. Contact them to get started!
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <>
            {phaseSummary && (
              <div className="mb-6">
                <PhaseSummaryReport phase={activePhase} summary={phaseSummary} />
              </div>
            )}

            <Tabs defaultValue="progress" className="w-full">
              <TabsList className="grid w-full grid-cols-2 mb-8">
                <TabsTrigger value="progress">Progress</TabsTrigger>
                <TabsTrigger value="graphs">Graphs</TabsTrigger>
              </TabsList>

              <TabsContent value="progress">
                <ClientNutritionProgress 
                  phase={activePhase} 
                  userGender={userGender}
                  initialBodyFat={initialBodyFat}
                />
              </TabsContent>

              <TabsContent value="graphs">
                <div className="space-y-6">
                  {weightLogs.length > 0 && (
                    <WeightProgressGraph phase={activePhase} weightLogs={weightLogs} />
                  )}
                  <BodyFatProgressGraph weeklyProgress={weeklyProgress} />
                </div>
              </TabsContent>
            </Tabs>
          </>
        )}
      </main>
    </div>
  );
}
