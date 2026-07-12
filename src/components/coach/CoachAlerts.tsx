import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileWarning, UserPlus } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { startOfIguWeek } from "@/lib/weekUtils";
import { Skeleton } from "@/components/ui/skeleton";
import { LoadError } from "@/components/ui/load-error";
import { captureException } from "@/lib/errorLogging";

interface CoachAlertsProps {
  coachUserId: string;
  onNavigateToClients: (filter?: string) => void;
}

export function CoachAlerts({ coachUserId, onNavigateToClients }: CoachAlertsProps) {
  const [missedLogsCount, setMissedLogsCount] = useState(0);
  const [paymentIssuesCount, setPaymentIssuesCount] = useState(0);
  const [newSignupsCount, setNewSignupsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const loadAlerts = useCallback(async () => {
    setError(null);
    try {
      // Get coach's ID from coaches table
      const { data: coach, error: coachErr } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', coachUserId)
        .single();
      if (coachErr) throw coachErr;

      if (!coach) return;

      // Get all 1:1 clients for this coach
      const { data: subscriptions, error: subsErr } = await supabase
        .from('subscriptions')
        .select(`
          user_id,
          status,
          created_at,
          service_id,
          services (type)
        `)
        .eq('coach_id', coach.id)
        .eq('status', 'active');
      if (subsErr) throw subsErr;

      if (!subscriptions) return;

      // Filter 1:1 clients (not team plans)
      const oneToOneClients = subscriptions.filter(sub => 
        sub.services?.type?.toString().toLowerCase().includes('1:1') ||
        sub.services?.type?.toString().toLowerCase().includes('one')
      );

      // Check missed logs - only for 1:1 clients
      const today = new Date();
      const dayOfWeek = today.getDay();
      
      // Only check Tuesday (2), Wednesday (3), Thursday (4)
      if (dayOfWeek >= 2 && dayOfWeek <= 4) {
        // IGU adherence week — see weekUtils.ts
        const startOfWeek = startOfIguWeek(today);

        let missedCount = 0;
        for (const client of oneToOneClients) {
          const { data: logs } = await supabase
            .from('weight_logs')
            .select('log_date')
            .eq('user_id', client.user_id)
            .gte('log_date', startOfWeek.toISOString())
            .limit(1);

          if (!logs || logs.length === 0) {
            missedCount++;
          }
        }
        setMissedLogsCount(missedCount);
      }

      // Check payment issues
      const { data: paymentIssues, error: payErr } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('coach_id', coach.id)
        .in('status', ['payment_failed', 'inactive']);
      if (payErr) throw payErr;

      setPaymentIssuesCount(paymentIssues?.length || 0);

      // Check new signups (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: newSignups, error: signupErr } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('coach_id', coach.id)
        .gte('created_at', sevenDaysAgo.toISOString());
      if (signupErr) throw signupErr;

      setNewSignupsCount(newSignups?.length || 0);

    } catch (err) {
      // CC10: an alerts fetch that fails must NOT render as "0 alerts" — that told
      // the coach everything was fine on the one surface whose job is to say otherwise.
      captureException(err, { source: 'CoachAlerts.loadAlerts' });
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  if (loading) {
    // Layout-shaped: three cards, so the real alerts land where the skeleton was.
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-lg border border-border bg-card p-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="mt-3 h-7 w-10" />
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <LoadError
        message="We couldn't load your alerts. They may be out of date — check your connection."
        onRetry={() => { void loadAlerts(); }}
      />
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card
        className="border-destructive/50 hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col"
        onClick={() => missedLogsCount > 0 && onNavigateToClients('missed-logs')}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Missed Logs</CardTitle>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center">
          <div className="text-2xl font-bold">{missedLogsCount}</div>
          <p className="text-xs text-muted-foreground">
            1:1 clients haven't logged nutrition this week
          </p>
        </CardContent>
      </Card>

      <Card
        className="border-orange-500/50 hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col"
        onClick={() => paymentIssuesCount > 0 && onNavigateToClients('payment-issues')}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Payment Issues</CardTitle>
          <FileWarning className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center">
          <div className="text-2xl font-bold">{paymentIssuesCount}</div>
          <p className="text-xs text-muted-foreground">
            Clients with payment problems
          </p>
        </CardContent>
      </Card>

      <Card
        className="border-primary/50 hover:shadow-lg transition-shadow cursor-pointer h-full flex flex-col"
        onClick={() => newSignupsCount > 0 && onNavigateToClients('new-signups')}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">New Signups</CardTitle>
          <UserPlus className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent className="flex-1 flex flex-col justify-center">
          <div className="text-2xl font-bold">{newSignupsCount}</div>
          <p className="text-xs text-muted-foreground">
            New clients joined this week
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
