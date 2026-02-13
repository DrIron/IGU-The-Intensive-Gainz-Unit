import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, XCircle, Star, FileCheck, LayoutGrid, LayoutList, Trash2, MoreVertical, Edit, Stethoscope, Mail, Check, X, Inbox } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { ClientCardView } from "@/components/ClientCardView";
import { formatProfileStatus, getProfileStatusVariant } from "@/lib/statusUtils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "@/components/ui/form";
import { ManualClientCreation } from "@/components/ManualClientCreation";
import { PersonalDetailsFields } from "@/components/forms/PersonalDetailsFields";
import { CoachReassignmentSection } from "@/components/admin/CoachReassignmentSection";
// NOTE: ReviewPendingClientsDialog removed - coach approvals are handled exclusively in CoachMyClientsPage
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';
import { SimplePagination, usePagination } from "@/components/ui/simple-pagination";

interface Client {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string;
  phone: string | null;
  status: string | null;
  created_at: string;
  subscriptions: Array<{
    id: string;
    status: string;
    start_date: string;
    next_billing_date: string;
    added_to_truecoach_team: boolean;
    service_id: string;
    coach_id: string | null;
    cancel_at_period_end: boolean;
    services: {
      id: string;
      name: string;
      price_kwd: number;
      type: string;
    };
  }>;
}

// NOTE: This component is ADMIN-ONLY. Coaches use CoachMyClientsPage.
interface ClientListProps {
  filter?: string;
  programFilter?: string;
  onViewClient?: (clientId: string) => void;
  initialTab?: string;
}

const clientEditSchema = z.object({
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email("Invalid email address"),
  phone: z.string().optional(),
  date_of_birth: z.string().optional(),
  gender: z.enum(["male", "female", "other", "prefer_not_to_say"]).optional(),
});

type ClientEditFormData = z.infer<typeof clientEditSchema>;

const planAbbreviations: Record<string, string> = {
  "Female Fitness Essentials": "Fe",
  "Body of Steel": "BoS",
  "1:1 Online": "1:1 O",
  "1:1 Hybrid": "1:1 H",
  "1:1 In-Person": "1:1 I",
};

const getClientDisplayName = (client: Client): string => {
  if (client.full_name) return client.full_name;
  if (client.first_name && client.last_name) return `${client.first_name} ${client.last_name}`;
  if (client.first_name) return client.first_name;
  return "-";
};

export default function ClientList({ filter, programFilter, onViewClient, initialTab }: ClientListProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [activeTab, setActiveTab] = useState<string>(initialTab || "active");
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [tabPages, setTabPages] = useState<Record<string, number>>({});
  const CLIENTS_PER_PAGE = 25;
  // Note: isReviewPendingOpen removed - coach approvals handled in CoachMyClientsPage

  const form = useForm<ClientEditFormData>({
    resolver: zodResolver(clientEditSchema),
    defaultValues: {
      first_name: "",
      last_name: "",
      email: "",
      phone: "",
      date_of_birth: "",
      gender: undefined,
    },
  });

  const fetchClients = useCallback(async () => {
    try {
      // Admin uses profiles view (security_invoker=true, RLS-protected for admin)
      // This allows fetching all client data including PII for admin pages
      const query = supabase
        .from("profiles")
        .select(`
          *,
          subscriptions (
            id,
            status,
            start_date,
            next_billing_date,
            added_to_truecoach_team,
            service_id,
            coach_id,
            cancel_at_period_end,
            services (
              id,
              name,
              price_kwd,
              type
            )
          )
        `)
        .order("created_at", { ascending: false });

      // This component is admin-only - fetch all clients

      const { data, error } = await query;

      if (error) throw error;

      // Filter out users with admin or coach roles (not just any role)
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("user_id")
        .in("role", ["admin", "coach"]);

      const adminCoachUserIds = new Set(rolesData?.map(r => r.user_id) || []);
      const clientsOnly = (data || []).filter(user => !adminCoachUserIds.has(user.id));

      setClients(clientsOnly as Client[]);
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  // Apply filters
  let filteredClients = clients;

  // Filter by program
  if (programFilter) {
    filteredClients = filteredClients.filter(client => 
      client.subscriptions?.some(sub => sub.service_id === programFilter)
    );
  }

  // Filter by alert type
  if (filter === 'missed-logs') {
    // Only show 1:1 clients who haven't logged this week
    const startOfWeek = new Date();
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    startOfWeek.setHours(0, 0, 0, 0);

    filteredClients = filteredClients.filter(client => {
      const activeSubscription = client.subscriptions?.find(sub => sub.status === "active");
      const isOneToOne = activeSubscription?.services?.type?.toString().toLowerCase().includes('1:1');
      return isOneToOne;
      // Note: Would need to check weight_logs but keeping simple for now
    });
  } else if (filter === 'payment-issues') {
    filteredClients = filteredClients.filter(client => 
      client.status === 'payment_failed' || client.status === 'inactive'
    );
  } else if (filter === 'new-signups') {
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    filteredClients = filteredClients.filter(client => 
      new Date(client.created_at) >= sevenDaysAgo
    );
  }

  const pendingClients = filteredClients.filter((client) => {
    return (
      client.status === 'pending' ||
      client.status === 'pending_payment' ||
      client.status === 'pending_coach_approval' ||
      // Also include clients whose subscription is pending even if profile status differs
      client.subscriptions?.some((sub) => sub.status === 'pending')
    );
  });

  const activeClients = filteredClients.filter((client) => {
    return client.subscriptions?.some((sub) => sub.status === "active");
  });

  const oldClients = filteredClients.filter(client => 
    client.status === 'cancelled' || client.status === 'expired'
  );

  // Default to pending tab if there are pending clients on initial load (once only)
  const hasAutoSwitchedTab = useRef(false);
  useEffect(() => {
    if (!loading && !hasAutoSwitchedTab.current && pendingClients.length > 0 && activeTab === "active") {
      hasAutoSwitchedTab.current = true;
      setActiveTab("pending");
    }
  }, [loading, pendingClients.length, activeTab]);

  useEffect(() => {
    if (editingClient) {
      form.reset({
        first_name: editingClient.first_name || editingClient.full_name?.split(' ')[0] || "",
        last_name: editingClient.last_name || editingClient.full_name?.split(' ').slice(1).join(' ') || "",
        email: editingClient.email || "",
        phone: editingClient.phone || "",
        date_of_birth: "",
        gender: undefined,
      });
    }
  }, [editingClient, form]);

  const handleEditClient = (client: Client) => {
    setEditingClient(client);
    setIsEditDialogOpen(true);
  };

  const onSubmitEdit = async (data: ClientEditFormData) => {
    if (!editingClient) return;

    try {
      // Update profiles_public (public fields)
      const { error: publicError } = await supabase
        .from("profiles_public")
        .update({
          first_name: data.first_name,
          display_name: `${data.first_name} ${data.last_name}`,
        })
        .eq("id", editingClient.id);

      if (publicError) throw publicError;

      // Update profiles_private (PII fields)
      const { error: privateError } = await supabase
        .from("profiles_private")
        .update({
          full_name: `${data.first_name} ${data.last_name}`,
          last_name: data.last_name,
          email: data.email,
          phone: data.phone,
          date_of_birth: data.date_of_birth || null,
        })
        .eq("profile_id", editingClient.id);

      const error = privateError;

      if (error) throw error;

      toast({
        title: "Client Updated",
        description: "Client information has been updated successfully.",
      });

      setIsEditDialogOpen(false);
      setEditingClient(null);
      fetchClients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleCancelSubscription = async (subscriptionId: string, clientName: string, clientId: string, clientEmail: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to cancel ${clientName}'s subscription? They will keep access until the end of their billing period, and all future payments will be stopped immediately.`
    );

    if (!confirmed) return;

    try {
      const { error } = await supabase.functions.invoke('cancel-subscription', {
        body: { 
          userId: clientId,
          reason: 'Admin cancelled subscription',
          cancelledBy: 'admin',
        },
      });

      if (error) throw error;

      toast({
        title: "Subscription Cancelled",
        description: `${clientName}'s subscription has been cancelled. They will retain access until the end of their billing period.`,
      });

      // Refresh the client list
      fetchClients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleReactivateSubscription = async (clientId: string, clientName: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to reactivate ${clientName}'s subscription?`
    );

    if (!confirmed) return;

    try {
      const { data, error } = await supabase.functions.invoke('reactivate-subscription', {
        body: { userId: clientId },
      });

      if (error) throw error;

      toast({
        title: "Subscription Reactivated",
        description: `${clientName}'s subscription has been reactivated. They will be redirected to complete payment.`,
      });

      // Refresh the client list
      fetchClients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleApproveClient = async (userId: string, email: string, clientName: string) => {
    try {
      // Check if client needs medical review from form submission
      const { data: formData } = await supabase
        .from('form_submissions')
        .select('needs_medical_review')
        .eq('user_id', userId)
        .single();

      const needsMedicalReview = formData?.needs_medical_review || false;
      const newStatus = needsMedicalReview ? 'needs_medical_review' : 'pending_payment';

      // Set payment deadline to 7 days from now if pending payment
      const paymentDeadline = new Date();
      paymentDeadline.setDate(paymentDeadline.getDate() + 7);

      // Update profile status in profiles_public
      const { error: profileError } = await supabase
        .from('profiles_public')
        .update({ 
          status: newStatus,
          payment_deadline: newStatus === 'pending_payment' ? paymentDeadline.toISOString() : null
        })
        .eq('id', userId);

      if (profileError) throw profileError;

      // Sync with Airtable
      const { error: syncError } = await supabase.functions.invoke('sync-airtable', {
        body: { userId, status: newStatus, email },
      });

      if (syncError) {
        console.error('Airtable sync error:', syncError);
        toast({
          title: "Client Approved",
          description: needsMedicalReview 
            ? `${clientName} flagged for medical review, but Airtable sync failed.`
            : `${clientName} approved with 7-day payment deadline, but Airtable sync failed.`,
        });
      } else {
        toast({
          title: "Client Approved",
          description: needsMedicalReview
            ? `${clientName} has been flagged for medical review.`
            : `${clientName} has been approved. Payment deadline: 7 days.`,
        });
      }

      fetchClients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleRejectClient = async (userId: string, email: string, clientName: string) => {
    try {
      // Use cancel-subscription edge function for proper cancellation
      const { error } = await supabase.functions.invoke('cancel-subscription', {
        body: { 
          userId,
          reason: 'Application rejected by admin',
          adminCancellation: true
        },
      });

      if (error) throw error;

      const displayName = clientName || 'Client';
      
      toast({
        title: "Client Rejected",
        description: `${displayName}'s application has been rejected.`,
      });

      fetchClients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleViewSubmission = (userId: string) => {
    navigate(`/client-submission/${userId}`);
  };

  const handleTeamAssignmentToggle = async (subscriptionId: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('subscriptions')
        .update({ added_to_truecoach_team: !currentStatus })
        .eq('id', subscriptionId);

      if (error) throw error;

      toast({
        title: "Success",
        description: !currentStatus 
          ? "Client marked as added to TrueCoach team" 
          : "Client marked as not added to TrueCoach team",
      });

      fetchClients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const sendTestimonialRequest = async (clientEmail: string, clientName: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get coach name - coaches can view their own profile via coaches table
      // This is a coach-initiated action, not client-facing
      const { data: coachData } = await supabase
        .from('coaches')
        .select('first_name, last_name')
        .eq('user_id', user.id)
        .single();

      const coachName = coachData ? `${coachData.first_name} ${coachData.last_name}` : 'Your Coach';

      await supabase.functions.invoke('send-testimonial-request', {
        body: {
          clientEmail,
          clientName,
          coachId: user.id,
          coachName,
        },
      });

      toast({
        title: "Testimonial Request Sent",
        description: `Testimonial request email sent to ${clientName}`,
      });
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  const handleDeleteClient = async (userId: string, clientName: string) => {
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { userId }
      });

      if (error) throw error;

      toast({
        title: "Client Deleted",
        description: `${clientName}'s account and all billing have been permanently deleted.`,
      });

      fetchClients();
    } catch (error: any) {
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive",
      });
    }
  };

  // NOTE: Coach-specific approval logic has been removed from ClientList.
  // All coach approvals are handled exclusively in CoachMyClientsPage.
  // This component is ADMIN-ONLY.

  const paginateTab = (tabKey: string, clientList: Client[]) => {
    const page = tabPages[tabKey] || 1;
    const { paginate } = usePagination(clientList, CLIENTS_PER_PAGE);
    return { ...paginate(page), tabKey };
  };

  const renderPaginationForTab = (tabKey: string, totalPages: number, currentPage: number, totalItems: number) => (
    <SimplePagination
      currentPage={currentPage}
      totalPages={totalPages}
      onPageChange={(p) => setTabPages(prev => ({ ...prev, [tabKey]: p }))}
      totalItems={totalItems}
      pageSize={CLIENTS_PER_PAGE}
    />
  );

  const renderClientTable = (clientList: Client[], showDocumentVerification: boolean = false) => (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs md:text-sm py-3">Name</TableHead>
            <TableHead className="hidden md:table-cell text-xs md:text-sm py-3">Email</TableHead>
            <TableHead className="hidden sm:table-cell text-xs md:text-sm py-3">Phone</TableHead>
            <TableHead className="text-xs md:text-sm py-3">Status</TableHead>
            <TableHead className="text-xs md:text-sm py-3">Plan</TableHead>
            <TableHead className="hidden xl:table-cell text-xs md:text-sm py-3">Renewal</TableHead>
            <TableHead className="text-xs md:text-sm py-3">Team Access</TableHead>
            <TableHead className="w-[50px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {clientList.length === 0 ? (
            <TableRow>
              <TableCell colSpan={8}>
                <EmptyState
                  icon={Inbox}
                  title="No clients found"
                  description="Try adjusting your filters or search criteria"
                />
              </TableCell>
            </TableRow>
        ) : (
          clientList.map((client) => {
            // Find active subscription first, then fall back to pending subscription for display
            const activeSubscription = client.subscriptions?.find(sub => sub.status === "active");
            const pendingSubscription = client.subscriptions?.find(sub => sub.status === "pending");
            const displaySubscription = activeSubscription || pendingSubscription;
            const isTeamPlan = displaySubscription?.services?.type === 'team';
            const isPendingCoachApproval = client.status === 'pending_coach_approval';
            
            return (
              <TableRow key={client.id}>
                <TableCell className="font-medium text-xs md:text-sm py-4">
                  {getClientDisplayName(client)}
                  <div className="md:hidden text-muted-foreground text-xs mt-1">{client.email}</div>
                </TableCell>
                <TableCell className="hidden md:table-cell text-xs md:text-sm py-4">{client.email}</TableCell>
                <TableCell className="hidden sm:table-cell text-xs md:text-sm py-4">{client.phone || "-"}</TableCell>
                <TableCell className="py-4">
                  <Badge variant={getProfileStatusVariant(client.status)} className="text-xs">
                    {formatProfileStatus(client.status)}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs md:text-sm py-4">
                  {displaySubscription ? (
                    <div className="space-y-1">
                      <p className="font-medium">{planAbbreviations[displaySubscription.services.name] || displaySubscription.services.name}</p>
                      {isTeamPlan && activeSubscription && (
                        <p className="text-xs text-primary lg:hidden mt-1">
                          {activeSubscription.added_to_truecoach_team ? "✓ Team" : "✗ Not in Team"}
                        </p>
                      )}
                      {pendingSubscription && !activeSubscription && (
                        <p className="text-xs text-muted-foreground">(pending)</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-xs">No subscription</span>
                  )}
                </TableCell>
                <TableCell className="hidden xl:table-cell py-4">
                  {activeSubscription?.next_billing_date ? (
                    <span className="text-xs">
                      {new Date(activeSubscription.next_billing_date).toLocaleDateString()}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">N/A</span>
                  )}
                </TableCell>
                <TableCell className="py-4">
                  {activeSubscription && isTeamPlan && (
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={activeSubscription.added_to_truecoach_team || false}
                        onChange={() => handleTeamAssignmentToggle(
                          activeSubscription.id, 
                          activeSubscription.added_to_truecoach_team || false
                        )}
                        className="h-4 w-4 cursor-pointer"
                      />
                      <span className="text-xs text-muted-foreground">
                        {activeSubscription.added_to_truecoach_team ? "Added" : "Not Added"}
                      </span>
                    </div>
                  )}
                </TableCell>
                <TableCell className="py-4">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="sm">
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onViewClient && (
                        <DropdownMenuItem onClick={() => onViewClient(client.id)}>
                          <FileCheck className="mr-2 h-4 w-4" />
                          View Profile
                        </DropdownMenuItem>
                      )}

                      {/* Admin actions for pending clients */}

                      {client.status === 'pending' && (
                        <>
                          <DropdownMenuItem onClick={() => handleApproveClient(client.id, client.email, getClientDisplayName(client))}>
                            Request Review
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={() => handleRejectClient(client.id, client.email, getClientDisplayName(client))}
                            className="text-destructive focus:text-destructive"
                          >
                            <XCircle className="mr-2 h-4 w-4" />
                            Cancel Invite
                          </DropdownMenuItem>
                        </>
                      )}
                      
                      {/* Admin menu items */}
                      <DropdownMenuItem onClick={() => handleViewSubmission(client.id)}>
                        <FileCheck className="mr-2 h-4 w-4" />
                        View Form
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => handleEditClient(client)}>
                        <Edit className="mr-2 h-4 w-4" />
                        Edit Client
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => navigate(`/admin/client-diagnostics?email=${encodeURIComponent(client.email)}`)}>
                        <Stethoscope className="mr-2 h-4 w-4" />
                        Open Diagnostics
                      </DropdownMenuItem>

                      <DropdownMenuItem onClick={() => navigate(`/admin/email-log?email=${encodeURIComponent(client.email)}`)}>
                        <Mail className="mr-2 h-4 w-4" />
                        View Email History
                      </DropdownMenuItem>

                      {activeSubscription && !activeSubscription.cancel_at_period_end && client.status !== 'cancelled' && (
                        <DropdownMenuItem 
                          onClick={() => handleCancelSubscription(activeSubscription.id as string, getClientDisplayName(client), client.id, client.email)}
                          className="text-destructive focus:text-destructive"
                        >
                          <XCircle className="mr-2 h-4 w-4" />
                          Cancel Membership
                        </DropdownMenuItem>
                      )}

                      {activeSubscription?.cancel_at_period_end && (
                        <DropdownMenuItem 
                          onClick={() => handleReactivateSubscription(client.id, getClientDisplayName(client))}
                          className="text-green-600 focus:text-green-600"
                        >
                          <FileCheck className="mr-2 h-4 w-4" />
                          Reactivate Membership
                        </DropdownMenuItem>
                      )}

                      {activeSubscription && (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <DropdownMenuItem 
                              onSelect={(e) => e.preventDefault()}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete Client
                            </DropdownMenuItem>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Client Account</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to permanently delete {getClientDisplayName(client)}'s account? This will:
                                <ul className="list-disc list-inside mt-2 space-y-1">
                                  <li>Cancel all active subscriptions and billing</li>
                                  <li>Delete all client data and progress</li>
                                  <li>Remove account access completely</li>
                                </ul>
                                <strong className="block mt-2 text-destructive">This action cannot be undone.</strong>
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDeleteClient(client.id, getClientDisplayName(client))}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Yes, permanently delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            );
          })
        )}
        </TableBody>
      </Table>
    </div>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground text-center">Loading clients...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-primary" />
            <div>
              <CardTitle>Client Directory</CardTitle>
              <CardDescription>View and manage all clients</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* NOTE: Review Pending button removed - coach approvals handled in CoachMyClientsPage */}
            <ManualClientCreation onClientCreated={fetchClients} />
            <div className="hidden md:flex border rounded-lg p-1">
              <Button
                variant={viewMode === 'table' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('table')}
              >
                <LayoutList className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('cards')}
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 h-auto">
            <TabsTrigger value="pending" className="relative py-2.5 text-sm md:text-base">
              Pending
              {pendingClients.length > 0 && (
                <Badge variant="destructive" className="ml-1.5 h-5 w-5 p-0 text-xs flex items-center justify-center">
                  {pendingClients.length}
                </Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="active" className="py-2.5 text-sm md:text-base">
              Active ({activeClients.length})
            </TabsTrigger>
            <TabsTrigger value="old" className="py-2.5 text-sm md:text-base">
              Old ({oldClients.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="pending" className="mt-6 space-y-6">
            {(() => {
              const pg = paginateTab("pending", pendingClients);
              return (
                <>
                  <div className="md:hidden">
                    <ClientCardView
                      clients={pg.paginatedItems}
                      onViewDetails={(id) => handleViewSubmission(id)}
                    />
                  </div>
                  <div className="hidden md:block">
                    {viewMode === 'cards' ? (
                      <ClientCardView
                        clients={pg.paginatedItems}
                        onViewDetails={(id) => handleViewSubmission(id)}
                      />
                    ) : (
                      renderClientTable(pg.paginatedItems, true)
                    )}
                  </div>
                  {renderPaginationForTab("pending", pg.totalPages, pg.currentPage, pg.totalItems)}
                </>
              );
            })()}
          </TabsContent>
          <TabsContent value="active" className="mt-6 space-y-4">
            {(() => {
              const pg = paginateTab("active", activeClients);
              return (
                <>
                  <div className="md:hidden">
                    <ClientCardView clients={pg.paginatedItems} />
                  </div>
                  <div className="hidden md:block">
                    {viewMode === 'cards' ? (
                      <ClientCardView clients={pg.paginatedItems} />
                    ) : (
                      renderClientTable(pg.paginatedItems, false)
                    )}
                  </div>
                  {renderPaginationForTab("active", pg.totalPages, pg.currentPage, pg.totalItems)}
                </>
              );
            })()}
          </TabsContent>
          <TabsContent value="old" className="mt-6">
            {(() => {
              const pg = paginateTab("old", oldClients);
              return (
                <>
                  <div className="md:hidden">
                    <ClientCardView clients={pg.paginatedItems} />
                  </div>
                  <div className="hidden md:block">
                    {viewMode === 'cards' ? (
                      <ClientCardView clients={pg.paginatedItems} />
                    ) : (
                      renderClientTable(pg.paginatedItems, false)
                    )}
                  </div>
                  {renderPaginationForTab("old", pg.totalPages, pg.currentPage, pg.totalItems)}
                </>
              );
            })()}
          </TabsContent>
        </Tabs>
      </CardContent>

      {/* NOTE: ReviewPendingClientsDialog removed - coach approvals are handled exclusively in CoachMyClientsPage */}

      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Client Account</DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmitEdit)} className="space-y-4">
                <PersonalDetailsFields 
                  control={form.control}
                  firstNameField="first_name"
                  lastNameField="last_name"
                  emailField="email"
                  phoneField="phone"
                  dateOfBirthField="date_of_birth"
                  genderField="gender"
                  showGender={false}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      setIsEditDialogOpen(false);
                      setEditingClient(null);
                    }}
                  >
                    Cancel
                  </Button>
                  <Button type="submit">Update Client</Button>
                </div>
              </form>
            </Form>

            {/* Coach Reassignment Section - Only show for 1:1 services */}
            {editingClient && (() => {
              const activeSubscription = editingClient.subscriptions?.find(sub => 
                sub.status === 'active' || sub.status === 'pending'
              );
              if (!activeSubscription || activeSubscription.services?.type !== 'one_to_one') {
                return null;
              }
              return (
                <CoachReassignmentSection
                  clientId={editingClient.id}
                  subscriptionId={activeSubscription.id}
                  serviceId={activeSubscription.service_id}
                  currentCoachId={activeSubscription.coach_id}
                  onReassigned={() => {
                    fetchClients();
                    setIsEditDialogOpen(false);
                    setEditingClient(null);
                  }}
                />
              );
            })()}
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
