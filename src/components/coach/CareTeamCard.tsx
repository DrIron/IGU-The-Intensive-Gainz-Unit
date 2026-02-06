import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Users, UserPlus, Crown, CalendarClock, AlertTriangle,
  Apple, Heart, Dumbbell, Medal, 
  PersonStanding, Accessibility, Activity,
  MoreHorizontal
} from "lucide-react";
import { AddSpecialistDialog } from "./AddSpecialistDialog";
import { DischargeSpecialistDialog, TerminateSpecialistDialog } from "./DischargeSpecialistDialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type CareTeamStatus = Database["public"]["Enums"]["care_team_status"];

// Type for staff specialty
type StaffSpecialty =
  | 'nutrition'
  | 'lifestyle'
  | 'bodybuilding'
  | 'powerlifting'
  | 'running'
  | 'calisthenics'
  | 'mobility'
  | 'physiotherapy'
  | 'dietitian';

interface CareTeamMember {
  id: string;
  staff_user_id: string;
  specialty: StaffSpecialty;
  scope: string;
  is_billable: boolean;
  status: string;
  lifecycle_status: CareTeamStatus;
  active_from: string;
  active_until: string | null;
  added_at: string;
  addon_id: string | null;
  staff_profile?: {
    first_name: string | null;
    last_name: string | null;
  };
  coach_info?: {
    first_name: string;
    last_name: string | null;
    profile_picture_url: string | null;
  };
}

interface PrimaryCoach {
  user_id: string;
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
  specializations: string[] | null;
}

interface CareTeamCardProps {
  clientId: string;
  subscriptionId: string;
  primaryCoach?: PrimaryCoach | null;
  isPrimaryCoach?: boolean;
  isAdmin?: boolean;
  nextBillingDate?: string | null;
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
  dietitian: { label: "Dietitian", icon: Apple, color: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
};

export function CareTeamCard({ 
  clientId, 
  subscriptionId, 
  primaryCoach, 
  isPrimaryCoach = false,
  isAdmin = false,
  nextBillingDate = null
}: CareTeamCardProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dischargingMember, setDischargingMember] = useState<CareTeamMember | null>(null);
  const [terminatingMember, setTerminatingMember] = useState<CareTeamMember | null>(null);

  const canManageTeam = isPrimaryCoach || isAdmin;

  const fetchCareTeam = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch care team assignments with lifecycle fields
      const { data, error } = await supabase
        .from("care_team_assignments")
        .select(`
          id,
          staff_user_id,
          specialty,
          scope,
          is_billable,
          addon_id,
          status,
          lifecycle_status,
          active_from,
          active_until,
          added_at
        `)
        .eq("subscription_id", subscriptionId)
        .in("lifecycle_status", ["active", "scheduled_end"])
        .order("added_at", { ascending: true });

      if (error) throw error;

      // Fetch staff info from coaches_client_safe (care team staff are coaches)
      // NOT profiles_public - RLS would block since these are staff, not clients
      if (data && data.length > 0) {
        const staffUserIds = data.map(m => m.staff_user_id);
        
        // Staff are coaches - use coaches_client_safe which has name and profile picture
        const { data: coachesData } = await supabase
          .from("coaches_client_safe")
          .select("user_id, first_name, last_name, profile_picture_url")
          .in("user_id", staffUserIds);

        const coachMap = new Map(coachesData?.map(c => [c.user_id, c]) || []);
        
        const enrichedData = data.map(member => {
          const coach = coachMap.get(member.staff_user_id);
          return {
            ...member,
            staff_profile: { 
              first_name: coach?.first_name || 'Staff', 
              last_name: coach?.last_name || '' 
            },
            coach_info: coach || undefined
          };
        });

        setCareTeam(enrichedData as unknown as CareTeamMember[]);
      } else {
        setCareTeam([]);
      }
    } catch (error: any) {
      console.error("Error fetching care team:", error);
      toast({
        title: "Error",
        description: "Failed to load care team",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [subscriptionId, toast]);

  useEffect(() => {
    fetchCareTeam();
  }, [fetchCareTeam]);

  const getMemberName = (member: CareTeamMember) => {
    if (member.coach_info) {
      return `${member.coach_info.first_name} ${member.coach_info.last_name || ''}`.trim();
    }
    if (member.staff_profile) {
      return `${member.staff_profile.first_name || ''} ${member.staff_profile.last_name || ''}`.trim() || 'Staff';
    }
    return "Unknown";
  };

  const getStatusBadge = (member: CareTeamMember) => {
    if (member.lifecycle_status === 'scheduled_end' && member.active_until) {
      return (
        <Badge variant="secondary" className="gap-1">
          <CalendarClock className="h-3 w-3" />
          Ends {format(new Date(member.active_until), "MMM d")}
        </Badge>
      );
    }
    return null;
  };

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <Users className="h-5 w-5" />
                Care Team
              </CardTitle>
              <CardDescription>
                Primary coach and specialists assigned to this client
              </CardDescription>
            </div>
            {canManageTeam && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddDialog(true)}
                className="gap-2"
              >
                <UserPlus className="h-4 w-4" />
                Add Specialist
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Primary Coach */}
            {primaryCoach && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
                    {primaryCoach.profile_picture_url ? (
                      <img 
                        src={primaryCoach.profile_picture_url} 
                        alt={primaryCoach.first_name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      <Crown className="h-5 w-5 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {primaryCoach.first_name} {primaryCoach.last_name || ''}
                    </p>
                    <p className="text-xs text-muted-foreground">Primary Coach</p>
                  </div>
                </div>
                <Badge variant="default" className="gap-1">
                  <Crown className="h-3 w-3" />
                  Primary
                </Badge>
              </div>
            )}

            {/* Care Team Members */}
            {loading ? (
              <div className="text-center py-4 text-muted-foreground">
                <div className="animate-pulse">Loading care team...</div>
              </div>
            ) : careTeam.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p className="text-sm">No specialists assigned yet</p>
                {canManageTeam && (
                  <p className="text-xs mt-1">Click "Add Specialist" to build the care team</p>
                )}
              </div>
            ) : (
              careTeam.map((member) => {
                const config = SPECIALTY_CONFIG[member.specialty];
                const Icon = config?.icon || Users;
                
                return (
                  <div 
                    key={member.id}
                    className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        {member.coach_info?.profile_picture_url ? (
                          <img 
                            src={member.coach_info.profile_picture_url} 
                            alt={getMemberName(member)}
                            className="h-10 w-10 rounded-full object-cover"
                          />
                        ) : (
                          <Icon className="h-5 w-5 text-muted-foreground" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{getMemberName(member)}</p>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          <span>{member.scope === 'write' ? 'Full access' : 'View only'}</span>
                          {member.is_billable && (
                            <span className="text-primary">• Billed</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {getStatusBadge(member)}
                      <Badge className={config?.color || "bg-muted"}>
                        {config?.label || member.specialty}
                      </Badge>
                      {canManageTeam && member.lifecycle_status === 'active' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground"
                            >
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setDischargingMember(member)}>
                              <CalendarClock className="h-4 w-4 mr-2" />
                              End at renewal
                            </DropdownMenuItem>
                            {isAdmin && (
                              <>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem 
                                  className="text-destructive focus:text-destructive"
                                  onClick={() => setTerminatingMember(member)}
                                >
                                  <AlertTriangle className="h-4 w-4 mr-2" />
                                  Terminate (for cause)
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* Add Specialist Dialog */}
      <AddSpecialistDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        clientId={clientId}
        subscriptionId={subscriptionId}
        existingTeam={careTeam}
        onSuccess={fetchCareTeam}
      />

      {/* Discharge (end at renewal) Dialog */}
      {dischargingMember && (
        <DischargeSpecialistDialog
          open={!!dischargingMember}
          onOpenChange={(open) => !open && setDischargingMember(null)}
          assignmentId={dischargingMember.id}
          specialistName={getMemberName(dischargingMember)}
          specialty={SPECIALTY_CONFIG[dischargingMember.specialty]?.label || dischargingMember.specialty}
          nextBillingDate={nextBillingDate}
          onSuccess={fetchCareTeam}
        />
      )}

      {/* Terminate (for cause) Dialog - Admin only */}
      {terminatingMember && (
        <TerminateSpecialistDialog
          open={!!terminatingMember}
          onOpenChange={(open) => !open && setTerminatingMember(null)}
          assignmentId={terminatingMember.id}
          specialistName={getMemberName(terminatingMember)}
          specialty={SPECIALTY_CONFIG[terminatingMember.specialty]?.label || terminatingMember.specialty}
          onSuccess={fetchCareTeam}
        />
      )}
    </>
  );
}
