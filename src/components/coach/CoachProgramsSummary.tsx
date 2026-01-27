import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Shield } from "lucide-react";

interface ProgramSummary {
  serviceName: string;
  clientCount: number;
  serviceId: string;
}

interface CoachProgramsSummaryProps {
  coachUserId: string;
  onViewClients: (serviceId: string) => void;
}

export function CoachProgramsSummary({ coachUserId, onViewClients }: CoachProgramsSummaryProps) {
  const [programs, setPrograms] = useState<ProgramSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadProgramsSummary();
  }, [coachUserId]);

  const loadProgramsSummary = async () => {
    try {
      // Get coach's ID
      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', coachUserId)
        .single();

      if (!coach) return;

      // Get all subscriptions grouped by service
      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select(`
          service_id,
          services (
            id,
            name
          )
        `)
        .eq('coach_id', coach.id)
        .eq('status', 'active');

      if (!subscriptions) return;

      // Group by service and count
      const programMap = new Map<string, { name: string; count: number }>();
      
      subscriptions.forEach(sub => {
        if (sub.services) {
          const serviceId = sub.service_id;
          const serviceName = sub.services.name;
          
          if (programMap.has(serviceId)) {
            const existing = programMap.get(serviceId)!;
            programMap.set(serviceId, { ...existing, count: existing.count + 1 });
          } else {
            programMap.set(serviceId, { name: serviceName, count: 1 });
          }
        }
      });

      const programSummaries: ProgramSummary[] = Array.from(programMap.entries()).map(
        ([serviceId, data]) => ({
          serviceId,
          serviceName: data.name,
          clientCount: data.count,
        })
      );

      setPrograms(programSummaries);
    } catch (error) {
      console.error('Error loading programs summary:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading programs...</div>;
  }

  if (programs.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Shield className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">You don't have any clients assigned yet.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold">Your Programs</h2>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {programs.map((program) => (
          <Card key={program.serviceId} className="border-border/50">
            <CardHeader>
              <CardTitle className="text-lg">{program.serviceName}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="text-3xl font-bold text-primary">{program.clientCount}</div>
                <p className="text-sm text-muted-foreground">
                  {program.clientCount === 1 ? 'client' : 'clients'} assigned to you
                </p>
              </div>
              <Button 
                onClick={() => onViewClients(program.serviceId)}
                className="w-full"
                variant="outline"
              >
                View These Clients
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
