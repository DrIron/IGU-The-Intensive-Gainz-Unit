/**
 * Coach Payment Calculator Admin UI
 * 
 * Displays coach payouts calculated using the new pricing infrastructure:
 * - service_pricing: Base prices for services
 * - payout_rules: Coach payout percentages/fixed amounts per service
 * - addon_pricing: Add-on service prices
 * - addon_payout_rules: Payout rules for add-on services
 * 
 * FORMULA (documented for transparency):
 * ═══════════════════════════════════════════════════════════════════════════
 * Coach Payout = Σ (service_pricing.price_kwd × payout_rules.primary_payout_value%)
 *              + Σ (addon_pricing.price_kwd × addon_payout_rules.payout_value%)
 * 
 * ⚠️ DISCOUNTS DO NOT REDUCE COACH PAYOUT
 * Coach is always paid based on GROSS price (list price before discounts)
 * Discounts are absorbed by IGU as a customer acquisition cost
 * ═══════════════════════════════════════════════════════════════════════════
 */

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, CheckCircle2, TrendingDown, DollarSign, Percent, Info, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

interface Coach {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
}

interface ServiceBreakdown {
  team: number;
  onetoone_inperson: number;
  onetoone_hybrid: number;
  onetoone_online: number;
  total: number;
}

interface CoachWithClients extends Coach {
  clients: ServiceBreakdown;
  estimated_payment: number;
  gross_revenue: number;
}

interface PayoutRule {
  service_id: string;
  service_name: string;
  service_type: string;
  price_kwd: number;
  primary_payout_type: string;
  primary_payout_value: number;
  platform_fee_type: string;
  platform_fee_value: number;
}

interface MonthlyPayment {
  id: string;
  payment_month: string;
  coach_id: string;
  client_breakdown: any;
  payment_rates: any;
  total_clients: number;
  total_payment: number;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
  gross_revenue_kwd: number;
  discounts_applied_kwd: number;
  net_collected_kwd: number;
  coaches: {
    first_name: string;
    last_name: string;
  };
}

export function CoachPaymentCalculator() {
  const { toast } = useToast();
  const [coaches, setCoaches] = useState<CoachWithClients[]>([]);
  const [loading, setLoading] = useState(true);
  const [monthlyPayments, setMonthlyPayments] = useState<MonthlyPayment[]>([]);
  const [loadingMonthly, setLoadingMonthly] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [payoutRules, setPayoutRules] = useState<PayoutRule[]>([]);
  const [showFormula, setShowFormula] = useState(false);

  useEffect(() => {
    loadPayoutRules();
    loadData();
    loadMonthlyPayments();
  }, [loadData]);

  // Load payout rules from NEW tables
  const loadPayoutRules = async () => {
    try {
      const { data, error } = await supabase
        .from('payout_rules')
        .select(`
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
      console.error('Error loading payout rules:', error);
    }
  };

  // Calculate coach payout using NEW formula
  const calculatePayoutForService = useCallback((serviceId: string): number => {
    const rule = payoutRules.find(r => r.service_id === serviceId);
    if (!rule) return 0;

    if (rule.primary_payout_type === 'percent') {
      return rule.price_kwd * (rule.primary_payout_value / 100);
    } else {
      return rule.primary_payout_value;
    }
  }, [payoutRules]);

  const handleCalculateMonthlyPayments = async () => {
    try {
      setCalculating(true);

      const { data, error } = await supabase.functions.invoke('calculate-monthly-coach-payments');

      if (error) throw error;

      toast({
        title: "Monthly Payments Calculated",
        description: `Processed ${data.coaches_processed} coaches for ${data.month}. Gross: ${data.gross_revenue_kwd?.toFixed(2) || 0} KWD, Net: ${data.net_collected_kwd?.toFixed(2) || 0} KWD`,
      });

      loadMonthlyPayments();
    } catch (error: any) {
      console.error('Error calculating monthly payments:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setCalculating(false);
    }
  };

  const loadMonthlyPayments = async () => {
    try {
      setLoadingMonthly(true);

      const { data, error } = await supabase
        .from('monthly_coach_payments' as any)
        .select('*, coaches(first_name, last_name)')
        .order('payment_month', { ascending: false })
        .limit(100);

      if (error) throw error;

      setMonthlyPayments((data as any) || []);
    } catch (error: any) {
      console.error('Error loading monthly payments:', error);
    } finally {
      setLoadingMonthly(false);
    }
  };

  const markAsPaid = async (paymentId: string) => {
    try {
      const { error } = await supabase
        .from('monthly_coach_payments' as any)
        .update({
          is_paid: true,
          paid_at: new Date().toISOString(),
        })
        .eq('id', paymentId);

      if (error) throw error;

      toast({
        title: "Payment Marked as Paid",
        description: "The payment record has been updated",
      });

      loadMonthlyPayments();
    } catch (error: any) {
      console.error('Error marking payment as paid:', error);
      toast({
        title: "Error",
        description: "Failed to update payment status",
        variant: "destructive",
      });
    }
  };

  const loadData = useCallback(async () => {
    try {
      setLoading(true);

      const { data: coachRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .eq('role', 'coach');

      const coachUserIds = coachRoles?.map(r => r.user_id) || [];

      if (coachUserIds.length === 0) {
        setCoaches([]);
        setLoading(false);
        return;
      }

      const { data: coachDetails, error: coachError } = await supabase
        .from('coaches')
        .select('*')
        .eq('status', 'active')
        .in('user_id', coachUserIds);

      if (coachError) throw coachError;

      // Load service pricing from NEW table
      const { data: servicePricing } = await supabase
        .from('service_pricing')
        .select('service_id, price_kwd')
        .eq('is_active', true);

      const pricingMap = new Map(servicePricing?.map(s => [s.service_id, Number(s.price_kwd)]) || []);

      const { data: services } = await supabase
        .from('services')
        .select('id, type, name');

      const serviceMap = new Map(services?.map(s => [s.id, { type: s.type, name: s.name }]) || []);

      const { data: subscriptions } = await supabase
        .from('subscriptions')
        .select('coach_id, service_id, user_id')
        .eq('status', 'active');

      // Fetch payment_exempt separately (profiles is a VIEW, FK joins fail)
      const subUserIds = [...new Set((subscriptions || []).map(s => s.user_id))];
      const { data: exemptProfiles } = await supabase
        .from("profiles")
        .select("id, payment_exempt")
        .in("id", subUserIds);
      const exemptMap = new Map((exemptProfiles || []).map(p => [p.id, p.payment_exempt]));

      const coachClientCounts = new Map<string, ServiceBreakdown>();
      const coachGrossRevenue = new Map<string, number>();
      const coachPayout = new Map<string, number>();

      subscriptions?.forEach(sub => {
        const isPaymentExempt = exemptMap.get(sub.user_id);
        
        if (!sub.coach_id || isPaymentExempt) return;

        if (!coachClientCounts.has(sub.coach_id)) {
          coachClientCounts.set(sub.coach_id, {
            team: 0,
            onetoone_inperson: 0,
            onetoone_hybrid: 0,
            onetoone_online: 0,
            total: 0,
          });
          coachGrossRevenue.set(sub.coach_id, 0);
          coachPayout.set(sub.coach_id, 0);
        }

        const breakdown = coachClientCounts.get(sub.coach_id)!;
        const service = serviceMap.get(sub.service_id);
        const serviceType = service?.type;
        const serviceName = service?.name?.toLowerCase() || '';
        
        // Use NEW pricing table
        const servicePrice = pricingMap.get(sub.service_id) || 0;

        // Track gross revenue
        const currentGross = coachGrossRevenue.get(sub.coach_id) || 0;
        coachGrossRevenue.set(sub.coach_id, currentGross + servicePrice);

        // Calculate payout using NEW formula
        const payout = calculatePayoutForService(sub.service_id);
        const currentPayout = coachPayout.get(sub.coach_id) || 0;
        coachPayout.set(sub.coach_id, currentPayout + payout);

        if (serviceType === 'team') {
          breakdown.team++;
        } else if (serviceType === 'one_to_one') {
          if (serviceName.includes('in-person') || serviceName.includes('inperson')) {
            breakdown.onetoone_inperson++;
          } else if (serviceName.includes('hybrid')) {
            breakdown.onetoone_hybrid++;
          } else if (serviceName.includes('online')) {
            breakdown.onetoone_online++;
          }
        }
        
        breakdown.total++;
      });

      const coachesWithClients: CoachWithClients[] = (coachDetails || []).map(coach => {
        const clients = coachClientCounts.get(coach.user_id) || {
          team: 0,
          onetoone_inperson: 0,
          onetoone_hybrid: 0,
          onetoone_online: 0,
          total: 0,
        };
        
        return {
          ...coach,
          clients,
          estimated_payment: coachPayout.get(coach.user_id) || 0,
          gross_revenue: coachGrossRevenue.get(coach.user_id) || 0,
        };
      });

      setCoaches(coachesWithClients);
    } catch (error: any) {
      console.error('Error loading coach data:', error);
      toast({
        title: "Error",
        description: "Failed to load coach payment data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [calculatePayoutForService, toast]);

  const totalPayments = coaches.reduce((sum, c) => sum + c.estimated_payment, 0);
  const totalClients = coaches.reduce((sum, c) => sum + c.clients.total, 0);
  const totalGrossRevenue = coaches.reduce((sum, c) => sum + c.gross_revenue, 0);

  const monthlyPaymentsByMonth = monthlyPayments.reduce((acc, payment) => {
    const month = payment.payment_month;
    if (!acc[month]) {
      acc[month] = [];
    }
    acc[month].push(payment);
    return acc;
  }, {} as Record<string, MonthlyPayment[]>);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Formula Documentation */}
      <Collapsible open={showFormula} onOpenChange={setShowFormula}>
        <Card>
          <CardHeader className="pb-3">
            <CollapsibleTrigger asChild>
              <Button variant="ghost" className="w-full justify-between p-0 h-auto hover:bg-transparent">
                <div className="flex items-center gap-2">
                  <Info className="h-5 w-5 text-blue-500" />
                  <div className="text-left">
                    <CardTitle className="text-base">Payout Calculation Formula</CardTitle>
                    <CardDescription>Click to view how coach payouts are calculated</CardDescription>
                  </div>
                </div>
                <Badge variant="outline">{showFormula ? 'Hide' : 'Show'}</Badge>
              </Button>
            </CollapsibleTrigger>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="pt-0">
              <Alert className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Discounts Do NOT Reduce Coach Payout</AlertTitle>
                <AlertDescription>
                  Coaches are always paid based on the GROSS service price (list price before discounts).
                  Any discounts given to clients are absorbed by IGU as a customer acquisition cost.
                </AlertDescription>
              </Alert>
              
              <div className="space-y-4">
                <div className="bg-muted rounded-lg p-4 font-mono text-sm">
                  <p className="font-semibold mb-2">Base Service Payout:</p>
                  <p className="text-muted-foreground">
                    coach_payout = service_pricing.price_kwd × payout_rules.primary_payout_value%
                  </p>
                </div>

                {payoutRules.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Current Payout Rules:</p>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service</TableHead>
                          <TableHead className="text-right">Price (KWD)</TableHead>
                          <TableHead className="text-right">Coach %</TableHead>
                          <TableHead className="text-right">Coach Payout</TableHead>
                          <TableHead className="text-right">Platform %</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payoutRules.map((rule) => {
                          const coachPayout = rule.primary_payout_type === 'percent' 
                            ? rule.price_kwd * (rule.primary_payout_value / 100)
                            : rule.primary_payout_value;
                          return (
                            <TableRow key={rule.service_id}>
                              <TableCell className="font-medium">{rule.service_name}</TableCell>
                              <TableCell className="text-right">{rule.price_kwd.toFixed(2)}</TableCell>
                              <TableCell className="text-right">
                                {rule.primary_payout_type === 'percent' 
                                  ? `${rule.primary_payout_value}%` 
                                  : `${rule.primary_payout_value} KWD (fixed)`}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-green-600">
                                {coachPayout.toFixed(2)} KWD
                              </TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {rule.platform_fee_type === 'percent' 
                                  ? `${rule.platform_fee_value}%` 
                                  : `${rule.platform_fee_value} KWD`}
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}

                <p className="text-xs text-muted-foreground">
                  Data source: <code>service_pricing</code>, <code>payout_rules</code>, <code>addon_pricing</code>, <code>addon_payout_rules</code>
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Tabs defaultValue="current" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="current">Current Month</TabsTrigger>
          <TabsTrigger value="monthly">
            <Calendar className="mr-2 h-4 w-4" />
            Monthly Records
          </TabsTrigger>
        </TabsList>

        <TabsContent value="current" className="space-y-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Calculate Monthly Payments</CardTitle>
                  <CardDescription>
                    Run the monthly calculation to record coach payouts based on current payout rules
                  </CardDescription>
                </div>
                <Button onClick={handleCalculateMonthlyPayments} disabled={calculating}>
                  <Calendar className="mr-2 h-4 w-4" />
                  {calculating ? "Calculating..." : "Calculate Monthly Payments"}
                </Button>
              </div>
            </CardHeader>
          </Card>

          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Coaches</CardDescription>
                <CardTitle className="text-4xl">{coaches.length}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Total Active Clients</CardDescription>
                <CardTitle className="text-4xl">{totalClients}</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Gross Revenue (List Price)</CardDescription>
                <CardTitle className="text-4xl">{totalGrossRevenue.toFixed(2)} KWD</CardTitle>
              </CardHeader>
            </Card>
            <Card>
              <CardHeader className="pb-3">
                <CardDescription>Coach Payout (from Gross)</CardDescription>
                <CardTitle className="text-4xl text-green-600">{totalPayments.toFixed(2)} KWD</CardTitle>
              </CardHeader>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Current Breakdown</CardTitle>
              <CardDescription>Preview of what will be saved when monthly calculation runs</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Coach</TableHead>
                    <TableHead className="text-right">Team</TableHead>
                    <TableHead className="text-right">In-Person</TableHead>
                    <TableHead className="text-right">Hybrid</TableHead>
                    <TableHead className="text-right">Online</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Gross Revenue</TableHead>
                    <TableHead className="text-right">Payout</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {coaches.map((coach) => (
                    <TableRow key={coach.id}>
                      <TableCell className="font-medium">
                        {coach.first_name} {coach.last_name}
                      </TableCell>
                      <TableCell className="text-right">{coach.clients.team}</TableCell>
                      <TableCell className="text-right">{coach.clients.onetoone_inperson}</TableCell>
                      <TableCell className="text-right">{coach.clients.onetoone_hybrid}</TableCell>
                      <TableCell className="text-right">{coach.clients.onetoone_online}</TableCell>
                      <TableCell className="text-right font-medium">{coach.clients.total}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {coach.gross_revenue.toFixed(2)} KWD
                      </TableCell>
                      <TableCell className="text-right font-semibold text-green-600">
                        {coach.estimated_payment.toFixed(2)} KWD
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="monthly" className="space-y-4">
          {loadingMonthly ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : Object.keys(monthlyPaymentsByMonth).length === 0 ? (
            <Card>
              <CardContent className="py-8">
                <p className="text-center text-muted-foreground">
                  No monthly records yet. Click "Calculate Monthly Payments" to create the first record.
                </p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(monthlyPaymentsByMonth).map(([month, payments]) => {
              const monthTotal = payments.reduce((sum, p) => sum + p.total_payment, 0);
              const monthGross = payments.reduce((sum, p) => sum + (p.gross_revenue_kwd || 0), 0);
              const monthDiscounts = payments.reduce((sum, p) => sum + (p.discounts_applied_kwd || 0), 0);
              const monthNet = payments.reduce((sum, p) => sum + (p.net_collected_kwd || 0), 0) || (monthGross - monthDiscounts);
              const platformRetained = monthNet - monthTotal;
              
              return (
                <Card key={month}>
                  <CardHeader>
                    <CardTitle>{new Date(month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</CardTitle>
                    <CardDescription className="space-y-1">
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-2">
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Gross Revenue</p>
                            <p className="font-semibold">{monthGross.toFixed(2)} KWD</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Percent className="h-4 w-4 text-orange-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Discounts Given</p>
                            <p className="font-semibold text-orange-600">−{monthDiscounts.toFixed(2)} KWD</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <TrendingDown className="h-4 w-4 text-blue-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Net Collected</p>
                            <p className="font-semibold text-blue-600">{monthNet.toFixed(2)} KWD</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="h-4 w-4 text-green-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Coach Payout</p>
                            <p className="font-semibold text-green-600">{monthTotal.toFixed(2)} KWD</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-purple-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Platform Retained</p>
                            <p className="font-semibold text-purple-600">{platformRetained.toFixed(2)} KWD</p>
                          </div>
                        </div>
                      </div>
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Coach</TableHead>
                          <TableHead className="text-right">Team</TableHead>
                          <TableHead className="text-right">In-Person</TableHead>
                          <TableHead className="text-right">Hybrid</TableHead>
                          <TableHead className="text-right">Online</TableHead>
                          <TableHead className="text-right">Clients</TableHead>
                          <TableHead className="text-right">Gross</TableHead>
                          <TableHead className="text-right">Discounts</TableHead>
                          <TableHead className="text-right">Total Payout</TableHead>
                          <TableHead className="text-right">Status</TableHead>
                          <TableHead></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {payments.map((payment) => {
                          const b = payment.client_breakdown;
                          const addonPayout = b.addon_payout || 0;
                          return (
                            <TableRow key={payment.id}>
                              <TableCell className="font-medium">{payment.coaches.first_name} {payment.coaches.last_name}</TableCell>
                              <TableCell className="text-right">{b.team || 0}</TableCell>
                              <TableCell className="text-right">{b.onetoone_inperson || 0}</TableCell>
                              <TableCell className="text-right">{b.onetoone_hybrid || 0}</TableCell>
                              <TableCell className="text-right">{b.onetoone_online || 0}</TableCell>
                              <TableCell className="text-right">{payment.total_clients}</TableCell>
                              <TableCell className="text-right text-muted-foreground">
                                {(payment.gross_revenue_kwd || 0).toFixed(2)}
                              </TableCell>
                              <TableCell className="text-right text-orange-600">
                                {payment.discounts_applied_kwd > 0 ? `−${payment.discounts_applied_kwd.toFixed(2)}` : '—'}
                              </TableCell>
                              <TableCell className="text-right font-semibold text-green-600">
                                {payment.total_payment.toFixed(2)} KWD
                                {addonPayout > 0 && (
                                  <span className="text-xs text-muted-foreground block">
                                    (incl. +{addonPayout.toFixed(2)} add-ons)
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="text-right">
                                {payment.is_paid ? (
                                  <Badge variant="default"><CheckCircle2 className="h-3 w-3 mr-1" />Paid</Badge>
                                ) : (
                                  <Badge variant="secondary">Pending</Badge>
                                )}
                              </TableCell>
                              <TableCell>
                                {!payment.is_paid && (
                                  <Button size="sm" variant="outline" onClick={() => markAsPaid(payment.id)}>
                                    Mark Paid
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
              );
            })
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
