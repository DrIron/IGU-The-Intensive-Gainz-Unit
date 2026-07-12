import { useState, useEffect, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";

import { Card } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, CheckCircle2, AlertCircle, Users, Star, Eye, MapPin } from "lucide-react";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";
import { CoachDetailDialog } from "@/components/CoachDetailDialog";
import { deriveCoachHeadline } from "@/components/coach/CoachPublicProfile";

interface Coach {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  /** Deep-links the profile dialog to the public /coaches/:slug page. */
  slug: string | null;
  profile_picture_url: string | null;
  short_bio: string | null;
  bio: string | null;
  specializations: string[] | null;
  // Public profile fields (ON2) — the same set get_coach_public_profile_by_slug
  // already serves anon on /coaches/:slug. Every one is null-omitted by
  // CoachPublicProfile, so a half-filled coach renders no empty headers.
  location: string | null;
  qualifications: string[] | null;
  intro_video_url: string | null;
  years_experience: number | null;
  is_head_coach: boolean | null;
  head_coach_specialisation: string | null;
  coach_level: string | null;
  socials: { instagram?: string | null; tiktok?: string | null; youtube?: string | null; snapchat?: string | null } | null;
  gyms: { id: string; name: string }[] | null;
  /** Active clients floored to the nearest 10, null under 10 (engagement band). */
  client_count_band: number | null;
  // Capacity fields
  available_spots: number;
  max_clients: number;
  current_clients: number;
  /** Trains at the client's chosen gym (in-person/hybrid). */
  gym_match: boolean;
}

interface CoachPreferenceSectionProps {
  form: UseFormReturn<any>;
  planType: 'online' | 'hybrid' | 'in_person';
  focusAreas: string[];
  /** In-person/hybrid: the client's chosen gym_id → ranks gym-matched coaches first. */
  preferredGymId?: string | null;
}

// Map plan types to service names for capacity lookup
const PLAN_TYPE_TO_SERVICE_NAME: Record<string, string> = {
  'online': '1:1 Online',
  'hybrid': '1:1 Hybrid',
  'in_person': '1:1 In-Person',
};

// Map plan types to display labels
const PLAN_TYPE_LABELS: Record<string, string> = {
  'online': 'Online',
  'hybrid': 'Hybrid',
  'in_person': 'In-Person',
};

export function CoachPreferenceSection({ form, planType, focusAreas, preferredGymId = null }: CoachPreferenceSectionProps) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [noCoachesAvailable, setNoCoachesAvailable] = useState(false);
  // ON2 — "View profile" dialog target. Populated from the full public profile the
  // list RPC now returns (see the enriched `list_active_coaches_for_service`); no
  // second fetch on open.
  const [profileCoach, setProfileCoach] = useState<Coach | null>(null);
  const { getLabel } = useSpecializationTags();

  const preferenceType = form.watch("coach_preference_type") || "auto";
  const selectedCoachId = form.watch("requested_coach_id");

  const loadAvailableCoaches = useCallback(async () => {
    try {
      setLoading(true);

      // Get the service ID for capacity lookup
      const serviceName = PLAN_TYPE_TO_SERVICE_NAME[planType];
      const { data: serviceData } = await supabase
        .from('services')
        .select('id')
        .eq('name', serviceName)
        .maybeSingle();

      if (!serviceData) {
        if (import.meta.env.DEV) console.error('Service not found:', serviceName);
        setNoCoachesAvailable(true);
        setLoading(false);
        return;
      }

      // Use SECURITY DEFINER RPC instead of coaches_client_safe view -- the
      // view is RLS-broken for unauthenticated/pre-subscription callers
      // (returns 0 rows). RPC bundles capacity counting server-side too, so
      // no N+1 per-coach subscription count.
      // p_gym_id (in-person/hybrid) flags coaches who train at the client's gym.
      const { data: rpcData, error: rpcError } = await supabase
        .rpc('list_active_coaches_for_service', { p_service_id: serviceData.id, p_gym_id: preferredGymId ?? null });

      if (rpcError) throw rpcError;

      const safeCoaches = (rpcData ?? []) as Array<{
        id: string;
        user_id: string;
        first_name: string;
        last_name: string | null;
        nickname: string | null;
        slug: string | null;
        profile_picture_url: string | null;
        short_bio: string | null;
        bio: string | null;
        specializations: string[] | null;
        location: string | null;
        qualifications: string[] | null;
        intro_video_url: string | null;
        years_experience: number | null;
        is_head_coach: boolean | null;
        head_coach_specialisation: string | null;
        coach_level: string | null;
        socials: Coach["socials"];
        gyms: Coach["gyms"];
        client_count_band: number | null;
        status: string;
        max_clients: number;
        current_clients: number;
        available_spots: number;
        gym_match?: boolean;
      }>;

      if (safeCoaches.length === 0) {
        setCoaches([]);
        setNoCoachesAvailable(true);
        setLoading(false);
        return;
      }

      // Build coaches list -- capacity already filtered server-side
      const coachesWithCapacity: Coach[] = safeCoaches.map(coach => ({
        id: coach.id,
        user_id: coach.user_id,
        first_name: coach.first_name,
        last_name: coach.last_name,
        nickname: coach.nickname,
        slug: coach.slug,
        profile_picture_url: coach.profile_picture_url,
        short_bio: coach.short_bio,
        bio: coach.bio,
        specializations: coach.specializations,
        location: coach.location,
        qualifications: coach.qualifications,
        intro_video_url: coach.intro_video_url,
        years_experience: coach.years_experience,
        is_head_coach: coach.is_head_coach,
        head_coach_specialisation: coach.head_coach_specialisation,
        coach_level: coach.coach_level,
        socials: coach.socials,
        gyms: coach.gyms,
        client_count_band: coach.client_count_band,
        available_spots: coach.available_spots,
        max_clients: coach.max_clients,
        current_clients: coach.current_clients,
        gym_match: coach.gym_match ?? false,
      }));

      // Sort: trains-at-your-gym first, then focus-area match, then available spots.
      const sortedCoaches = coachesWithCapacity.sort((a, b) => {
        if (a.gym_match !== b.gym_match) return a.gym_match ? -1 : 1;
        const scoreA = calculateMatchScore(a.specializations, focusAreas);
        const scoreB = calculateMatchScore(b.specializations, focusAreas);
        if (scoreB !== scoreA) return scoreB - scoreA;
        return b.available_spots - a.available_spots;
      });

      setCoaches(sortedCoaches);
      setNoCoachesAvailable(sortedCoaches.length === 0);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading coaches:', error);
      setNoCoachesAvailable(true);
    } finally {
      setLoading(false);
    }
  }, [planType, focusAreas, preferredGymId]);

  useEffect(() => {
    loadAvailableCoaches();
  }, [loadAvailableCoaches]);

  // Auto-switch to auto-match if no coaches available
  useEffect(() => {
    if (noCoachesAvailable && preferenceType === 'specific') {
      form.setValue("coach_preference_type", "auto");
      form.setValue("requested_coach_id", null);
    }
  }, [noCoachesAvailable, preferenceType, form]);

  const calculateMatchScore = (specializations: string[] | null, clientFocusAreas: string[]): number => {
    if (!specializations || !clientFocusAreas.length) return 0;
    const normalizedSpecs = new Set(specializations.map(s => s.toLowerCase().trim()));
    return clientFocusAreas.filter(f => normalizedSpecs.has(f.toLowerCase().trim())).length;
  };

  const handlePreferenceChange = (value: 'auto' | 'specific') => {
    // Don't allow switching to specific if no coaches available
    if (value === 'specific' && noCoachesAvailable) {
      return;
    }
    // Always set value explicitly to prevent stuck states
    form.setValue("coach_preference_type", value, { shouldDirty: true, shouldValidate: true });
    if (value === "auto") {
      form.setValue("requested_coach_id", null, { shouldDirty: true });
    }
  };

  const handleCoachSelect = (coachId: string) => {
    form.setValue("requested_coach_id", coachId, { shouldDirty: true, shouldValidate: true });
    // Ensure preference type is always 'specific' when a coach is selected
    if (form.getValues("coach_preference_type") !== "specific") {
      form.setValue("coach_preference_type", "specific", { shouldDirty: true });
    }
  };

  const getInitials = (firstName: string, lastName: string | null): string => {
    return `${firstName.charAt(0)}${lastName?.charAt(0) || ''}`.toUpperCase();
  };

  const formatSpecialties = (specializations: string[] | null): string => {
    if (!specializations || specializations.length === 0) return '';
    return specializations.slice(0, 3).map(s => getLabel(s)).join(' • ');
  };

  return (
    <div className="space-y-6 pt-6 border-t border-border/50">
      <div>
        <h3 className="text-lg font-semibold mb-2">Coach Selection</h3>
        <p className="text-sm text-muted-foreground">
          How would you like to be paired with a coach?
        </p>
      </div>

      <FormField
        control={form.control}
        name="coach_preference_type"
        render={({ field }) => (
          <FormItem>
            <FormControl>
              <div className="grid gap-3 sm:grid-cols-2">
                {/* Auto-match option */}
                <ClickableCard
                  ariaLabel="Auto-match me with the best coach"
                  onClick={() => handlePreferenceChange('auto')}
                  className={cn(
                    "p-5 relative overflow-hidden",
                    preferenceType === 'auto' && "border-primary ring-2 ring-primary/20 bg-primary/5",
                  )}
                >
                  {preferenceType === 'auto' && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className={`p-3 rounded-full ${
                      preferenceType === 'auto' 
                        ? 'bg-primary text-primary-foreground' 
                        : 'bg-muted text-muted-foreground'
                    }`}>
                      <Sparkles className="h-6 w-6" />
                    </div>
                    <div>
                      <div className="flex items-center justify-center gap-2 mb-1">
                        <span className="font-semibold">Auto-Match</span>
                        <Badge className="bg-primary/10 text-primary hover:bg-primary/20 text-xs font-medium">
                          Recommended
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        We'll pair you with the best coach based on your goals and preferences.
                      </p>
                    </div>
                  </div>
                </ClickableCard>

                {/* Specific coach option */}
                <ClickableCard
                  ariaLabel="Choose my own coach"
                  disabled={noCoachesAvailable}
                  onClick={() => handlePreferenceChange('specific')}
                  className={cn(
                    "p-5 relative overflow-hidden",
                    preferenceType === 'specific' && !noCoachesAvailable && "border-primary ring-2 ring-primary/20 bg-primary/5",
                  )}
                >
                  {preferenceType === 'specific' && !noCoachesAvailable && (
                    <div className="absolute top-3 right-3">
                      <CheckCircle2 className="h-5 w-5 text-primary" />
                    </div>
                  )}
                  <div className="flex flex-col items-center text-center space-y-3">
                    <div className={`p-3 rounded-full ${
                      noCoachesAvailable 
                        ? 'bg-muted/50 text-muted-foreground/50'
                        : preferenceType === 'specific' 
                          ? 'bg-primary text-primary-foreground' 
                          : 'bg-muted text-muted-foreground'
                    }`}>
                      <Users className="h-6 w-6" />
                    </div>
                    <div>
                      <span className="font-semibold block mb-1">Choose My Coach</span>
                      <p className="text-sm text-muted-foreground">
                        Browse available coaches and select who you'd like to work with.
                      </p>
                      {noCoachesAvailable && !loading && (
                        <div className="flex items-center justify-center gap-1 mt-2 text-xs text-amber-600">
                          <AlertCircle className="h-3 w-3" />
                          <span>Currently unavailable</span>
                        </div>
                      )}
                    </div>
                  </div>
                </ClickableCard>
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {/* Coach selection grid - only shown when "specific" is selected */}
      {preferenceType === 'specific' && (
        <div className="space-y-4">
          <FormField
            control={form.control}
            name="requested_coach_id"
            render={() => (
              <FormItem>
                <FormLabel>Select Your Coach *</FormLabel>
                <FormDescription>
                  Coaches are sorted by how well their specialties match your focus areas. Only coaches with available spots are shown.
                </FormDescription>
                
                {loading ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-primary" />
                  </div>
                ) : coaches.length === 0 ? (
                  <Card className="p-6 text-center border-amber-200 bg-amber-50">
                    <div className="flex flex-col items-center gap-3">
                      <AlertCircle className="h-8 w-8 text-amber-600" />
                      <div>
                        <p className="font-medium text-amber-800">
                          No coaches are currently available for this plan.
                        </p>
                        <p className="text-sm text-amber-700 mt-1">
                          Please choose auto-match or contact support.
                        </p>
                      </div>
                    </div>
                  </Card>
                ) : (
                  <ScrollArea className="h-[360px] pr-4">
                    <div className="grid gap-3">
                      {coaches.map((coach, idx) => {
                        const isSelected = selectedCoachId === coach.id;
                        const matchScore = calculateMatchScore(coach.specializations, focusAreas);
                        const specialtiesText = formatSpecialties(coach.specializations);
                        // Coaches are sorted best-match-first, so the first card with a
                        // real match is the recommendation.
                        const isTopMatch = idx === 0 && matchScore > 0;

                        return (
                          <ClickableCard
                            key={coach.id}
                            ariaLabel={`Select coach ${coach.first_name} ${coach.last_name ?? ''}`.trim()}
                            onClick={() => handleCoachSelect(coach.id)}
                            className={cn(
                              "p-4 relative",
                              isSelected && "border-primary ring-2 ring-primary/20 bg-primary/5",
                            )}
                          >
                            {isSelected && (
                              <div className="absolute top-3 right-3">
                                <CheckCircle2 className="h-5 w-5 text-primary" />
                              </div>
                            )}
                            
                            <div className="flex items-center gap-4">
                              <Avatar className="h-14 w-14 shrink-0">
                                <AvatarImage src={coach.profile_picture_url || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary font-semibold text-lg">
                                  {getInitials(coach.first_name, coach.last_name)}
                                </AvatarFallback>
                              </Avatar>
                              
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 mb-1 flex-wrap">
                                  <h4 className="font-bold text-base">
                                    {coach.first_name} {coach.last_name}
                                  </h4>
                                  {coach.gym_match && (
                                    <Badge className="text-xs shrink-0 bg-primary/10 text-primary hover:bg-primary/10">
                                      <MapPin className="h-3 w-3 mr-1" />
                                      Trains at your gym
                                    </Badge>
                                  )}
                                  {isTopMatch && (
                                    <Badge className="text-xs shrink-0 bg-amber-100 text-amber-700 hover:bg-amber-100">
                                      <Star className="h-3 w-3 mr-1" />
                                      Top match
                                    </Badge>
                                  )}
                                  <Badge
                                    variant="outline"
                                    className="text-xs font-medium shrink-0 bg-secondary/50"
                                  >
                                    {PLAN_TYPE_LABELS[planType] || 'Online'}
                                  </Badge>
                                  {matchScore > 0 && (
                                    <Badge
                                      className="text-xs shrink-0 bg-green-100 text-green-700 hover:bg-green-100"
                                    >
                                      {matchScore} goal{matchScore > 1 ? 's' : ''} match
                                    </Badge>
                                  )}
                                </div>

                                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                                  {specialtiesText && (
                                    <span className="line-clamp-1">{specialtiesText}</span>
                                  )}
                                  <Badge variant="outline" className="text-xs shrink-0">
                                    <Users className="h-3 w-3 mr-1" />
                                    {coach.available_spots} spot{coach.available_spots !== 1 ? 's' : ''} left
                                  </Badge>
                                </div>

                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="mt-2 h-7 px-2 text-xs text-primary hover:text-primary"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setProfileCoach(coach);
                                  }}
                                >
                                  <Eye className="h-3.5 w-3.5 mr-1" />
                                  View profile
                                </Button>
                              </div>
                            </div>
                          </ClickableCard>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {/* ON2 — the full public coach profile, same shape /coaches/:slug renders.
          These fields are NOT gated pre-subscription: they come from the
          SECURITY DEFINER `list_active_coaches_for_service` RPC (RLS does not
          apply to it), and `get_coach_public_profile_by_slug` already serves the
          identical set to anonymous visitors. `/meet-our-team` mounts this same
          dialog with location + qualifications populated for logged-out users.
          Every section null-omits, so a half-filled coach shows no empty headers. */}
      <CoachDetailDialog
        open={!!profileCoach}
        onOpenChange={(open) => !open && setProfileCoach(null)}
        profileHref={profileCoach?.slug ? `/coaches/${profileCoach.slug}` : undefined}
        coach={
          profileCoach
            ? {
                firstName: profileCoach.first_name,
                lastName: profileCoach.last_name,
                nickname: profileCoach.nickname,
                avatarUrl: profileCoach.profile_picture_url,
                bio: profileCoach.bio,
                shortBio: profileCoach.short_bio,
                specializations: profileCoach.specializations?.map((s) => getLabel(s)) ?? [],
                // Shared derivation — onboarding, /coaches/:slug and /meet-our-team
                // must all build the headline the same way.
                headline: deriveCoachHeadline({
                  isHeadCoach: profileCoach.is_head_coach,
                  headCoachSpecialisation: profileCoach.head_coach_specialisation,
                  coachLevel: profileCoach.coach_level,
                  primarySpecialty: profileCoach.specializations?.[0]
                    ? getLabel(profileCoach.specializations[0])
                    : null,
                }),
                location: profileCoach.location,
                qualifications: profileCoach.qualifications ?? [],
                gyms: profileCoach.gyms ?? [],
                socials: profileCoach.socials ?? undefined,
                introVideoUrl: profileCoach.intro_video_url,
                yearsExperience: profileCoach.years_experience,
                clientCount: profileCoach.client_count_band,
              }
            : null
        }
      />
    </div>
  );
}