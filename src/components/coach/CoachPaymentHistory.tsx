import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Loader2, DollarSign, CheckCircle2, Clock } from "lucide-react";

interface MonthlyPayment {
  id: string;
  payment_month: string;
  client_breakdown: {
    team: number;
    onetoone_inperson: number;
    onetoone_hybrid: number;
    onetoone_online: number;
  };
  payment_rates: {
    team: number;
    onetoone_inperson: number;
    onetoone_hybrid: number;
    onetoone_online: number;
  };
  total_clients: number;
  total_payment: number;
  is_paid: boolean;
  paid_at: string | null;
  created_at: string;
}

export function CoachPaymentHistory() {
  const { toast } = useToast();
  const [payments, setPayments] = useState<MonthlyPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [coachId, setCoachId] = useState<string | null>(null);

  useEffect(() => {
    loadCoachPayments();
  }, []);

  const loadCoachPayments = async () => {
    try {
      setLoading(true);

      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('Not authenticated');
      }

      // Get coach record for current user
      const { data: coach, error: coachError } = await supabase
        .from('coaches')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (coachError) throw coachError;
      if (!coach) {
        toast({
          title: "Not a Coach",
          description: "You don't have a coach profile",
          variant: "destructive",
        });
        return;
      }

      setCoachId(coach.id);

      // Load monthly payments for this coach
      const { data: monthlyPayments, error: paymentsError } = await supabase
        .from('monthly_coach_payments' as any)
        .select('*')
        .eq('coach_id', coach.id)
        .order('payment_month', { ascending: false });

      if (paymentsError) throw paymentsError;

      setPayments((monthlyPayments as any) || []);
    } catch (error: any) {
      console.error('Error loading payment history:', error);
      toast({
        title: "Error",
        description: "Failed to load payment history",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const totalEarned = payments
    .filter(p => p.is_paid)
    .reduce((sum, p) => sum + p.total_payment, 0);

  const totalPending = payments
    .filter(p => !p.is_paid)
    .reduce((sum, p) => sum + p.total_payment, 0);

  return (
    <Accordion type="single" collapsible className="mb-6" defaultValue="payment-history">
      <AccordionItem value="payment-history" className="border rounded-lg">
        <AccordionTrigger className="px-6 py-4 hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="text-left">
              <h3 className="text-lg font-semibold">Payment History</h3>
              <p className="text-sm text-muted-foreground">Your monthly payment breakdown and history</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Total Earned</p>
                <p className="text-lg font-semibold text-green-600 flex items-center">
                  <DollarSign className="h-4 w-4 mr-1" />
                  {totalEarned.toFixed(2)} KWD
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-lg font-semibold text-orange-600 flex items-center">
                  <Clock className="h-4 w-4 mr-1" />
                  {totalPending.toFixed(2)} KWD
                </p>
              </div>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent className="px-6 pb-6">
          <div className="space-y-6 pt-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>This Month's Estimate</CardDescription>
                  <CardTitle className="text-3xl flex items-center text-primary">
                    <DollarSign className="h-6 w-6 mr-1" />
                    {payments.length > 0 ? payments[0].total_payment.toFixed(3) : '0.000'} KWD
                  </CardTitle>
                  <p className="text-sm text-muted-foreground mt-2">
                    {payments.length > 0 ? payments[0].payment_month : 'No data available'}
                  </p>
                </CardHeader>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardDescription>Payment Records</CardDescription>
                  <CardTitle className="text-3xl">
                    {payments.length}
                  </CardTitle>
                </CardHeader>
              </Card>
            </div>

            {payments.length === 0 ? (
              <Card>
                <CardContent className="py-8">
                  <p className="text-center text-muted-foreground">
                    No payment history available yet. Payment records are created on the 1st of each month.
                  </p>
                </CardContent>
              </Card>
            ) : (
              payments.map((payment) => (
                <Card key={payment.id}>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>
                          {new Date(payment.payment_month).toLocaleDateString('en-US', { 
                            month: 'long', 
                            year: 'numeric' 
                          })}
                        </CardTitle>
                        <CardDescription>
                          {payment.total_clients} total clients • {payment.total_payment.toFixed(2)} KWD
                        </CardDescription>
                      </div>
                      {payment.is_paid ? (
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Paid
                        </Badge>
                      ) : (
                        <Badge variant="secondary" className="gap-1">
                          <Clock className="h-3 w-3" />
                          Pending
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service Type</TableHead>
                          <TableHead className="text-right">Clients</TableHead>
                          <TableHead className="text-right">Rate (KWD)</TableHead>
                          <TableHead className="text-right">Amount (KWD)</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        <TableRow>
                          <TableCell>Team Plans</TableCell>
                          <TableCell className="text-right">{payment.client_breakdown.team || 0}</TableCell>
                          <TableCell className="text-right">{payment.payment_rates.team.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {((payment.client_breakdown.team || 0) * payment.payment_rates.team).toFixed(2)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>1:1 In-Person</TableCell>
                          <TableCell className="text-right">{payment.client_breakdown.onetoone_inperson || 0}</TableCell>
                          <TableCell className="text-right">{payment.payment_rates.onetoone_inperson.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {((payment.client_breakdown.onetoone_inperson || 0) * payment.payment_rates.onetoone_inperson).toFixed(2)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>1:1 Hybrid</TableCell>
                          <TableCell className="text-right">{payment.client_breakdown.onetoone_hybrid || 0}</TableCell>
                          <TableCell className="text-right">{payment.payment_rates.onetoone_hybrid.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {((payment.client_breakdown.onetoone_hybrid || 0) * payment.payment_rates.onetoone_hybrid).toFixed(2)}
                          </TableCell>
                        </TableRow>
                        <TableRow>
                          <TableCell>1:1 Online</TableCell>
                          <TableCell className="text-right">{payment.client_breakdown.onetoone_online || 0}</TableCell>
                          <TableCell className="text-right">{payment.payment_rates.onetoone_online.toFixed(2)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {((payment.client_breakdown.onetoone_online || 0) * payment.payment_rates.onetoone_online).toFixed(2)}
                          </TableCell>
                        </TableRow>
                        <TableRow className="bg-muted/50 font-semibold">
                          <TableCell>Total</TableCell>
                          <TableCell className="text-right">{payment.total_clients}</TableCell>
                          <TableCell></TableCell>
                          <TableCell className="text-right text-lg">{payment.total_payment.toFixed(2)}</TableCell>
                        </TableRow>
                      </TableBody>
                    </Table>
                    {payment.paid_at && (
                      <p className="text-sm text-muted-foreground mt-4">
                        Paid on {new Date(payment.paid_at).toLocaleDateString()}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
