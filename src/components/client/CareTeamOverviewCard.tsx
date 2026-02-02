import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  Users, Crown, CalendarClock, CheckCircle2,
  Apple, Heart, Dumbbell, Medal, 
  PersonStanding, Accessibility, Activity,
  Boxes
} from "lucide-react";
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

interface ServiceModules {
  includes_primary_coaching: boolean;
  includes_nutrition_support: boolean;
  includes_specialty_support: boolean;
  includes_physio_support: boolean;
}

interface CareTeamOverviewCardProps {
  subscriptionId: string;
  primaryCoach?: PrimaryCoach | null;
}

const SPECIALTY_CONFIG: Record<StaffSpecialty, { label: string; icon: React.ElementType; color: string; moduleKey?: keyof ServiceModules }> = {
  nutrition: { label: "Nutrition", icon: Apple, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400", moduleKey: "includes_nutrition_support" },
  lifestyle: { label: "Lifestyle", icon: Heart, color: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400", moduleKey: "includes_specialty_support" },
  bodybuilding: { label: "Bodybuilding", icon: Dumbbell, color: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400", moduleKey: "includes_specialty_support" },
  powerlifting: { label: "Powerlifting", icon: Medal, color: "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400", moduleKey: "includes_specialty_support" },
  running: { label: "Running", icon: PersonStanding, color: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400", moduleKey: "includes_specialty_support" },
  calisthenics: { label: "Calisthenics", icon: Accessibility, color: "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400", moduleKey: "includes_specialty_support" },
  mobility: { label: "Mobility", icon: Activity, color: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-400", moduleKey: "includes_specialty_support" },
  physiotherapy: { label: "Physiotherapy", icon: Heart, color: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400", moduleKey: "includes_physio_support" },
};

export function CareTeamOverviewCard({ subscriptionId, primaryCoach }: CareTeamOverviewCardProps) {
  const [loading, setLoading] = useState(true);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);
  const [serviceModules, setServiceModules] = useState<ServiceModules | null>(null);

  const fetchCareTeamAndModules = useCallback(async () => {
    try {
      setLoading(true);
      
      // Fetch care team assignments and service modules in parallel
      const [careTeamResult, subscriptionResult] = await Promise.all([
        supabase
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
          .order("added_at", { ascending: true }),
        supabase
          .from("subscriptions")
          .select(`
            service_id,
            services (
              includes_primary_coaching,
              includes_nutrition_support,
              includes_specialty_support,
              includes_physio_support
            )
          `)
          .eq("id", subscriptionId)
          .single()
      ]);

      if (careTeamResult.error) throw careTeamResult.error;
      
      // Extract service modules
      if (subscriptionResult.data?.services) {
        const service = subscriptionResult.data.services as any;
        setServiceModules({
          includes_primary_coaching: service.includes_primary_coaching ?? false,
          includes_nutrition_support: service.includes_nutrition_support ?? false,
          includes_specialty_support: service.includes_specialty_support ?? false,
          includes_physio_support: service.includes_physio_support ?? false,
        });
      }

      if (careTeamResult.data && careTeamResult.data.length > 0) {
        // Fetch coach info for each staff member
        const staffUserIds = careTeamResult.data.map(m => m.staff_user_id);
        const { data: coachesData } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name, profile_picture_url")
          .in("user_id", staffUserIds);

        const coachMap = new Map(coachesData?.map(c => [c.user_id, c]) || []);
        
        const enrichedData: CareTeamMember[] = careTeamResult.data.map(member => {
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
      console.error("Error fetching care team overview:", error);
    } finally {
      setLoading(false);
    }
  }, [subscriptionId]);

  useEffect(() => {
    fetchCareTeamAndModules();
  }, [fetchCareTeamAndModules]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
  };

  // Get enabled module types from the service
  const getEnabledModuleTypes = () => {
    if (!serviceModules) return [];
    const types: { label: string; icon: React.ElementType }[] = [];
    
    if (serviceModules.includes_primary_coaching) {
      types.push({ label: "Primary Coaching", icon: Crown });
    }
    if (serviceModules.includes_nutrition_support) {
      types.push({ label: "Nutrition Support", icon: Apple });
    }
    if (serviceModules.includes_specialty_support) {
      types.push({ label: "Specialty Support", icon: Dumbbell });
    }
    if (serviceModules.includes_physio_support) {
      types.push({ label: "Physio Support", icon: Heart });
    }
    
    return types;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Care Team Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-12 w-full" />
        </CardContent>
      </Card>
    );
  }

  const enabledModules = getEnabledModuleTypes();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Care Team Overview
        </CardTitle>
        <CardDescription>
          Your coaching team and enabled support modules
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Team Members Section */}
        <div className="space-y-3">
          {/* Primary Coach */}
          {primaryCoach && (
            <div className="flex items-center gap-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
              <Avatar className="h-10 w-10">
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
              <Badge variant="default" className="gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Active
              </Badge>
            </div>
          )}

          {/* Add-on Specialists */}
          {careTeam.map((member) => {
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
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Icon className="h-3 w-3" />
                    <span>{config?.label || member.specialty}</span>
                    {member.is_billable && (
                      <>
                        <span>•</span>
                        <span className="text-primary">Add-on</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {isScheduledEnd && member.active_until ? (
                    <Badge variant="secondary" className="gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Ends {format(new Date(member.active_until), "MMM d")}
                    </Badge>
                  ) : (
                    <Badge className={config?.color || "bg-muted"} variant="secondary">
                      Active
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}

          {careTeam.length === 0 && !primaryCoach && (
            <div className="text-center py-4 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No care team assigned yet</p>
            </div>
          )}
        </div>

        {/* Enabled Module Types Section */}
        {enabledModules.length > 0 && (
          <div className="pt-3 border-t">
            <div className="flex items-center gap-2 mb-3">
              <Boxes className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Enabled Support Modules</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {enabledModules.map((module, idx) => {
                const Icon = module.icon;
                return (
                  <Badge key={idx} variant="outline" className="gap-1">
                    <Icon className="h-3 w-3" />
                    {module.label}
                  </Badge>
                );
              })}
            </div>
          </div>
        )}

        {/* Summary Stats */}
        <div className="pt-3 border-t">
          <div className="grid grid-cols-2 gap-4 text-center">
            <div>
              <p className="text-2xl font-bold text-primary">
                {(primaryCoach ? 1 : 0) + careTeam.length}
              </p>
              <p className="text-xs text-muted-foreground">Team Members</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-primary">
                {careTeam.filter(m => m.is_billable).length}
              </p>
              <p className="text-xs text-muted-foreground">Active Add-ons</p>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
