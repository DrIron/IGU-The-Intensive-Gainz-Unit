import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Info, AlertTriangle } from "lucide-react";
import { LEVEL_LABELS, type ProfessionalLevel } from "@/auth/roles";
import { formatServiceType } from "@/lib/statusUtils";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface Subscription {
  id: string;
  user_id: string;
  coach_id: string;
  service_id: string;
  status: string;
}

interface PayoutResult {
  coach_payout: number;
  dietitian_payout: number;
  igu_ops: number;
  igu_profit: number;
  total: number;
  blocked: boolean;
  block_reason: string | null;
  coach_level?: string;
  dietitian_level?: string;
}

interface PayoutRow {
  subscription: Subscription;
  clientName: string;
  serviceName: string;
  coachName: string;
  coachLevel: string | null;
  payout: PayoutResult | null;
  error?: string;
}

export function SubscriptionPayoutPreview() {
  const { toast } = useToast();
  const hasFetched = useRef(false);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<PayoutRow[]>([]);
  const [coachFilter, setCoachFilter] = useState<string>("all");
  const [coaches, setCoaches] = useState<{ user_id: string; name: string }[]>([]);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch active subscriptions
      const { data: subs, error: subsError } = await supabase
        .from("subscriptions")
        .select("id, user_id, coach_id, service_id, status")
        .in("status", ["active", "pending"]);

      if (subsError) throw subsError;
      if (!subs || subs.length === 0) {
        setRows([]);
        setCoaches([]);
        setLoading(false);
        return;
      }

      // Get unique IDs for batch lookups
      const clientIds = [...new Set(subs.map(s => s.user_id))];
      const coachIds = [...new Set(subs.map(s => s.coach_id).filter(Boolean))];
      const serviceIds = [...new Set(subs.map(s => s.service_id))];

      // Fetch client names (separate query — FK join unreliable)
      const { data: clientProfiles } = await supabase
        .from("profiles_public")
        .select("id, first_name, display_name")
        .in("id", clientIds);
      const clientNameMap = new Map(
        (clientProfiles || []).map(p => [p.id, p.display_name || p.first_name || "Unknown"])
      );

      // Fetch coach names
      const { data: coachProfiles } = await supabase
        .from("coaches_full")
        .select("user_id, first_name, last_name, coach_level")
        .in("user_id", coachIds);
      const coachNameMap = new Map(
        (coachProfiles || []).map(c => [c.user_id, `${c.first_name || ""} ${c.last_name || ""}`.trim()])
      );
      const coachLevelMap = new Map(
        (coachProfiles || []).map(c => [c.user_id, c.coach_level])
      );

      // Build coach list for filter
      const coachList = (coachProfiles || []).map(c => ({
        user_id: c.user_id!,
        name: `${c.first_name || ""} ${c.last_name || ""}`.trim(),
      }));
      setCoaches(coachList);

      // Fetch service names
      const { data: services } = await supabase
        .from("services")
        .select("id, name")
        .in("id", serviceIds);
      const serviceNameMap = new Map(
        (services || []).map(s => [s.id, s.name])
      );

      // Calculate payout for each subscription via RPC
      const payoutRows: PayoutRow[] = [];
      for (const sub of subs) {
        let payout: PayoutResult | null = null;
        let error: string | undefined;

        try {
          const { data, error: rpcError } = await supabase.rpc(
            "calculate_subscription_payout",
            {
              p_subscription_id: sub.id,
              p_discount_percentage: 0,
            }
          );
          if (rpcError) throw rpcError;
          payout = data as unknown as PayoutResult;
        } catch (e: any) {
          error = e.message || "Calculation failed";
        }

        payoutRows.push({
          subscription: sub,
          clientName: clientNameMap.get(sub.user_id) || "Unknown",
          serviceName: serviceNameMap.get(sub.service_id) || "Unknown",
          coachName: coachNameMap.get(sub.coach_id) || "Unassigned",
          coachLevel: coachLevelMap.get(sub.coach_id) || null,
          payout,
          error,
        });
      }

      setRows(payoutRows);
    } catch (error: any) {
      toast({
        title: "Error loading payouts",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    fetchData();
  }, [fetchData]);

  const filteredRows = coachFilter === "all"
    ? rows
    : rows.filter(r => r.subscription.coach_id === coachFilter);

  // Calculate totals
  const totals = filteredRows.reduce(
    (acc, r) => {
      if (r.payout && !r.payout.blocked) {
        acc.coach += r.payout.coach_payout;
        acc.dietitian += r.payout.dietitian_payout;
        acc.ops += r.payout.igu_ops;
        acc.profit += r.payout.igu_profit;
        acc.total += r.payout.total;
      }
      return acc;
    },
    { coach: 0, dietitian: 0, ops: 0, profit: 0, total: 0 }
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-4">
            <CardTitle>Subscription Payout Preview</CardTitle>
            <Select value={coachFilter} onValueChange={setCoachFilter}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Filter by coach" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Coaches</SelectItem>
                {coaches.map(c => (
                  <SelectItem key={c.user_id} value={c.user_id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {filteredRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No active subscriptions found
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Client</TableHead>
                      <TableHead>Service</TableHead>
                      <TableHead>Coach (Level)</TableHead>
                      <TableHead className="text-right">Coach Payout</TableHead>
                      <TableHead className="text-right">Diet Payout</TableHead>
                      <TableHead className="text-right">IGU Ops</TableHead>
                      <TableHead className="text-right">IGU Profit</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TooltipProvider>
                      {filteredRows.map(row => (
                        <TableRow
                          key={row.subscription.id}
                          className={row.payout?.blocked ? "bg-destructive/10" : ""}
                        >
                          <TableCell className="font-medium">{row.clientName}</TableCell>
                          <TableCell>{row.serviceName}</TableCell>
                          <TableCell>
                            {row.coachName}
                            {row.coachLevel && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                {LEVEL_LABELS[row.coachLevel as ProfessionalLevel] || row.coachLevel}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.payout ? `${row.payout.coach_payout.toFixed(2)} KWD` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.payout ? `${row.payout.dietitian_payout.toFixed(2)} KWD` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.payout ? `${row.payout.igu_ops.toFixed(2)} KWD` : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.payout ? (
                              <span className={row.payout.igu_profit < 5 ? "text-destructive font-medium" : ""}>
                                {row.payout.igu_profit.toFixed(2)} KWD
                              </span>
                            ) : "—"}
                          </TableCell>
                          <TableCell>
                            {row.error ? (
                              <Badge variant="destructive">Error</Badge>
                            ) : row.payout?.blocked ? (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge variant="destructive" className="gap-1">
                                    <AlertTriangle className="h-3 w-3" />
                                    Blocked
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  {row.payout.block_reason || "Unknown reason"}
                                </TooltipContent>
                              </Tooltip>
                            ) : (
                              <Badge variant="default">OK</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TooltipProvider>

                    {/* Totals Row */}
                    <TableRow className="font-semibold border-t-2">
                      <TableCell colSpan={3}>Totals ({filteredRows.length} subscriptions)</TableCell>
                      <TableCell className="text-right">{totals.coach.toFixed(2)} KWD</TableCell>
                      <TableCell className="text-right">{totals.dietitian.toFixed(2)} KWD</TableCell>
                      <TableCell className="text-right">{totals.ops.toFixed(2)} KWD</TableCell>
                      <TableCell className="text-right">{totals.profit.toFixed(2)} KWD</TableCell>
                      <TableCell></TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>

              <Alert className="mt-4">
                <Info className="h-4 w-4" />
                <AlertDescription>
                  Payouts calculated using <code className="text-xs bg-muted px-1 py-0.5 rounded">calculate_subscription_payout()</code>.
                  Discounts are applied proportionally across coach, dietitian, and IGU profit (operations costs are never discounted).
                </AlertDescription>
              </Alert>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
