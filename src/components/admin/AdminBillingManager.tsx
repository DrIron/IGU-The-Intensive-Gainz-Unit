import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Calendar,
  CreditCard,
  Clock,
  AlertTriangle,
  CheckCircle2,
  Send,
  Shield,
  History,
  Loader2,
  Search,
  RefreshCw,
} from "lucide-react";
import { format, addDays, differenceInDays } from "date-fns";

interface BillingClient {
  id: string;
  user_id: string;
  status: string;
  next_billing_date: string | null;
  past_due_since: string | null;
  grace_period_days: number;
  billing_amount_kwd: number | null;
  profiles: {
    id: string;
    first_name: string | null;
    email: string;
    status: string;
    payment_exempt: boolean;
  };
  services: {
    name: string;
    price_kwd: number;
  };
}

interface PaymentRecord {
  id: string;
  tap_charge_id: string;
  amount_kwd: number;
  status: string;
  created_at: string;
  paid_at: string | null;
  is_renewal: boolean;
}

interface AuditLogEntry {
  id: string;
  action_type: string;
  details: any;
  created_at: string;
}

export function AdminBillingManager() {
  const [clients, setClients] = useState<BillingClient[]>([]);
  const [filteredClients, setFilteredClients] = useState<BillingClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedClient, setSelectedClient] = useState<BillingClient | null>(null);
  const [paymentHistory, setPaymentHistory] = useState<PaymentRecord[]>([]);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [actionLoading, setActionLoading] = useState(false);
  
  // Dialog states
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);
  const [showExtendGraceDialog, setShowExtendGraceDialog] = useState(false);
  const [showMarkPaidDialog, setShowMarkPaidDialog] = useState(false);
  const [extendDays, setExtendDays] = useState(7);
  const [manualPaymentAmount, setManualPaymentAmount] = useState("");
  const [manualPaymentNote, setManualPaymentNote] = useState("");
  
  const { toast } = useToast();

  const loadClients = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          status,
          next_billing_date,
          past_due_since,
          grace_period_days,
          billing_amount_kwd,
          services (name, price_kwd)
        `)
        .in("status", ["active", "past_due", "pending", "inactive"])
        .order("next_billing_date", { ascending: true });

      if (error) throw error;

      // Fetch profiles separately (profiles is a VIEW, FK joins fail)
      const userIds = [...new Set((data || []).map(s => s.user_id))];
      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, first_name, email, status, payment_exempt")
        .in("id", userIds);
      const profileMap = new Map((profilesData || []).map(p => [p.id, p]));

      const processedData = (data || []).map(sub => ({
        ...sub,
        profiles: profileMap.get(sub.user_id) || null,
        services: Array.isArray(sub.services) ? sub.services[0] : sub.services,
      })) as BillingClient[];

      setClients(processedData);
    } catch (error) {
      console.error("Error loading clients:", error);
      toast({
        title: "Error",
        description: "Failed to load billing data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const filterClients = useCallback(() => {
    let filtered = [...clients];

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.profiles?.first_name?.toLowerCase().includes(query) ||
          c.profiles?.email?.toLowerCase().includes(query)
      );
    }

    if (statusFilter !== "all") {
      filtered = filtered.filter((c) => c.status === statusFilter);
    }

    setFilteredClients(filtered);
  }, [clients, searchQuery, statusFilter]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  useEffect(() => {
    filterClients();
  }, [filterClients]);

  const loadClientDetails = async (client: BillingClient) => {
    setSelectedClient(client);
    setShowDetailsDialog(true);

    // Load payment history
    const { data: payments } = await supabase
      .from("subscription_payments")
      .select("id, tap_charge_id, amount_kwd, status, created_at, paid_at, is_renewal")
      .eq("subscription_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);

    setPaymentHistory((payments || []) as PaymentRecord[]);

    // Load audit log for this subscription
    const { data: auditData } = await supabase
      .from("admin_audit_log")
      .select("id, action_type, details, created_at")
      .eq("target_type", "subscription")
      .eq("target_id", client.id)
      .order("created_at", { ascending: false })
      .limit(20);

    setAuditLog((auditData || []) as AuditLogEntry[]);
  };

  const logAuditAction = async (
    actionType: string,
    targetId: string,
    details: any
  ) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    await supabase.from("admin_audit_log").insert({
      admin_user_id: user.id,
      action_type: actionType,
      target_type: "subscription",
      target_id: targetId,
      details,
    });
  };

  const handleExtendGrace = async () => {
    if (!selectedClient) return;
    setActionLoading(true);

    try {
      const newPastDueSince = selectedClient.past_due_since
        ? new Date(selectedClient.past_due_since)
        : new Date();
      
      // Extend by adjusting the past_due_since date backwards
      const extendedDate = addDays(newPastDueSince, extendDays);

      await supabase
        .from("subscriptions")
        .update({ 
          past_due_since: selectedClient.past_due_since 
            ? addDays(new Date(selectedClient.past_due_since), extendDays).toISOString()
            : null,
          grace_period_days: (selectedClient.grace_period_days || 7) + extendDays,
        })
        .eq("id", selectedClient.id);

      await logAuditAction("extend_grace_period", selectedClient.id, {
        days_extended: extendDays,
        client_email: selectedClient.profiles.email,
        previous_grace_days: selectedClient.grace_period_days,
        new_grace_days: (selectedClient.grace_period_days || 7) + extendDays,
      });

      toast({
        title: "Grace Period Extended",
        description: `Extended grace period by ${extendDays} days`,
      });

      setShowExtendGraceDialog(false);
      loadClients();
      loadClientDetails(selectedClient);
    } catch (error) {
      console.error("Error extending grace:", error);
      toast({
        title: "Error",
        description: "Failed to extend grace period",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleMarkPaidManually = async () => {
    if (!selectedClient) return;
    setActionLoading(true);

    try {
      const amount = parseFloat(manualPaymentAmount) || 
        selectedClient.billing_amount_kwd || 
        selectedClient.services?.price_kwd || 0;

      const nextBillingDate = addDays(new Date(), 30);

      // Update subscription to active
      await supabase
        .from("subscriptions")
        .update({
          status: "active",
          past_due_since: null,
          next_billing_date: nextBillingDate.toISOString(),
        })
        .eq("id", selectedClient.id);

      // Update profile status if needed
      if (selectedClient.profiles.status !== "active") {
        await supabase
          .from("profiles_public")
          .update({ status: "active" })
          .eq("id", selectedClient.user_id);
      }

      // Create a payment record for the manual payment
      await supabase.from("subscription_payments").insert({
        subscription_id: selectedClient.id,
        user_id: selectedClient.user_id,
        tap_charge_id: `MANUAL_${Date.now()}`,
        amount_kwd: amount,
        status: "paid",
        is_renewal: selectedClient.status !== "pending",
        paid_at: new Date().toISOString(),
        metadata: {
          payment_method: "manual",
          note: manualPaymentNote || "Marked paid by admin",
        },
      });

      await logAuditAction("mark_paid_manually", selectedClient.id, {
        amount_kwd: amount,
        client_email: selectedClient.profiles.email,
        note: manualPaymentNote,
        next_billing_date: nextBillingDate.toISOString(),
      });

      toast({
        title: "Payment Recorded",
        description: `Marked as paid (${amount} KWD). Next billing: ${format(nextBillingDate, "MMM dd, yyyy")}`,
      });

      setShowMarkPaidDialog(false);
      setManualPaymentAmount("");
      setManualPaymentNote("");
      loadClients();
      loadClientDetails(selectedClient);
    } catch (error) {
      console.error("Error marking paid:", error);
      toast({
        title: "Error",
        description: "Failed to mark payment as complete",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleTogglePaymentExempt = async () => {
    if (!selectedClient) return;
    setActionLoading(true);

    try {
      const newExemptStatus = !selectedClient.profiles.payment_exempt;

      await supabase
        .from("profiles_public")
        .update({ payment_exempt: newExemptStatus })
        .eq("id", selectedClient.user_id);

      // If setting to exempt, also activate the subscription
      if (newExemptStatus) {
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            past_due_since: null,
          })
          .eq("id", selectedClient.id);

        await supabase
          .from("profiles_public")
          .update({ status: "active" })
          .eq("id", selectedClient.user_id);
      }

      await logAuditAction("toggle_payment_exempt", selectedClient.id, {
        client_email: selectedClient.profiles.email,
        new_exempt_status: newExemptStatus,
      });

      toast({
        title: newExemptStatus ? "Payment Exempt Enabled" : "Payment Exempt Disabled",
        description: newExemptStatus 
          ? "Client is now exempt from payments" 
          : "Client must now pay for subscription",
      });

      loadClients();
      loadClientDetails({
        ...selectedClient,
        profiles: { ...selectedClient.profiles, payment_exempt: newExemptStatus },
      });
    } catch (error) {
      console.error("Error toggling exempt:", error);
      toast({
        title: "Error",
        description: "Failed to update payment exempt status",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSendReminderNow = async () => {
    if (!selectedClient) return;
    setActionLoading(true);

    try {
      const { error } = await supabase.functions.invoke("send-payment-reminder", {
        body: {
          email: selectedClient.profiles.email,
          name: selectedClient.profiles.first_name || "there",
          daysRemaining: selectedClient.past_due_since 
            ? Math.max(0, (selectedClient.grace_period_days || 7) - differenceInDays(new Date(), new Date(selectedClient.past_due_since)))
            : differenceInDays(new Date(selectedClient.next_billing_date!), new Date()),
          serviceName: selectedClient.services?.name,
          stage: selectedClient.status === "past_due" ? "active_grace" : "approved_waiting_payment",
        },
      });

      if (error) throw error;

      await logAuditAction("send_reminder_manually", selectedClient.id, {
        client_email: selectedClient.profiles.email,
        subscription_status: selectedClient.status,
      });

      toast({
        title: "Reminder Sent",
        description: `Payment reminder sent to ${selectedClient.profiles.email}`,
      });
    } catch (error) {
      console.error("Error sending reminder:", error);
      toast({
        title: "Error",
        description: "Failed to send reminder",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const getStatusBadge = (status: string, pastDueSince: string | null, gracePeriodDays: number) => {
    if (status === "active" && !pastDueSince) {
      return <Badge className="bg-status-success">Active</Badge>;
    }
    if (status === "past_due" || pastDueSince) {
      const daysPastDue = pastDueSince 
        ? differenceInDays(new Date(), new Date(pastDueSince))
        : 0;
      const daysRemaining = gracePeriodDays - daysPastDue;
      
      if (daysRemaining <= 0) {
        return <Badge variant="destructive">Grace Expired</Badge>;
      }
      return (
        <Badge variant="destructive">
          Past Due ({daysRemaining}d left)
        </Badge>
      );
    }
    if (status === "inactive") {
      return <Badge variant="secondary">Inactive</Badge>;
    }
    if (status === "pending") {
      return <Badge variant="outline">Pending</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  const getDaysUntilDue = (nextBillingDate: string | null) => {
    if (!nextBillingDate) return null;
    return differenceInDays(new Date(nextBillingDate), new Date());
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-12 flex items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                Billing Management
              </CardTitle>
              <CardDescription>
                Manage client billing, grace periods, and manual payments
              </CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadClients}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter by status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="past_due">Past Due</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold">{clients.length}</p>
            </div>
            <div className="bg-status-success/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Active</p>
              <p className="text-2xl font-bold text-status-success">
                {clients.filter((c) => c.status === "active" && !c.past_due_since).length}
              </p>
            </div>
            <div className="bg-destructive/10 rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Past Due</p>
              <p className="text-2xl font-bold text-destructive">
                {clients.filter((c) => c.status === "past_due" || c.past_due_since).length}
              </p>
            </div>
            <div className="bg-muted rounded-lg p-4">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold">
                {clients.filter((c) => c.status === "pending").length}
              </p>
            </div>
          </div>

          {/* Clients Table */}
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Next Due</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredClients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No clients found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredClients.map((client) => {
                    const daysUntilDue = getDaysUntilDue(client.next_billing_date);
                    return (
                      <TableRow key={client.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium">
                              {client.profiles?.first_name || "Unknown"}
                              {client.profiles?.payment_exempt && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  Exempt
                                </Badge>
                              )}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {client.profiles?.email}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell>{client.services?.name || "—"}</TableCell>
                        <TableCell>
                          {getStatusBadge(
                            client.status,
                            client.past_due_since,
                            client.grace_period_days || 7
                          )}
                        </TableCell>
                        <TableCell>
                          {client.next_billing_date ? (
                            <div>
                              <p>{format(new Date(client.next_billing_date), "MMM dd, yyyy")}</p>
                              {daysUntilDue !== null && (
                                <p className={`text-xs ${
                                  daysUntilDue < 0 
                                    ? "text-destructive" 
                                    : daysUntilDue <= 7 
                                      ? "text-warning" 
                                      : "text-muted-foreground"
                                }`}>
                                  {daysUntilDue < 0 
                                    ? `${Math.abs(daysUntilDue)} days overdue`
                                    : daysUntilDue === 0 
                                      ? "Due today"
                                      : `In ${daysUntilDue} days`
                                  }
                                </p>
                              )}
                            </div>
                          ) : (
                            "—"
                          )}
                        </TableCell>
                        <TableCell>
                          {client.billing_amount_kwd ?? client.services?.price_kwd ?? 0} KWD
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => loadClientDetails(client)}
                          >
                            Manage
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Client Details Dialog */}
      <Dialog open={showDetailsDialog} onOpenChange={setShowDetailsDialog}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5" />
              Billing Details: {selectedClient?.profiles?.first_name}
            </DialogTitle>
            <DialogDescription>
              {selectedClient?.profiles?.email}
            </DialogDescription>
          </DialogHeader>

          <ScrollArea className="flex-1 pr-4">
            <div className="space-y-6">
              {/* Current Status */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Status</p>
                  <div>
                    {selectedClient && getStatusBadge(
                      selectedClient.status,
                      selectedClient.past_due_since,
                      selectedClient.grace_period_days || 7
                    )}
                  </div>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Next Billing</p>
                  <p className="font-medium">
                    {selectedClient?.next_billing_date
                      ? format(new Date(selectedClient.next_billing_date), "MMM dd, yyyy")
                      : "—"
                    }
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Amount</p>
                  <p className="font-medium">
                    {selectedClient?.billing_amount_kwd ?? selectedClient?.services?.price_kwd ?? 0} KWD
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-sm text-muted-foreground">Grace Period</p>
                  <p className="font-medium">{selectedClient?.grace_period_days || 7} days</p>
                </div>
              </div>

              {selectedClient?.past_due_since && (
                <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-destructive">Past Due Since</span>
                  </div>
                  <p className="text-sm">
                    {format(new Date(selectedClient.past_due_since), "MMMM dd, yyyy 'at' h:mm a")}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Grace deadline:{" "}
                    {format(
                      addDays(new Date(selectedClient.past_due_since), selectedClient.grace_period_days || 7),
                      "MMMM dd, yyyy"
                    )}
                  </p>
                </div>
              )}

              <Separator />

              {/* Actions */}
              <div>
                <h4 className="font-medium mb-3">Quick Actions</h4>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowExtendGraceDialog(true)}
                    disabled={actionLoading}
                  >
                    <Clock className="h-4 w-4 mr-2" />
                    Extend Grace
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setManualPaymentAmount(
                        String(selectedClient?.billing_amount_kwd ?? selectedClient?.services?.price_kwd ?? 0)
                      );
                      setShowMarkPaidDialog(true);
                    }}
                    disabled={actionLoading}
                  >
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Mark Paid
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleTogglePaymentExempt}
                    disabled={actionLoading}
                  >
                    <Shield className="h-4 w-4 mr-2" />
                    {selectedClient?.profiles?.payment_exempt ? "Remove Exempt" : "Set Exempt"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSendReminderNow}
                    disabled={actionLoading}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send Reminder
                  </Button>
                </div>
              </div>

              <Separator />

              {/* Payment History */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Payment History
                </h4>
                {paymentHistory.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No payment records found</p>
                ) : (
                  <div className="space-y-2">
                    {paymentHistory.map((payment) => (
                      <div
                        key={payment.id}
                        className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
                      >
                        <div>
                          <p className="text-sm font-medium">
                            {payment.amount_kwd} KWD
                            {payment.is_renewal && (
                              <Badge variant="outline" className="ml-2 text-xs">
                                Renewal
                              </Badge>
                            )}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {format(new Date(payment.created_at), "MMM dd, yyyy h:mm a")}
                          </p>
                        </div>
                        <Badge
                          variant={payment.status === "paid" ? "default" : "secondary"}
                          className={payment.status === "paid" ? "bg-status-success" : ""}
                        >
                          {payment.status}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              {/* Audit Log */}
              <div>
                <h4 className="font-medium mb-3 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Admin Actions Log
                </h4>
                {auditLog.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No admin actions recorded</p>
                ) : (
                  <div className="space-y-2">
                    {auditLog.map((log) => (
                      <div
                        key={log.id}
                        className="p-3 bg-muted/30 rounded-lg text-sm"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium capitalize">
                            {log.action_type.replace(/_/g, " ")}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(log.created_at), "MMM dd, h:mm a")}
                          </span>
                        </div>
                        {log.details && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {JSON.stringify(log.details)}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDetailsDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Extend Grace Dialog */}
      <Dialog open={showExtendGraceDialog} onOpenChange={setShowExtendGraceDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Extend Grace Period</DialogTitle>
            <DialogDescription>
              Add extra days to the client's grace period before their account is deactivated.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Days to Extend</Label>
              <Input
                type="number"
                min={1}
                max={30}
                value={extendDays}
                onChange={(e) => setExtendDays(parseInt(e.target.value) || 7)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Current grace period: {selectedClient?.grace_period_days || 7} days
              <br />
              New grace period: {(selectedClient?.grace_period_days || 7) + extendDays} days
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowExtendGraceDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleExtendGrace} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Extend Grace
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Dialog */}
      <Dialog open={showMarkPaidDialog} onOpenChange={setShowMarkPaidDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark Payment as Complete</DialogTitle>
            <DialogDescription>
              Record a manual payment (cash, bank transfer, etc.) and activate the subscription.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Amount (KWD)</Label>
              <Input
                type="number"
                min={0}
                step={0.01}
                value={manualPaymentAmount}
                onChange={(e) => setManualPaymentAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Note (optional)</Label>
              <Input
                placeholder="e.g., Cash payment received"
                value={manualPaymentNote}
                onChange={(e) => setManualPaymentNote(e.target.value)}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              This will set the subscription to active and set the next billing date to 30 days from now.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowMarkPaidDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMarkPaidManually} disabled={actionLoading}>
              {actionLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Record Payment
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
