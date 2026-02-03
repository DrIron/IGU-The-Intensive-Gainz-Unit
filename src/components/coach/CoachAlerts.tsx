import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertCircle, FileWarning, UserPlus } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface CoachAlertsProps {
  coachUserId: string;
  onNavigateToClients: (filter?: string) => void;
}

export function CoachAlerts({ coachUserId, onNavigateToClients }: CoachAlertsProps) {
  const [missedLogsCount, setMissedLogsCount] = useState(0);
  const [paymentIssuesCount, setPaymentIssuesCount] = useState(0);
  const [newSignupsCount, setNewSignupsCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const loadAlerts = useCallback(async () => {
    try {
      // Get coach's ID from coaches table
      const { data: coach } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', coachUserId)
        .single();

      if (!coach) return;

      // Get all 1:1 clients for this coach
      const { data: subscriptions } = await supabase
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
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - today.getDay());
        startOfWeek.setHours(0, 0, 0, 0);

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
      const { data: paymentIssues } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('coach_id', coach.id)
        .in('status', ['payment_failed', 'inactive']);

      setPaymentIssuesCount(paymentIssues?.length || 0);

      // Check new signups (last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const { data: newSignups } = await supabase
        .from('subscriptions')
        .select('id')
        .eq('coach_id', coach.id)
        .gte('created_at', sevenDaysAgo.toISOString());

      setNewSignupsCount(newSignups?.length || 0);

    } catch (error) {
      console.error('Error loading alerts:', error);
    } finally {
      setLoading(false);
    }
  }, [coachUserId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading alerts...</div>;
  }

  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card 
        className="border-destructive/50 hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => missedLogsCount > 0 && onNavigateToClients('missed-logs')}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Missed Logs</CardTitle>
          <AlertCircle className="h-4 w-4 text-destructive" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{missedLogsCount}</div>
          <p className="text-xs text-muted-foreground">
            1:1 clients haven't logged nutrition this week
          </p>
        </CardContent>
      </Card>

      <Card 
        className="border-orange-500/50 hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => paymentIssuesCount > 0 && onNavigateToClients('payment-issues')}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Payment Issues</CardTitle>
          <FileWarning className="h-4 w-4 text-orange-500" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{paymentIssuesCount}</div>
          <p className="text-xs text-muted-foreground">
            Clients with payment problems
          </p>
        </CardContent>
      </Card>

      <Card 
        className="border-primary/50 hover:shadow-lg transition-shadow cursor-pointer"
        onClick={() => newSignupsCount > 0 && onNavigateToClients('new-signups')}
      >
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">New Signups</CardTitle>
          <UserPlus className="h-4 w-4 text-primary" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{newSignupsCount}</div>
          <p className="text-xs text-muted-foreground">
            New clients joined this week
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
