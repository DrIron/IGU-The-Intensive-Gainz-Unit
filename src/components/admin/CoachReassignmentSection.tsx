import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, UserCog, AlertTriangle, Check, Users, Ban } from "lucide-react";

interface CoachWithCapacity {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string | null;
  specializations: string[] | null;
  status: string;
  current_clients: number;
  max_clients: number;
  is_current: boolean;
}

interface CoachReassignmentSectionProps {
  clientId: string;
  subscriptionId: string;
  serviceId: string;
  currentCoachId: string | null;
  onReassigned?: () => void;
}

export function CoachReassignmentSection({
  clientId,
  subscriptionId,
  serviceId,
  currentCoachId,
  onReassigned,
}: CoachReassignmentSectionProps) {
  const { toast } = useToast();
  const [coaches, setCoaches] = useState<CoachWithCapacity[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCoachId, setSelectedCoachId] = useState<string | null>(currentCoachId);
  const [reassigning, setReassigning] = useState(false);
  const [currentCoachName, setCurrentCoachName] = useState<string | null>(null);

  const loadCoachesWithCapacity = useCallback(async () => {
    setLoading(true);
    try {
      // Get all coaches with service limits for this service
      const { data: serviceLimits, error: limitsError } = await supabase
        .from('coach_service_limits')
        .select(`
          max_clients,
          coaches!inner(id, user_id, first_name, last_name, specializations, status)
        `)
        .eq('service_id', serviceId);

      if (limitsError) throw limitsError;

      if (!serviceLimits || serviceLimits.length === 0) {
        setCoaches([]);
        setLoading(false);
        return;
      }

      // Build coaches list with capacity info
      const coachesWithCapacity: CoachWithCapacity[] = [];

      for (const limit of serviceLimits) {
        const coach = limit.coaches as any;

        // Only include active or approved coaches
        if (coach.status !== 'active' && coach.status !== 'approved') {
          continue;
        }

        // Count current active subscriptions for this coach + service
        // Using the correct definition: profiles.status='active' AND subscriptions.status='active'
        const { data: activeSubs } = await supabase
          .from('subscriptions')
          .select(`
            id,
            profiles!inner(status)
          `)
          .eq('coach_id', coach.user_id)
          .eq('service_id', serviceId)
          .eq('status', 'active')
          .eq('profiles.status', 'active');

        const currentClients = activeSubs?.length || 0;
        const isCurrent = coach.user_id === currentCoachId;

        if (isCurrent) {
          setCurrentCoachName(`${coach.first_name} ${coach.last_name || ''}`);
        }

        coachesWithCapacity.push({
          id: coach.id,
          user_id: coach.user_id,
          first_name: coach.first_name,
          last_name: coach.last_name,
          specializations: coach.specializations,
          status: coach.status,
          current_clients: currentClients,
          max_clients: limit.max_clients,
          is_current: isCurrent,
        });
      }

      // Sort: current coach first, then by available capacity
      coachesWithCapacity.sort((a, b) => {
        if (a.is_current && !b.is_current) return -1;
        if (!a.is_current && b.is_current) return 1;
        const aAvailable = a.max_clients - a.current_clients;
        const bAvailable = b.max_clients - b.current_clients;
        return bAvailable - aAvailable;
      });

      setCoaches(coachesWithCapacity);
    } catch (error) {
      console.error('Error loading coaches:', error);
      toast({
        title: "Error",
        description: "Failed to load coach capacity data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [serviceId, currentCoachId, toast]);

  useEffect(() => {
    loadCoachesWithCapacity();
  }, [loadCoachesWithCapacity]);

  const handleReassign = async () => {
    if (!selectedCoachId || selectedCoachId === currentCoachId) {
      toast({
        title: "No Change",
        description: "Please select a different coach to reassign",
      });
      return;
    }

    const selectedCoach = coaches.find(c => c.user_id === selectedCoachId);
    if (!selectedCoach) return;

    // Block reassignment if coach is at or over capacity
    if (selectedCoach.current_clients >= selectedCoach.max_clients) {
      toast({
        title: "Coach at Capacity",
        description: `${selectedCoach.first_name} ${selectedCoach.last_name || ''} is at capacity (${selectedCoach.current_clients}/${selectedCoach.max_clients}). Cannot assign more clients.`,
        variant: "destructive",
      });
      return;
    }

    setReassigning(true);
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ coach_id: selectedCoachId })
        .eq('id', subscriptionId);

      if (error) throw error;

      // Update coach's last_assigned_at for fairness tracking
      try {
        await supabase
          .from('coaches')
          .update({ last_assigned_at: new Date().toISOString() })
          .eq('user_id', selectedCoachId);
      } catch (updateError) {
        console.error('Failed to update last_assigned_at:', updateError);
      }

      toast({
        title: "Coach Reassigned",
        description: `Client has been reassigned to ${selectedCoach.first_name} ${selectedCoach.last_name || ''}`,
      });

      // Optionally trigger notification email
      try {
        await supabase.functions.invoke('notify-coach-new-client', {
          body: { 
            coachUserId: selectedCoachId,
            clientId: clientId,
            isReassignment: true,
          },
        });
      } catch (emailError) {
        console.error('Failed to send coach notification:', emailError);
      }

      onReassigned?.();
    } catch (error: any) {
      console.error('Error reassigning coach:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setReassigning(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center gap-2 py-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading coach capacity...</span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (coaches.length === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UserCog className="h-4 w-4" />
            Coach Assignment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              No coaches have capacity configured for this service.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  const hasChanges = selectedCoachId !== currentCoachId;
  const selectedCoach = coaches.find(c => c.user_id === selectedCoachId);
  const isSelectedAtCapacity = selectedCoach && !selectedCoach.is_current && 
    selectedCoach.current_clients >= selectedCoach.max_clients;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <UserCog className="h-4 w-4" />
          Coach & Capacity
        </CardTitle>
        <CardDescription>
          {currentCoachName 
            ? `Currently assigned to ${currentCoachName}` 
            : "No coach currently assigned"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <RadioGroup
          value={selectedCoachId || ""}
          onValueChange={setSelectedCoachId}
          className="space-y-3"
        >
          {coaches.map((coach) => {
            const availableSpots = coach.max_clients - coach.current_clients;
            const isAtCapacity = availableSpots <= 0;
            const isOverCapacity = availableSpots < 0;

            return (
              <div
                key={coach.user_id}
                className={`flex items-start space-x-3 p-3 rounded-lg border ${
                  coach.is_current ? 'border-primary/50 bg-primary/5' : 'border-border'
                } ${isAtCapacity && !coach.is_current ? 'opacity-60 bg-muted/30' : ''}`}
              >
                <RadioGroupItem
                  value={coach.user_id}
                  id={coach.user_id}
                  className="mt-1"
                  disabled={isAtCapacity && !coach.is_current}
                />
                <Label htmlFor={coach.user_id} className={`flex-1 ${isAtCapacity && !coach.is_current ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {coach.first_name} {coach.last_name}
                      </span>
                      {coach.is_current && (
                        <Badge variant="secondary" className="text-xs">
                          <Check className="h-3 w-3 mr-1" />
                          Current
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={isOverCapacity ? "destructive" : isAtCapacity ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        <Users className="h-3 w-3 mr-1" />
                        {coach.current_clients}/{coach.max_clients}
                      </Badge>
                      {isAtCapacity && !coach.is_current && (
                        <Badge variant="destructive" className="text-xs">
                          <Ban className="h-3 w-3 mr-1" />
                          Full
                        </Badge>
                      )}
                    </div>
                  </div>
                  {coach.specializations && coach.specializations.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {coach.specializations.slice(0, 4).map((spec, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs font-normal">
                          {spec}
                        </Badge>
                      ))}
                      {coach.specializations.length > 4 && (
                        <Badge variant="outline" className="text-xs font-normal">
                          +{coach.specializations.length - 4} more
                        </Badge>
                      )}
                    </div>
                  )}
                </Label>
              </div>
            );
          })}
        </RadioGroup>

        {isSelectedAtCapacity && hasChanges && (
          <Alert variant="destructive">
            <Ban className="h-4 w-4" />
            <AlertTitle>Cannot Reassign</AlertTitle>
            <AlertDescription>
              {selectedCoach?.first_name} {selectedCoach?.last_name} is at capacity. Please choose a different coach.
            </AlertDescription>
          </Alert>
        )}

        {hasChanges && !isSelectedAtCapacity && (
          <div className="flex justify-end pt-2">
            <Button
              onClick={handleReassign}
              disabled={reassigning}
              size="sm"
            >
              {reassigning ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Reassigning...
                </>
              ) : (
                "Confirm Reassignment"
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}