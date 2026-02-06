import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Filter } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CoachNutritionGoal } from "@/components/nutrition/CoachNutritionGoal";
import { CoachNutritionProgress } from "@/components/nutrition/CoachNutritionProgress";
import { CoachNutritionGraphs } from "@/components/nutrition/CoachNutritionGraphs";
import { CoachNutritionNotes } from "@/components/nutrition/CoachNutritionNotes";
import { DietBreakManager } from "@/components/nutrition/DietBreakManager";
import { RefeedDayScheduler } from "@/components/nutrition/RefeedDayScheduler";
import { StepProgressDisplay } from "@/components/nutrition/StepProgressDisplay";
import { StepRecommendationCard } from "@/components/nutrition/StepRecommendationCard";
import { NutritionPermissionGate } from "@/components/nutrition/NutritionPermissionGate";
import { useNutritionPermissions } from "@/hooks/useNutritionPermissions";

interface Client {
  id: string;
  user_id: string;
  // email removed - coaches should not access client PII
  display_name: string;
  service_name: string;
  coach_name?: string;
  coach_id?: string;
}

interface Coach {
  id: string;
  user_id: string;
  name: string;
}

export default function CoachClientNutrition() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [selectedClient, setSelectedClient] = useState<string>("");
  const [filter, setFilter] = useState("active");
  const [selectedCoach, setSelectedCoach] = useState<string>("all");
  const [activePhase, setActivePhase] = useState<any>(null);
  const [phaseStats, setPhaseStats] = useState<any>(null);

  const loadCoaches = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('coaches')
        .select('user_id, first_name, last_name, status')
        .eq('status', 'active')
        .order('first_name');

      if (error) throw error;

      const coachesList = data?.map(coach => ({
        id: coach.user_id,
        user_id: coach.user_id,
        name: `${coach.first_name} ${coach.last_name || ''}`.trim(),
      })) || [];

      setCoaches(coachesList);
    } catch (error: any) {
      console.error('Error loading coaches:', error);
    }
  }, []);

  const loadClients = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Check if user is admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      const isAdminUser = !!roleData;

      // Build query - only show 1:1 clients (team plan members excluded)
      // SECURITY: Use profiles_public only - coaches cannot access email/phone/DOB
      let query = supabase
        .from('subscriptions')
        .select(`
          id,
          user_id,
          coach_id,
          profiles_public!inner(display_name, first_name),
          services!inner(name, type),
          coaches(first_name, last_name)
        `)
        .eq('status', 'active')
        .eq('services.type', 'one_to_one');

      // If not admin, filter by coach_id
      if (!isAdminUser) {
        query = query.eq('coach_id', user.id);
      }

      const { data, error } = await query;

      if (error) throw error;

      const clientsList = data?.map(sub => ({
        id: sub.id,
        user_id: sub.user_id,
        // Use display_name from profiles_public - no PII access
        display_name: (sub.profiles_public as any)?.display_name || (sub.profiles_public as any)?.first_name || 'Client',
        service_name: (sub.services as any).name,
        coach_name: sub.coaches ? `${(sub.coaches as any).first_name} ${(sub.coaches as any).last_name || ''}`.trim() : 'Unassigned',
        coach_id: sub.coach_id || undefined,
      })) || [];

      setClients(clientsList);
    } catch (error: any) {
      console.error('Error loading clients:', error);
      toast({
        title: "Error",
        description: "Failed to load clients",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const loadUser = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    setUser(user);
    if (user) {
      // Check if admin
      const { data: roleData } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id)
        .eq('role', 'admin')
        .maybeSingle();

      const adminStatus = !!roleData;
      setIsAdmin(adminStatus);

      if (adminStatus) {
        loadCoaches();
      }
      loadClients();
    }
  }, [loadCoaches, loadClients]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  useEffect(() => {
    if (selectedClient) {
      loadClientPhase();
    }
  }, [selectedClient, filter, loadClientPhase]);

  useEffect(() => {
    if (isAdmin) {
      loadCoaches();
    }
  }, [isAdmin, loadCoaches]);

  const loadClientPhase = useCallback(async () => {
    try {
      if (!selectedClient) return;

      const client = clients.find(c => c.user_id === selectedClient);
      if (!client) return;

      let query = supabase
        .from('nutrition_phases')
        .select('*')
        .eq('user_id', client.user_id)
        .order('created_at', { ascending: false });

      if (filter === 'active') {
        query = query.eq('is_active', true);
      } else if (filter === 'completed') {
        query = query.eq('is_active', false);
      } else if (filter === 'gaining') {
        query = query.eq('goal_type', 'muscle_gain').eq('is_active', true);
      } else if (filter === 'losing') {
        query = query.eq('goal_type', 'fat_loss').eq('is_active', true);
      } else if (filter === 'maintenance') {
        query = query.eq('goal_type', 'maintenance').eq('is_active', true);
      }

      const { data: phaseData, error: phaseError } = await query.maybeSingle();
      
      if (phaseError) throw phaseError;
      
      setActivePhase(phaseData);

      if (phaseData) {
        // Load phase stats
        const weeksSinceStart = Math.floor(
          (new Date().getTime() - new Date(phaseData.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
        ) + 1;

        const { data: latestWeight } = await supabase
          .from('weight_logs')
          .select('weight_kg')
          .eq('phase_id', phaseData.id)
          .order('log_date', { ascending: false })
          .limit(1)
          .maybeSingle();

        const { data: adjustments } = await supabase
          .from('nutrition_adjustments')
          .select('*')
          .eq('phase_id', phaseData.id)
          .eq('status', 'pending');

        setPhaseStats({
          currentWeek: weeksSinceStart,
          currentWeight: latestWeight?.weight_kg,
          pendingAdjustments: adjustments?.length || 0,
        });
      }
    } catch (error: any) {
      console.error('Error loading client phase:', error);
    }
  }, [selectedClient, clients, filter]);

  // Filter clients based on selected coach (admin only)
  const filteredClients = isAdmin && selectedCoach !== "all"
    ? clients.filter(client => client.coach_id === selectedCoach)
    : clients;

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Client Nutrition</h1>
        <p className="text-muted-foreground">Manage nutrition plans for your clients</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : clients.length === 0 && !isAdmin ? (
        <Card>
          <CardHeader>
            <CardTitle>No 1:1 Clients Assigned</CardTitle>
            <CardDescription>
              You don't have any active 1:1 clients assigned to you yet
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8 space-y-4">
              <div className="flex justify-center">
                <div className="p-4 rounded-full bg-muted">
                  <Filter className="h-8 w-8 text-muted-foreground" />
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-muted-foreground">
                  Once 1:1 clients are assigned to you, they will appear here and you can manage their nutrition plans.
                </p>
                <p className="text-sm text-muted-foreground">
                  Note: Team plan members are not shown here as their nutrition is managed differently.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {/* Client Selection and Filters */}
          <Card>
            <CardHeader>
              <CardTitle>Select Client</CardTitle>
              <CardDescription>Choose a 1:1 client to manage their nutrition plan (Team plan members excluded)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Client</label>
                  <Select value={selectedClient} onValueChange={setSelectedClient}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select a client" />
                    </SelectTrigger>
                    <SelectContent>
                      {filteredClients.length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          No clients found
                        </div>
                      ) : (
                        filteredClients.map(client => (
                          <SelectItem key={client.user_id} value={client.user_id}>
                          {client.display_name} ({client.service_name})
                          {isAdmin && client.coach_name && ` - ${client.coach_name}`}
                        </SelectItem>
                      ))
                      )}
                    </SelectContent>
                  </Select>
                </div>

                {isAdmin && (
                  <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Filter by Coach
                    </label>
                    <Select value={selectedCoach} onValueChange={setSelectedCoach}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Coaches</SelectItem>
                        {coaches.map(coach => (
                          <SelectItem key={coach.id} value={coach.user_id}>
                            {coach.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-2">
                    <label className="text-sm font-medium flex items-center gap-2">
                      <Filter className="h-4 w-4" />
                      Filter
                    </label>
                    <Select value={filter} onValueChange={setFilter}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="active">Active Phase</SelectItem>
                        <SelectItem value="completed">Completed</SelectItem>
                        <SelectItem value="gaining">Muscle Gain</SelectItem>
                        <SelectItem value="losing">Fat Loss</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {/* Quick Stats */}
                {selectedClient && activePhase && phaseStats && (
                  <div className="grid grid-cols-3 gap-4 pt-4 border-t">
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Current Calories</p>
                      <p className="text-2xl font-bold">{activePhase.daily_calories}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Phase Progress</p>
                      <p className="text-2xl font-bold">Week {phaseStats.currentWeek}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm text-muted-foreground">Pending Alerts</p>
                      <Badge variant={phaseStats.pendingAdjustments > 0 ? "destructive" : "secondary"}>
                        {phaseStats.pendingAdjustments}
                      </Badge>
                    </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Show message if coach filter is selected but no clients */}
          {isAdmin && selectedCoach !== "all" && filteredClients.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-8 space-y-4">
                  <div className="flex justify-center">
                    <div className="p-4 rounded-full bg-muted">
                      <Filter className="h-8 w-8 text-muted-foreground" />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="font-medium">No Clients Assigned</p>
                    <p className="text-muted-foreground">
                      {coaches.find(c => c.user_id === selectedCoach)?.name || 'This coach'} has no active clients assigned yet.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Client Tabs */}
          {selectedClient && (
              <Tabs defaultValue="progress" className="w-full">
                <TabsList className="grid w-full grid-cols-6">
                  <TabsTrigger value="goal">Goal</TabsTrigger>
                  <TabsTrigger value="progress">Progress</TabsTrigger>
                  <TabsTrigger value="diet-breaks">Diet Breaks</TabsTrigger>
                  <TabsTrigger value="steps">Steps</TabsTrigger>
                  <TabsTrigger value="graphs">Graphs</TabsTrigger>
                  <TabsTrigger value="notes">Notes</TabsTrigger>
                </TabsList>

                <TabsContent value="goal">
                  <CoachNutritionGoal 
                    clientUserId={selectedClient} 
                    phase={activePhase}
                    onPhaseUpdated={loadClientPhase}
                  />
                </TabsContent>

                <TabsContent value="progress">
                  {activePhase ? (
                    <CoachNutritionProgress phase={activePhase} onAdjustmentMade={loadClientPhase} />
                  ) : (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center space-y-2 py-4">
                          <p className="text-muted-foreground">
                            No measurements available for your coaching period.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Create a nutrition goal for this client to start tracking progress.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="diet-breaks">
                  {activePhase ? (
                    <div className="space-y-6">
                      <NutritionPermissionGate clientUserId={selectedClient}>
                        <DietBreakManager
                          phase={activePhase}
                          clientUserId={selectedClient}
                          canEdit={true}
                          onBreakUpdated={loadClientPhase}
                        />
                      </NutritionPermissionGate>
                      <NutritionPermissionGate clientUserId={selectedClient}>
                        <RefeedDayScheduler
                          phase={activePhase}
                          clientUserId={selectedClient}
                          canEdit={true}
                          onRefeedUpdated={loadClientPhase}
                        />
                      </NutritionPermissionGate>
                    </div>
                  ) : (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center space-y-2 py-4">
                          <p className="text-muted-foreground">
                            Create a nutrition goal first to manage diet breaks.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="steps">
                  <div className="space-y-6">
                    <StepProgressDisplay userId={selectedClient} />
                    <NutritionPermissionGate clientUserId={selectedClient}>
                      <StepRecommendationCard
                        clientUserId={selectedClient}
                        canEdit={true}
                        onRecommendationUpdated={loadClientPhase}
                      />
                    </NutritionPermissionGate>
                  </div>
                </TabsContent>

                <TabsContent value="graphs">
                  {activePhase ? (
                    <CoachNutritionGraphs phase={activePhase} />
                  ) : (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center space-y-2 py-4">
                          <p className="text-muted-foreground">
                            No measurements available for your coaching period.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Create a nutrition goal for this client to start tracking graphs.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                <TabsContent value="notes">
                  {activePhase ? (
                    <CoachNutritionNotes phase={activePhase} />
                  ) : (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="text-center space-y-2 py-4">
                          <p className="text-muted-foreground">
                            No measurements available for your coaching period.
                          </p>
                          <p className="text-sm text-muted-foreground">
                            Create a nutrition goal for this client to add notes.
                          </p>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>
              </Tabs>
          )}

          {!selectedClient && filteredClients.length > 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="text-muted-foreground text-center">
                  Select a client to view and manage their nutrition plan
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
