import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Users, Crown, Apple, Heart, Dumbbell, Medal,
  PersonStanding, Accessibility, Activity, CalendarClock,
  MoreHorizontal, MessageSquare
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
  short_bio: string | null;
  specializations: string[] | null;
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
  dietitian: { label: "Dietitian", icon: Apple, color: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" },
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

  // Primary coach WhatsApp (folded in from the retired CoachCard, 1B) — read via the
  // SECURITY DEFINER RPC so the client can reach it without direct access to coaches_private.
  const [coachWhatsApp, setCoachWhatsApp] = useState<string | null>(null);
  const whatsappFetched = useRef(false);
  useEffect(() => {
    const coachId = primaryCoach?.user_id;
    if (whatsappFetched.current || !coachId) return;
    whatsappFetched.current = true;
    supabase.rpc("get_coach_whatsapp_for_client", { p_coach_user_id: coachId }).then(({ data }) => {
      if (typeof data === "string" && data.trim()) setCoachWhatsApp(data);
    });
  }, [primaryCoach?.user_id]);

  const fetchCareTeam = useCallback(async () => {
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
        // Enrich each member from the client-safe sources: coaches_directory for coach-specialists,
        // and dietitians_client_safe for credentialed dietitians (specialty='dietitian') -- which a
        // pure dietitian only appears in (they have no coaches_directory row). Both are gated so the
        // client only sees staff on their own care team.
        const staffUserIds = data.map(m => m.staff_user_id);
        const [{ data: coachesData }, { data: dietitiansData }] = await Promise.all([
          supabase
            .from("coaches_directory")
            .select("user_id, first_name, last_name, profile_picture_url")
            .in("user_id", staffUserIds),
          supabase
            .from("dietitians_client_safe")
            .select("user_id, first_name, display_name, profile_picture_url, short_bio, specializations")
            .in("user_id", staffUserIds),
        ]);

        const coachMap = new Map(coachesData?.map(c => [c.user_id, c]) || []);
        const dietMap = new Map(dietitiansData?.map(d => [d.user_id, d]) || []);

        const enrichedData: CareTeamMember[] = data.map(member => {
          const coach = coachMap.get(member.staff_user_id);
          const diet = dietMap.get(member.staff_user_id);
          // Prefer the dietitian profile for a dietitian assignment; otherwise the coach directory.
          const primary = member.specialty === "dietitian" ? (diet ?? coach) : (coach ?? diet);
          const name = diet && member.specialty === "dietitian"
            ? (diet.display_name || diet.first_name || "Specialist")
            : coach
              ? `${coach.first_name} ${coach.last_name || ""}`.trim()
              : (diet?.display_name || diet?.first_name || "Specialist");
          return {
            ...member,
            staff_name: name || "Specialist",
            profile_picture_url: primary?.profile_picture_url || null,
            short_bio: diet?.short_bio ?? null,
            specializations: diet?.specializations ?? null,
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
  }, [subscriptionId]);

  useEffect(() => {
    fetchCareTeam();
  }, [fetchCareTeam]);

  const getInitials = (name: string) => {
    return name.split(' ').map(n => n.charAt(0)).join('').toUpperCase().slice(0, 2);
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Your team
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
            Your team
          </CardTitle>
          <CardDescription>
            Your dedicated coaching team
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Primary Coach - Always shown first */}
            {primaryCoach && (
              <div className="space-y-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
                <div className="flex items-center gap-3">
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

                {/* Coach contact (folded in from CoachCard, 1B): WhatsApp deep-link when the coach
                    has set a number, else the generic "will reach out" note. Behaviour/copy
                    unchanged from the retired card. */}
                {coachWhatsApp ? (
                  <a
                    href={`https://wa.me/${coachWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${primaryCoach.first_name}, `)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: "#25D366" }}
                    aria-label={`Message ${primaryCoach.first_name} on WhatsApp`}
                  >
                    <WhatsappIcon className="h-4 w-4" />
                    Message on WhatsApp
                  </a>
                ) : (
                  <div className="flex items-start gap-2 p-3 rounded-md bg-background/60 border border-primary/10">
                    <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
                    <p className="text-xs text-muted-foreground">
                      Your coach will reach out to you directly.
                    </p>
                  </div>
                )}
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
                    <div className="flex-1 min-w-0">
                      <p className="font-medium">{member.staff_name}</p>
                      <div className="flex items-center gap-2">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        <span className="text-sm text-muted-foreground">
                          {config?.label || member.specialty}
                        </span>
                      </div>
                      {member.short_bio && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{member.short_bio}</p>
                      )}
                      {member.specializations && member.specializations.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {member.specializations.slice(0, 4).map((s) => (
                            <Badge key={s} variant="outline" className="text-[10px] px-1.5 py-0">{s}</Badge>
                          ))}
                        </div>
                      )}
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

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.512 5.26l-.999 3.648 3.736-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.206-.242-.578-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414z"/>
    </svg>
  );
}
