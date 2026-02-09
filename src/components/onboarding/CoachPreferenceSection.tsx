import { useState, useEffect, useCallback } from "react";
import { UseFormReturn } from "react-hook-form";
import { FormField, FormItem, FormLabel, FormControl, FormDescription, FormMessage } from "@/components/ui/form";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Sparkles, User, CheckCircle2, AlertCircle, Users } from "lucide-react";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";

interface Coach {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
  short_bio: string | null;
  specializations: string[] | null;
  // Capacity fields
  available_spots: number;
  max_clients: number;
  current_clients: number;
}

interface CoachPreferenceSectionProps {
  form: UseFormReturn<any>;
  planType: 'online' | 'hybrid' | 'in_person';
  focusAreas: string[];
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

export function CoachPreferenceSection({ form, planType, focusAreas }: CoachPreferenceSectionProps) {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(true);
  const [noCoachesAvailable, setNoCoachesAvailable] = useState(false);
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

      // Get coaches with their service limits for this specific service
      // Use coaches_client_safe view (contains ONLY public-safe fields, no contact info)
      const { data: serviceLimits, error: limitsError } = await supabase
        .from('coach_service_limits')
        .select(`
          max_clients,
          coach_id,
          coaches:coach_id(id)
        `)
        .eq('service_id', serviceData.id);
      
      if (limitsError) throw limitsError;

      // Get coach details from the safe view separately
      const coachIds = serviceLimits?.map(l => (l.coaches as any)?.id).filter(Boolean) || [];
      if (coachIds.length === 0) {
        setCoaches([]);
        setNoCoachesAvailable(true);
        setLoading(false);
        return;
      }

      const { data: safeCoaches, error: coachError } = await supabase
        .from('coaches_client_safe')
        .select('id, user_id, first_name, last_name, profile_picture_url, short_bio, specializations, status')
        .in('id', coachIds);
      
      if (coachError) throw coachError;

      if (!safeCoaches || safeCoaches.length === 0) {
        setCoaches([]);
        setNoCoachesAvailable(true);
        setLoading(false);
        return;
      }

      // Create a map of coach_id to max_clients from service limits
      const limitsMap = new Map<string, number>();
      for (const limit of serviceLimits || []) {
        const coachId = (limit.coaches as any)?.id;
        if (coachId) {
          limitsMap.set(coachId, limit.max_clients);
        }
      }

      // Build coaches list with capacity info
      const coachesWithCapacity: Coach[] = [];

      for (const coach of safeCoaches) {
        // Only include active coaches
        if (coach.status !== 'active') {
          continue;
        }

        const maxClients = limitsMap.get(coach.id) || 0;

        // Count current subscriptions for this coach + service
        // Must match server-side: count pending + active subscriptions (real current load)
        const { count: currentClients } = await supabase
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('coach_id', coach.user_id)
          .eq('service_id', serviceData.id)
          .in('status', ['pending', 'active']);
        const clientCount = currentClients || 0;
        const availableSpots = maxClients - clientCount;

        // Only include coaches with available capacity
        if (availableSpots <= 0) {
          if (import.meta.env.DEV) console.log(`Coach ${coach.first_name} is at capacity (${clientCount}/${maxClients})`);
          continue;
        }

        coachesWithCapacity.push({
          id: coach.id,
          user_id: coach.user_id,
          first_name: coach.first_name,
          last_name: coach.last_name,
          profile_picture_url: coach.profile_picture_url,
          short_bio: coach.short_bio,
          specializations: coach.specializations,
          available_spots: availableSpots,
          max_clients: maxClients,
          current_clients: clientCount,
        });
      }

      // Sort coaches by specialization match with focus areas, then by available spots
      const sortedCoaches = coachesWithCapacity.sort((a, b) => {
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
  }, [planType, focusAreas]);

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
                <Card 
                  className={`p-5 cursor-pointer transition-all relative overflow-hidden ${
                    preferenceType === 'auto' 
                      ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                      : 'hover:border-primary/50 hover:shadow-md'
                  }`}
                  onClick={() => handlePreferenceChange('auto')}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handlePreferenceChange('auto');
                    }
                  }}
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
                </Card>

                {/* Specific coach option */}
                <Card 
                  className={`p-5 transition-all relative overflow-hidden ${
                    noCoachesAvailable 
                      ? 'opacity-50 cursor-not-allowed' 
                      : preferenceType === 'specific' 
                        ? 'border-primary ring-2 ring-primary/20 bg-primary/5 cursor-pointer' 
                        : 'hover:border-primary/50 hover:shadow-md cursor-pointer'
                  }`}
                  onClick={() => !noCoachesAvailable && handlePreferenceChange('specific')}
                  role="button"
                  tabIndex={noCoachesAvailable ? -1 : 0}
                  onKeyDown={(e) => {
                    if (!noCoachesAvailable && (e.key === 'Enter' || e.key === ' ')) {
                      e.preventDefault();
                      handlePreferenceChange('specific');
                    }
                  }}
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
                </Card>
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
                      {coaches.map((coach) => {
                        const isSelected = selectedCoachId === coach.id;
                        const matchScore = calculateMatchScore(coach.specializations, focusAreas);
                        const specialtiesText = formatSpecialties(coach.specializations);
                        
                        return (
                          <Card
                            key={coach.id}
                            className={`p-4 cursor-pointer transition-all relative ${
                              isSelected 
                                ? 'border-primary ring-2 ring-primary/20 bg-primary/5' 
                                : 'hover:border-primary/50 hover:shadow-md'
                            }`}
                            onClick={() => handleCoachSelect(coach.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault();
                                handleCoachSelect(coach.id);
                              }
                            }}
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
                              </div>
                            </div>
                          </Card>
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
    </div>
  );
}