import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, Crown, Apple, Heart, Dumbbell, Medal, 
  PersonStanding, Accessibility, Activity, CalendarClock,
  MoreHorizontal
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EndAddonDialog } from "./EndAddonDialog";
import { format } from "date-fns";
import type { Database } from "@/integrations/supabase/types";

type StaffSpecialty = Database["public"]["Enums"]["staff_specialty"];
type CareTeamStatus = Database["public"]["Enums"]["care_team_status"];

interface CareTeamMember {
  id: string;
  staff_user_id: string;
  specialty: StaffSpecialty;
  scope: string;
  lifecycle_status: CareTeamStatus;
  active_until: string | null;
  is_billable: boolean;
  staff_name: string;
  profile_picture_url: string | null;
}

interface PrimaryCoach {
  user_id: string;
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
}

interface MyCareTeamCardProps {
  subscriptionId: string;
  primaryCoach?: PrimaryCoach | null;
  nextBillingDate?: string | null;
}

const SPECIALTY_CONFIG: Record<StaffSpecialty, { label: string; icon: React.ElementType; color: string }> = {
  nutrition: { label: "Nutrition Coach", icon: Apple, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
  lifestyle: { label: "Lifestyle Coach", icon: Heart, color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400" },
  bodybuilding: { label: "Bodybuilding Coach", icon: Dumbbell, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400" },
  powerlifting: { label: "Powerlifting Coach", icon: Medal, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400" },
  running: { label: "Running Coach", icon: PersonStanding, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  calisthenics: { label: "Calisthenics Coach", icon: Accessibility, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400" },
  mobility: { label: "Mobility Coach", icon: Activity, color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400" },
  physiotherapy: { label: "Physiotherapist", icon: Heart, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
};

export function MyCareTeamCard({ subscriptionId, primaryCoach, nextBillingDate }: MyCareTeamCardProps) {
  const [loading, setLoading] = useState(true);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [endingAddon, setEndingAddon] = useState<CareTeamMember | null>(null);

  useEffect(() => {
    fetchCareTeam();
  }, [subscriptionId]);

  const fetchCareTeam = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from("care_team_assignments")
        .select(`
          id,
          staff_user_id,
          specialty,
          scope,
          lifecycle_status,
          active_until,
          is_billable
        `)
        .eq("subscription_id", subscriptionId)
        .in("lifecycle_status", ["active", "scheduled_end"])
        .order("added_at", { ascending: true });

      if (error) throw error;

      if (data && data.length > 0) {
        // Fetch coach info for each staff member - use coaches_directory (public-safe view)
        const staffUserIds = data.map(m => m.staff_user_id);
        const { data: coachesData } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name, profile_picture_url")
          .in("user_id", staffUserIds);

        const coachMap = new Map(coachesData?.map(c => [c.user_id, c]) || []);
        
        const enrichedData: CareTeamMember[] = data.map(member => {
          const coach = coachMap.get(member.staff_user_id);
          return {
            ...member,
            staff_name: coach ? `${coach.first_name} ${coach.last_name || ''}`.trim() : 'Specialist',
            profile_picture_url: coach?.profile_picture_url || null
          };
        });

        setCareTeam(enrichedData);
      } else {
        setCareTeam([]);
      }
    } catch (error) {
      console.error("Error fetching care team:", error);
    } finally {
      setLoading(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            My Care Team
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-14 w-full" />
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="h-5 w-5" />
            My Care Team
          </CardTitle>
          <CardDescription>
            Your dedicated coaching team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Primary Coach - Always shown first */}
            {primaryCoach && (
              <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                <Avatar className="h-12 w-12">
                  <AvatarImage src={primaryCoach.profile_picture_url || undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary font-semibold">
                    {getInitials(`${primaryCoach.first_name} ${primaryCoach.last_name || ''}`)}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-semibold">
                    {primaryCoach.first_name} {primaryCoach.last_name || ''}
                  </p>
                  <div className="flex items-center gap-2">
                    <Crown className="h-3.5 w-3.5 text-primary" />
                    <span className="text-sm text-primary font-medium">Primary Coach</span>
                  </div>
                </div>
              </div>
            )}

            {/* Care Team Members */}
            {careTeam.length === 0 ? (
              <div className="text-center py-4 text-muted-foreground">
                <p className="text-sm">No additional specialists assigned yet</p>
              </div>
            ) : (
              careTeam.map((member) => {
                const config = SPECIALTY_CONFIG[member.specialty];
                const Icon = config?.icon || Users;
                const isScheduledEnd = member.lifecycle_status === 'scheduled_end';
                
                return (
                  <div 
                    key={member.id}
                    className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg"
                  >
                    <Avatar className="h-10 w-10">
                      <AvatarImage src={member.profile_picture_url || undefined} />
                      <AvatarFallback className="bg-muted">
                        {getInitials(member.staff_name)}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1">
                      <p className="font-medium">{member.staff_name}</p>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {config?.label || member.specialty}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isScheduledEnd && member.active_until ? (
                        <Badge variant="secondary" className="gap-1">
                          <CalendarClock className="h-3 w-3" />
                          Ends {format(new Date(member.active_until), "MMM d")}
                        </Badge>
                      ) : (
                        <>
                          <Badge className={config?.color || "bg-muted"} variant="secondary">
                            {config?.label.split(' ')[0] || member.specialty}
                          </Badge>
                          {member.is_billable && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setEndingAddon(member)}>
                                  <CalendarClock className="h-4 w-4 mr-2" />
                                  End add-on at renewal
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      {/* End Addon Dialog */}
      {endingAddon && (
        <EndAddonDialog
          open={!!endingAddon}
          onOpenChange={(open) => !open && setEndingAddon(null)}
          assignmentId={endingAddon.id}
          specialistName={endingAddon.staff_name}
          specialty={SPECIALTY_CONFIG[endingAddon.specialty]?.label || endingAddon.specialty}
          nextBillingDate={nextBillingDate}
          onSuccess={fetchCareTeam}
        />
      )}
    </>
  );
}
