import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Crown, DollarSign,
  Apple, Heart, Dumbbell, Medal, 
  PersonStanding, Accessibility, Activity
} from "lucide-react";
import type { Database } from "@/integrations/supabase/types";

type StaffSpecialty = Database["public"]["Enums"]["staff_specialty"];

interface CareTeamMember {
  id: string;
  staff_user_id: string;
  specialty: StaffSpecialty;
  scope: string;
  is_billable: boolean;
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
}

interface MyTeamCardProps {
  userId: string;
  subscriptionId?: string;
  primaryCoach?: PrimaryCoach | null;
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

export function MyTeamCard({ userId, subscriptionId, primaryCoach }: MyTeamCardProps) {
  const [loading, setLoading] = useState(true);
  const [careTeam, setCareTeam] = useState<CareTeamMember[]>([]);

  useEffect(() => {
    if (subscriptionId) {
      fetchCareTeam();
    } else {
      setLoading(false);
    }
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
          is_billable
        `)
        .eq("client_id", userId)
        .eq("status", "active")
        .order("added_at", { ascending: true });

      if (error) throw error;

      // Fetch coach info for each staff member
      if (data && data.length > 0) {
        const staffUserIds = data.map(m => m.staff_user_id);
        // Use coaches_directory (public-safe view) for client-facing coach list
        const { data: coachesData } = await supabase
          .from("coaches_directory")
          .select("user_id, first_name, last_name, profile_picture_url")
          .in("user_id", staffUserIds);

        const coachMap = new Map(coachesData?.map(c => [c.user_id, c]) || []);
        
        const enrichedData = data.map(member => ({
          ...member,
          coach_info: coachMap.get(member.staff_user_id) || undefined
        }));

        setCareTeam(enrichedData as CareTeamMember[]);
      } else {
        setCareTeam([]);
      }
    } catch (error: any) {
      console.error("Error fetching care team:", error);
    } finally {
      setLoading(false);
    }
  };

  const getMemberName = (member: CareTeamMember) => {
    if (member.coach_info) {
      return `${member.coach_info.first_name} ${member.coach_info.last_name || ''}`.trim();
    }
    return "Specialist";
  };

  const hasTeam = primaryCoach || careTeam.length > 0;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Users className="h-5 w-5" />
          Your Care Team
        </CardTitle>
        <CardDescription>
          Your coaching team dedicated to your success
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-4 text-muted-foreground">
            <div className="animate-pulse">Loading your team...</div>
          </div>
        ) : !hasTeam ? (
          <div className="text-center py-6 text-muted-foreground">
            <Users className="h-10 w-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Your care team will appear here once assigned</p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Primary Coach - Always included in plan */}
            {primaryCoach && (
              <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                    {primaryCoach.profile_picture_url ? (
                      <img 
                        src={primaryCoach.profile_picture_url} 
                        alt={primaryCoach.first_name}
                        className="h-12 w-12 rounded-full object-cover"
                      />
                    ) : (
                      <Crown className="h-6 w-6 text-primary" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium">
                      {primaryCoach.first_name} {primaryCoach.last_name || ''}
                    </p>
                    <p className="text-sm text-muted-foreground">Your Primary Coach</p>
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge variant="default" className="gap-1">
                    <Crown className="h-3 w-3" />
                    Primary
                  </Badge>
                  <span className="text-xs text-muted-foreground">Included</span>
                </div>
              </div>
            )}

            {/* Care Team Specialists */}
            {careTeam.map((member) => {
              const config = SPECIALTY_CONFIG[member.specialty];
              const Icon = config?.icon || Users;
              
              return (
                <div 
                  key={member.id}
                  className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                >
                  <div className="flex items-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                      {member.coach_info?.profile_picture_url ? (
                        <img 
                          src={member.coach_info.profile_picture_url} 
                          alt={getMemberName(member)}
                          className="h-12 w-12 rounded-full object-cover"
                        />
                      ) : (
                        <Icon className="h-6 w-6 text-muted-foreground" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium">{getMemberName(member)}</p>
                      <p className="text-sm text-muted-foreground">{config?.label || member.specialty} Specialist</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={config?.color || "bg-muted"}>
                      {config?.label || member.specialty}
                    </Badge>
                    {member.is_billable ? (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <DollarSign className="h-3 w-3" />
                        Billed monthly
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Included</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}