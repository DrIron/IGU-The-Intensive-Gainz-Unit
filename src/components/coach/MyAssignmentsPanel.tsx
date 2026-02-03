import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, CalendarClock, ChevronRight,
  Apple, Heart, Dumbbell, Medal, 
  PersonStanding, Accessibility, Activity,
  MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { DischargeSpecialistDialog } from "./DischargeSpecialistDialog";
import type { Database } from "@/integrations/supabase/types";

type StaffSpecialty = Database["public"]["Enums"]["staff_specialty"];
type CareTeamStatus = Database["public"]["Enums"]["care_team_status"];

interface Assignment {
  id: string;
  client_id: string;
  subscription_id: string;
  specialty: StaffSpecialty;
  scope: string;
  lifecycle_status: CareTeamStatus;
  active_from: string;
  active_until: string | null;
  is_billable: boolean;
  client_name: string;
  client_avatar: string | null;
  next_billing_date: string | null;
}

const SPECIALTY_CONFIG: Record<StaffSpecialty, { label: string; icon: React.ElementType; color: string }> = {
  nutrition: { label: "Nutrition", icon: Apple, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  lifestyle: { label: "Lifestyle", icon: Heart, color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  bodybuilding: { label: "Bodybuilding", icon: Dumbbell, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  powerlifting: { label: "Powerlifting", icon: Medal, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  running: { label: "Running", icon: PersonStanding, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  calisthenics: { label: "Calisthenics", icon: Accessibility, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  mobility: { label: "Mobility", icon: Activity, color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  physiotherapy: { label: "Physiotherapy", icon: Heart, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

interface MyAssignmentsPanelProps {
  onClientSelect?: (clientId: string) => void;
}

export function MyAssignmentsPanel({ onClientSelect }: MyAssignmentsPanelProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [dischargingAssignment, setDischargingAssignment] = useState<Assignment | null>(null);

  const fetchAssignments = useCallback(async () => {
    try {
      setLoading(true);
      
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Fetch assignments where current user is the specialist (not primary coach)
      const { data, error } = await supabase
        .from("care_team_assignments")
        .select(`
          id,
          client_id,
          subscription_id,
          specialty,
          scope,
          lifecycle_status,
          active_from,
          active_until,
          is_billable
        `)
        .eq("staff_user_id", user.id)
        .in("lifecycle_status", ["active", "scheduled_end"])
        .order("active_from", { ascending: false });

      if (error) throw error;

      if (data && data.length > 0) {
        // Fetch client info and subscription details
        const clientIds = [...new Set(data.map(a => a.client_id))];
        const subscriptionIds = [...new Set(data.map(a => a.subscription_id))];

        const [clientsResult, subscriptionsResult] = await Promise.all([
          supabase.from("profiles_public").select("id, display_name, first_name, avatar_url").in("id", clientIds),
          supabase.from("subscriptions").select("id, next_billing_date").in("id", subscriptionIds)
        ]);

        const clientMap = new Map(clientsResult.data?.map(c => [c.id, c]) || []);
        const subMap = new Map(subscriptionsResult.data?.map(s => [s.id, s]) || []);

        const enrichedData: Assignment[] = data.map(assignment => {
          const client = clientMap.get(assignment.client_id);
          const subscription = subMap.get(assignment.subscription_id);
          return {
            ...assignment,
            client_name: client?.display_name || client?.first_name || 'Client',
            client_avatar: client?.avatar_url || null,
            next_billing_date: subscription?.next_billing_date || null
          };
        });

        setAssignments(enrichedData);
      } else {
        setAssignments([]);
      }
    } catch (error: any) {
      console.error("Error fetching assignments:", error);
      toast({
        title: "Error",
        description: "Failed to load your assignments",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            My Care Team Assignments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (assignments.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            My Care Team Assignments
          </CardTitle>
          <CardDescription>
            Clients you're assigned to as a specialist
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">No care team assignments yet</p>
            <p className="text-xs mt-1">You'll see clients here when assigned as a specialist</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            My Care Team Assignments
          </CardTitle>
          <CardDescription>
            Clients you're assigned to as a specialist ({assignments.length})
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {assignments.map((assignment) => {
              const config = SPECIALTY_CONFIG[assignment.specialty];
              const Icon = config?.icon || Users;
              const isScheduledEnd = assignment.lifecycle_status === 'scheduled_end';

              return (
                <div 
                  key={assignment.id}
                  className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted/70 transition-colors"
                >
                  <Avatar className="h-10 w-10 cursor-pointer" onClick={() => onClientSelect?.(assignment.client_id)}>
                    <AvatarImage src={assignment.client_avatar || undefined} />
                    <AvatarFallback>{getInitials(assignment.client_name)}</AvatarFallback>
                  </Avatar>
                  
                  <div className="flex-1 min-w-0">
                    <p 
                      className="font-medium truncate cursor-pointer hover:text-primary transition-colors"
                      onClick={() => onClientSelect?.(assignment.client_id)}
                    >
                      {assignment.client_name}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Icon className="h-3 w-3" />
                      <span>{config?.label || assignment.specialty}</span>
                      <span>•</span>
                      <span>{assignment.scope === 'write' ? 'Full access' : 'View only'}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {isScheduledEnd && assignment.active_until ? (
                      <Badge variant="secondary" className="gap-1">
                        <CalendarClock className="h-3 w-3" />
                        Ends {format(new Date(assignment.active_until), "MMM d")}
                      </Badge>
                    ) : (
                      <>
                        <Badge className={config?.color || "bg-muted"}>
                          Active
                        </Badge>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDischargingAssignment(assignment)}>
                              <CalendarClock className="h-4 w-4 mr-2" />
                              End at renewal
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </>
                    )}
                    
                    {onClientSelect && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onClientSelect(assignment.client_id)}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Self-Discharge Dialog */}
      {dischargingAssignment && (
        <DischargeSpecialistDialog
          open={!!dischargingAssignment}
          onOpenChange={(open) => !open && setDischargingAssignment(null)}
          assignmentId={dischargingAssignment.id}
          specialistName="yourself"
          specialty={SPECIALTY_CONFIG[dischargingAssignment.specialty]?.label || dischargingAssignment.specialty}
          nextBillingDate={dischargingAssignment.next_billing_date}
          onSuccess={fetchAssignments}
        />
      )}
    </>
  );
}
