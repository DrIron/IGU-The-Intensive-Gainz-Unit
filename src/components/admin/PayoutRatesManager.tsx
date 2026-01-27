/**
 * Payout Rates Manager Admin UI
 * 
 * This component displays and allows editing of coach payout rates using the NEW tables:
 * - payout_rules: Per-service payout percentages/fixed amounts
 * - addon_payout_rules: Per-addon payout percentages/fixed amounts
 * 
 * IMPORTANT: Coach payouts are calculated from GROSS prices (before discounts).
 * Discounts do not reduce coach compensation.
 */

import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Save, Wallet, Users, DollarSign, TrendingUp, Calendar, AlertCircle, Percent } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { logPayoutRuleChange } from "@/lib/auditLog";

interface PayoutRule {
  id: string;
  service_id: string;
  service_name: string;
  service_type: string;
  price_kwd: number;
  primary_payout_type: 'percent' | 'fixed';
  primary_payout_value: number;
  platform_fee_type: 'percent' | 'fixed' | 'none';
  platform_fee_value: number;
}

interface AddonPayoutRule {
  id: string;
  addon_id: string;
  addon_name: string;
  addon_code: string;
  price_kwd: number;
  payout_type: 'percent' | 'fixed';
  payout_value: number;
  payout_recipient_role: 'primary_coach' | 'addon_staff';
}

interface CoachSummary {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  total_clients: number;
  base_payout: number;
  addon_payout: number;
  total_payout: number;
}

export function PayoutRatesManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [payoutRules, setPayoutRules] = useState<PayoutRule[]>([]);
  const [addonPayoutRules, setAddonPayoutRules] = useState<AddonPayoutRule[]>([]);
  const [coaches, setCoaches] = useState<CoachSummary[]>([]);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      await Promise.all([loadPayoutRules(), loadAddonPayoutRules(), loadCoachSummaries()]);
    } finally {
      setLoading(false);
    }
  };

  const loadPayoutRules = async () => {
    try {
      const { data, error } = await supabase
        .from('payout_rules')
        .select(`
          id,
          service_id,
          primary_payout_type,
          primary_payout_value,
          platform_fee_type,
          platform_fee_value,
          services!inner(name, type),
          service_pricing!inner(price_kwd)
        `);

      if (error) throw error;

      const rules: PayoutRule[] = (data || []).map((r: any) => ({
        id: r.id,
        service_id: r.service_id,
        service_name: r.services?.name || 'Unknown',
        service_type: r.services?.type || 'unknown',
        price_kwd: Number(r.service_pricing?.price_kwd || 0),
        primary_payout_type: r.primary_payout_type,
        primary_payout_value: Number(r.primary_payout_value),
        platform_fee_type: r.platform_fee_type,
        platform_fee_value: Number(r.platform_fee_value),
      }));

      setPayoutRules(rules);
    } catch (error: any) {
      console.error("Error loading payout rules:", error);
    }
  };

  const loadAddonPayoutRules = async () => {
    try {
      const { data, error } = await supabase
        .from('addon_payout_rules')
        .select(`
          id,
          addon_id,
          payout_type,
          payout_value,
          payout_recipient_role,
          addon_pricing!inner(name, code, price_kwd)
        `);

      if (error) throw error;

      const rules: AddonPayoutRule[] = (data || []).map((r: any) => ({
        id: r.id,
        addon_id: r.addon_id,
        addon_name: r.addon_pricing?.name || 'Unknown',
        addon_code: r.addon_pricing?.code || '',
        price_kwd: Number(r.addon_pricing?.price_kwd || 0),
        payout_type: r.payout_type,
        payout_value: Number(r.payout_value),
        payout_recipient_role: r.payout_recipient_role,
      }));

      setAddonPayoutRules(rules);
    } catch (error: any) {
      console.error("Error loading addon payout rules:", error);
    }
  };

  const loadCoachSummaries = async () => {
    try {
      // Get coaches
      const { data: coachData } = await supabase
        .from("coaches")
        .select("id, user_id, first_name, last_name")
        .eq("status", "active");

      if (!coachData) return;

      // Get service pricing from NEW table
      const { data: servicePricing } = await supabase
        .from('service_pricing')
        .select('service_id, price_kwd')
        .eq('is_active', true);

      const pricingMap = new Map(servicePricing?.map(s => [s.service_id, Number(s.price_kwd)]) || []);

      // Get payout rules
      const { data: payoutRulesData } = await supabase
        .from('payout_rules')
        .select('service_id, primary_payout_type, primary_payout_value');

      const payoutRulesMap = new Map(payoutRulesData?.map(r => [r.service_id, r]) || []);

      // Get services for categorization
      const { data: services } = await supabase
        .from("services")
        .select("id, type, name");

      const serviceMap = new Map(services?.map(s => [s.id, { type: s.type, name: s.name }]) || []);

      // Get active subscriptions with non-exempt profiles
      const { data: subscriptions } = await supabase
        .from("subscriptions")
        .select(`
          coach_id,
          service_id,
          profiles!inner(payment_exempt)
        `)
        .eq("status", "active");

      // Get active add-ons for staff payout
      const { data: addons } = await supabase
        .from("subscription_addons")
        .select("staff_user_id, payout_kwd")
        .eq("status", "active");

      // Calculate per-coach stats
      const coachStats = new Map<string, { clients: number; basePayout: number; addonPayout: number }>();

      // Initialize all coaches
      coachData.forEach(coach => {
        coachStats.set(coach.user_id, {
          clients: 0,
          basePayout: 0,
          addonPayout: 0,
        });
      });

      // Count clients and calculate payouts using NEW formula
      subscriptions?.forEach(sub => {
        if (!sub.coach_id || (sub.profiles as any)?.payment_exempt) return;

        const stats = coachStats.get(sub.coach_id);
        if (!stats) return;

        stats.clients++;

        // Calculate payout from NEW tables
        const price = pricingMap.get(sub.service_id) || 0;
        const rule = payoutRulesMap.get(sub.service_id);
        
        if (rule) {
          if (rule.primary_payout_type === 'percent') {
            stats.basePayout += price * (Number(rule.primary_payout_value) / 100);
          } else {
            stats.basePayout += Number(rule.primary_payout_value);
          }
        } else {
          // Fallback to 70% if no rule
          stats.basePayout += price * 0.70;
        }
      });

      // Sum addon payouts by staff
      addons?.forEach(addon => {
        if (!addon.staff_user_id) return;
        const stats = coachStats.get(addon.staff_user_id);
        if (stats) {
          stats.addonPayout += addon.payout_kwd || 0;
        }
      });

      // Build summary array
      const summaries: CoachSummary[] = coachData.map(coach => {
        const stats = coachStats.get(coach.user_id)!;
        return {
          id: coach.id,
          user_id: coach.user_id,
          first_name: coach.first_name,
          last_name: coach.last_name || "",
          total_clients: stats.clients,
          base_payout: stats.basePayout,
          addon_payout: stats.addonPayout,
          total_payout: stats.basePayout + stats.addonPayout,
        };
      });

      setCoaches(summaries.filter(c => c.total_clients > 0 || c.addon_payout > 0));
    } catch (error: any) {
      console.error("Error loading coach summaries:", error);
    }
  };

  const handleUpdatePayoutRule = async (ruleId: string, updates: Partial<PayoutRule>) => {
    try {
      setSaving(true);

      const { data: { user } } = await supabase.auth.getUser();
      
      // Get current rule for before state
      const currentRule = payoutRules.find(r => r.id === ruleId);
      const beforeState = currentRule ? {
        primary_payout_type: currentRule.primary_payout_type,
        primary_payout_value: currentRule.primary_payout_value,
        platform_fee_type: currentRule.platform_fee_type,
        platform_fee_value: currentRule.platform_fee_value,
      } : {};
      
      const afterState = {
        primary_payout_type: updates.primary_payout_type,
        primary_payout_value: updates.primary_payout_value,
        platform_fee_type: updates.platform_fee_type,
        platform_fee_value: updates.platform_fee_value,
      };

      const { error } = await supabase
        .from('payout_rules')
        .update({
          primary_payout_type: updates.primary_payout_type,
          primary_payout_value: updates.primary_payout_value,
          platform_fee_type: updates.platform_fee_type,
          platform_fee_value: updates.platform_fee_value,
          updated_by: user?.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', ruleId);

      if (error) throw error;

      // Log audit entry
      await logPayoutRuleChange('payout_rules', ruleId, currentRule?.service_name || 'Unknown', beforeState, afterState);

      toast({
        title: "Payout Rule Updated",
        description: "The payout rule has been saved successfully.",
      });

      setEditingRuleId(null);
      await loadData();
    } catch (error: any) {
      console.error("Error updating payout rule:", error);
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCalculateMonthly = async () => {
    try {
      setCalculating(true);

      const { data, error } = await supabase.functions.invoke("calculate-monthly-coach-payments");

      if (error) throw error;

      toast({
        title: "Monthly Payments Calculated",
        description: `Processed ${data.coaches_processed} coaches. Gross: ${data.gross_revenue_kwd?.toFixed(2)} KWD, Net: ${data.net_collected_kwd?.toFixed(2)} KWD, Coach Payout: ${data.total_coach_payout?.toFixed(2)} KWD`,
      });

      await loadCoachSummaries();
    } catch (error: any) {
      console.error("Error calculating:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to calculate monthly payments",
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  };

  const totalClients = coaches.reduce((sum, c) => sum + c.total_clients, 0);
  const totalBasePayout = coaches.reduce((sum, c) => sum + c.base_payout, 0);
  const totalAddonPayout = coaches.reduce((sum, c) => sum + c.addon_payout, 0);
  const totalPayout = totalBasePayout + totalAddonPayout;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Info Alert */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Coach payouts are calculated from GROSS prices.</strong> Discounts given to clients do not reduce coach compensation.
          Configure payout percentages below per service/add-on.
        </AlertDescription>
      </Alert>

      {/* Service Payout Rules */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Service Payout Rules</CardTitle>
                <CardDescription>
                  Configure coach payout percentages for each service type
                </CardDescription>
              </div>
            </div>
            <Button variant="outline" onClick={handleCalculateMonthly} disabled={calculating}>
              <Calendar className="h-4 w-4 mr-2" />
              {calculating ? "Calculating..." : "Calculate Monthly"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Type</TableHead>
                <TableHead className="text-right">Price (KWD)</TableHead>
                <TableHead className="text-right">Coach Payout</TableHead>
                <TableHead className="text-right">Coach Amount</TableHead>
                <TableHead className="text-right">Platform Fee</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payoutRules.map((rule) => {
                const isEditing = editingRuleId === rule.id;
                const coachAmount = rule.primary_payout_type === 'percent'
                  ? rule.price_kwd * (rule.primary_payout_value / 100)
                  : rule.primary_payout_value;

                return (
                  <TableRow key={rule.id}>
                    <TableCell className="font-medium">{rule.service_name}</TableCell>
                    <TableCell>
                      <Badge variant={rule.service_type === 'team' ? 'secondary' : 'outline'}>
                        {rule.service_type === 'one_to_one' ? '1:1' : 'Team'}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">{rule.price_kwd.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      {isEditing ? (
                        <div className="flex items-center gap-2 justify-end">
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="1"
                            className="w-20 text-right"
                            value={rule.primary_payout_value}
                            onChange={(e) => {
                              const value = parseFloat(e.target.value) || 0;
                              setPayoutRules(prev => prev.map(r => 
                                r.id === rule.id ? { ...r, primary_payout_value: value } : r
                              ));
                            }}
                          />
                          <span>%</span>
                        </div>
                      ) : (
                        <span className="font-medium">{rule.primary_payout_value}%</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-green-600 font-semibold">
                      {coachAmount.toFixed(2)} KWD
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {rule.platform_fee_value}%
                    </TableCell>
                    <TableCell>
                      {isEditing ? (
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            onClick={() => handleUpdatePayoutRule(rule.id, rule)}
                            disabled={saving}
                          >
                            <Save className="h-3 w-3 mr-1" />
                            Save
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => {
                              setEditingRuleId(null);
                              loadPayoutRules();
                            }}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button 
                          size="sm" 
                          variant="ghost"
                          onClick={() => setEditingRuleId(rule.id)}
                        >
                          Edit
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Add-on Payout Rules */}
      {addonPayoutRules.length > 0 && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Percent className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>Add-on Payout Rules</CardTitle>
                <CardDescription>
                  Configure payout rules for add-on services
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Add-on</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead className="text-right">Price (KWD)</TableHead>
                  <TableHead className="text-right">Payout</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Recipient</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {addonPayoutRules.map((rule) => {
                  const payoutAmount = rule.payout_type === 'percent'
                    ? rule.price_kwd * (rule.payout_value / 100)
                    : rule.payout_value;

                  return (
                    <TableRow key={rule.id}>
                      <TableCell className="font-medium">{rule.addon_name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-1 py-0.5 rounded">{rule.addon_code}</code>
                      </TableCell>
                      <TableCell className="text-right">{rule.price_kwd.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        {rule.payout_value}{rule.payout_type === 'percent' ? '%' : ' KWD'}
                      </TableCell>
                      <TableCell className="text-right text-green-600 font-semibold">
                        {payoutAmount.toFixed(2)} KWD
                      </TableCell>
                      <TableCell>
                        <Badge variant={rule.payout_recipient_role === 'primary_coach' ? 'default' : 'secondary'}>
                          {rule.payout_recipient_role === 'primary_coach' ? 'Primary Coach' : 'Add-on Staff'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1">
              <Users className="h-4 w-4" />
              Active Coaches
            </CardDescription>
            <CardTitle className="text-3xl">{coaches.length}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1">
              <TrendingUp className="h-4 w-4" />
              Paying Clients
            </CardDescription>
            <CardTitle className="text-3xl">{totalClients}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1">
              <Wallet className="h-4 w-4" />
              Base Payouts
            </CardDescription>
            <CardTitle className="text-3xl">{totalBasePayout.toFixed(2)} KWD</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardDescription className="flex items-center gap-1">
              <DollarSign className="h-4 w-4" />
              Total Payouts
            </CardDescription>
            <CardTitle className="text-3xl">{totalPayout.toFixed(2)} KWD</CardTitle>
            {totalAddonPayout > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Includes {totalAddonPayout.toFixed(2)} KWD in add-on payouts
              </p>
            )}
          </CardHeader>
        </Card>
      </div>

      {/* Coach Payout Table */}
      <Card>
        <CardHeader>
          <CardTitle>Coach Payout Summary</CardTitle>
          <CardDescription>
            Current month estimated payouts based on active subscriptions (from GROSS prices)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Coach</TableHead>
                <TableHead className="text-right">Clients</TableHead>
                <TableHead className="text-right">Base Payout</TableHead>
                <TableHead className="text-right">Add-on Payout</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {coaches.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                    No active coach assignments
                  </TableCell>
                </TableRow>
              ) : (
                coaches.map((coach) => (
                  <TableRow key={coach.id}>
                    <TableCell className="font-medium">
                      {coach.first_name} {coach.last_name}
                    </TableCell>
                    <TableCell className="text-right">{coach.total_clients}</TableCell>
                    <TableCell className="text-right">{coach.base_payout.toFixed(2)} KWD</TableCell>
                    <TableCell className="text-right">
                      {coach.addon_payout > 0 ? (
                        <Badge variant="secondary">{coach.addon_payout.toFixed(2)} KWD</Badge>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right font-semibold text-green-600">
                      {coach.total_payout.toFixed(2)} KWD
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
