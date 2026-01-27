import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Plus, MoreVertical, Edit, Trash2, Settings, Users, BarChart3, FileText, Sliders } from "lucide-react";
import { CoachCapacityManager } from "@/components/admin/CoachCapacityManager";
import { CoachLoadOverview } from "@/components/admin/CoachLoadOverview";
import { CoachApplicationsManager } from "@/components/CoachApplicationsManager";
import { PricingPayoutsCallout } from "@/components/admin/PricingPayoutsCallout";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { calculateAge, formatDateForInput } from "@/lib/dateUtils";
import { CoachServiceLimits } from "./CoachServiceLimits";

interface Coach {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  location: string | null;
  email: string; // From coaches_private via coaches_full view
  date_of_birth?: string | null; // From coaches_private via coaches_full view
  status: string;
  created_at: string;
  client_count?: number;
}

interface Client {
  id: string;
  user_id: string;
  first_name: string;
  last_name: string;
  email: string;
  plan_name: string | null;
  status: string;
  created_at: string;
}

interface CoachManagementProps {
  defaultTab?: string;
}

export default function CoachManagement({ defaultTab }: CoachManagementProps) {
  const { toast } = useToast();
  const [searchParams] = useSearchParams();
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCoach, setEditingCoach] = useState<Coach | null>(null);
  const [clientsDialogOpen, setClientsDialogOpen] = useState(false);
  const [selectedCoach, setSelectedCoach] = useState<Coach | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [limitsDialogOpen, setLimitsDialogOpen] = useState(false);
  const [limitsCoach, setLimitsCoach] = useState<Coach | null>(null);
  
  // Determine initial tab from URL param or prop
  const tabFromUrl = searchParams.get('tab');
  const initialTab = tabFromUrl || defaultTab || 'load-capacity';
  const [activeTab, setActiveTab] = useState(initialTab);
  
  const [formData, setFormData] = useState({
    email: "",
    first_name: "",
    last_name: "",
    date_of_birth: "",
    location: "",
    nickname: "",
    instagram_url: "",
    tiktok_url: "",
    snapchat_url: "",
    youtube_url: "",
  });

  useEffect(() => {
    fetchCoaches();
  }, []);

  // Update active tab when URL param changes
  useEffect(() => {
    if (tabFromUrl) {
      setActiveTab(tabFromUrl);
    }
  }, [tabFromUrl]);

  const fetchCoaches = async () => {
    try {
      // Fetch coaches using coaches_full VIEW (admin has access to joined public+private data)
      const { data: coachesData, error } = await supabase
        .from("coaches_full")
        .select("id, user_id, first_name, last_name, location, status, created_at, email, date_of_birth, whatsapp_number")
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Get client counts separately
      const coachUserIds = (coachesData || []).map(c => c.user_id);
      const { data: subsData } = await supabase
        .from("subscriptions")
        .select("coach_id")
        .in("coach_id", coachUserIds)
        .eq("status", "active");
      
      // Count clients per coach
      const clientCounts = new Map<string, number>();
      (subsData || []).forEach(sub => {
        const count = clientCounts.get(sub.coach_id) || 0;
        clientCounts.set(sub.coach_id, count + 1);
      });
      
      const coachesWithCounts = (coachesData || []).map(coach => ({
        ...coach,
        email: coach.email || "",
        client_count: clientCounts.get(coach.user_id) || 0,
      }));
      
      setCoaches(coachesWithCounts);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const activeCoaches = coaches.filter(coach => coach.status === 'approved' || coach.status === 'active');
  const pendingCoaches = coaches.filter(coach => coach.status === 'pending');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (editingCoach) {
        const { error } = await supabase
          .from("coaches")
          .update({
            first_name: formData.first_name,
            last_name: formData.last_name,
            date_of_birth: formData.date_of_birth || null,
            location: formData.location,
            nickname: formData.nickname,
            instagram_url: formData.instagram_url,
            tiktok_url: formData.tiktok_url,
            snapchat_url: formData.snapchat_url,
            youtube_url: formData.youtube_url,
          })
          .eq("id", editingCoach.id);

        if (error) throw error;

        toast({
          title: "Success",
          description: "Coach updated successfully",
        });
      } else {
        const { data, error: functionError } = await supabase.functions.invoke('create-coach-account', {
          body: {
            email: formData.email,
            first_name: formData.first_name,
            last_name: formData.last_name,
            date_of_birth: formData.date_of_birth,
            location: formData.location,
            nickname: formData.nickname,
            instagram_url: formData.instagram_url,
            tiktok_url: formData.tiktok_url,
            snapchat_url: formData.snapchat_url,
            youtube_url: formData.youtube_url,
          },
        });

        if (functionError) throw functionError;
        if (!data?.success) throw new Error(data?.error || 'Failed to create coach');

        toast({
          title: "Success",
          description: data.message || "Coach added successfully. They will receive an email to set their password.",
        });
      }

      setDialogOpen(false);
      setFormData({ 
        email: "", 
        first_name: "", 
        last_name: "", 
        date_of_birth: "", 
        location: "",
        nickname: "",
        instagram_url: "",
        tiktok_url: "",
        snapchat_url: "",
        youtube_url: "",
      });
      setEditingCoach(null);
      fetchCoaches();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (coach: any) => {
    setEditingCoach(coach);
    setFormData({
      email: coach.email,
      first_name: coach.first_name,
      last_name: coach.last_name,
      date_of_birth: formatDateForInput(coach.date_of_birth),
      location: coach.location || "",
      nickname: coach.nickname || "",
      instagram_url: coach.instagram_url || "",
      tiktok_url: coach.tiktok_url || "",
      snapchat_url: coach.snapchat_url || "",
      youtube_url: coach.youtube_url || "",
    });
    setDialogOpen(true);
  };

  const handleDelete = async (coach: Coach) => {
    try {
      const { error } = await supabase.functions.invoke('delete-account', {
        body: { userId: coach.user_id }
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Coach deleted successfully. They can be re-added anytime.",
      });
      fetchCoaches();
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const viewCoachClients = async (coach: Coach) => {
    setSelectedCoach(coach);
    setClientsDialogOpen(true);
    
    try {
      const { data: subscriptions, error: subsError } = await supabase
        .from("subscriptions")
        .select(`
          id,
          user_id,
          status,
          created_at,
          services(name)
        `)
        .eq("coach_id", coach.user_id)
        .eq("status", "active");

      if (subsError) throw subsError;

      if (!subscriptions || subscriptions.length === 0) {
        setClients([]);
        return;
      }

      const userIds = subscriptions.map(sub => sub.user_id);

      const { data: forms, error: formsError } = await supabase
        .from("form_submissions")
        .select("user_id, first_name, last_name, email")
        .in("user_id", userIds);

      if (formsError) throw formsError;

      const formMap = new Map(
        (forms || []).map(form => [form.user_id, form])
      );

      const clientsData = subscriptions.map((sub: any) => {
        const form = formMap.get(sub.user_id);
        return {
          id: sub.id,
          user_id: sub.user_id,
          first_name: form?.first_name || "N/A",
          last_name: form?.last_name || "N/A",
          email: form?.email || "N/A",
          plan_name: sub.services?.name || "N/A",
          status: sub.status,
          created_at: sub.created_at,
        };
      });

      setClients(clientsData);
    } catch (error: any) {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
      setClients([]);
    }
  };

  const handleCancelClient = async (userId: string, subscriptionId: string) => {
    if (!confirm("Are you sure you want to cancel this client's subscription?")) return;

    try {
      const { error } = await supabase.functions.invoke('cancel-subscription', {
        body: { 
          userId,
          cancelledBy: 'admin',
          reason: 'Cancelled by coach'
        },
      });

      if (error) throw error;

      toast({
        title: "Success",
        description: "Client subscription cancelled. They will retain access until the current billing period ends.",
      });
      
      if (selectedCoach) {
        viewCoachClients(selectedCoach);
      }
      fetchCoaches();
    } catch (error: any) {
      console.error('Error cancelling subscription:', error);
      toast({
        title: "Error",
        description: error.message || "Failed to cancel subscription",
        variant: "destructive",
      });
    }
  };

  const resetForm = () => {
    setFormData({ 
      email: "", 
      first_name: "", 
      last_name: "", 
      date_of_birth: "", 
      location: "",
      nickname: "",
      instagram_url: "",
      tiktok_url: "",
      snapchat_url: "",
      youtube_url: "",
    });
    setEditingCoach(null);
  };

  const renderCoachTable = (coachList: Coach[]) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Email</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Age</TableHead>
          <TableHead>Location</TableHead>
          <TableHead>Total Clients</TableHead>
          <TableHead className="w-[50px]"></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {coachList.length === 0 ? (
          <TableRow>
            <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              No coaches found
            </TableCell>
          </TableRow>
        ) : (
          coachList.map((coach) => (
            <TableRow key={coach.id}>
              <TableCell className="font-medium">
                {coach.first_name} {coach.last_name}
              </TableCell>
              <TableCell>{coach.email}</TableCell>
              <TableCell>
                <Badge variant={coach.status === 'approved' || coach.status === 'active' ? 'default' : 'secondary'}>
                  {coach.status.charAt(0).toUpperCase() + coach.status.slice(1)}
                </Badge>
              </TableCell>
              <TableCell>
                {coach.date_of_birth ? calculateAge(coach.date_of_birth) : "-"}
              </TableCell>
              <TableCell>{coach.location || "-"}</TableCell>
              <TableCell>
                <Button
                  variant="link"
                  className="p-0 h-auto"
                  onClick={() => viewCoachClients(coach)}
                >
                  {coach.client_count || 0}
                </Button>
              </TableCell>
              <TableCell>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="sm">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => {
                      setLimitsCoach(coach);
                      setLimitsDialogOpen(true);
                    }}>
                      <Settings className="mr-2 h-4 w-4" />
                      Client Limits
                    </DropdownMenuItem>

                    <DropdownMenuItem onClick={() => handleEdit(coach)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit Coach Information
                    </DropdownMenuItem>

                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          onSelect={(e) => e.preventDefault()}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete Coach
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete Coach</AlertDialogTitle>
                          <AlertDialogDescription>
                            Are you sure you want to delete {coach.first_name} {coach.last_name}? 
                            This will remove them completely and they can be re-added later.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() => handleDelete(coach)}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                          >
                            Delete
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </DropdownMenuContent>
                </DropdownMenu>
              </TableCell>
            </TableRow>
          ))
        )}
      </TableBody>
    </Table>
  );

  // Service limits content (standalone view for tab)
  const ServiceLimitsTab = () => {
    const [allLimits, setAllLimits] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [loadingLimits, setLoadingLimits] = useState(true);

    useEffect(() => {
      loadServiceLimitsData();
    }, []);

    const loadServiceLimitsData = async () => {
      try {
        setLoadingLimits(true);
        
        const { data: servicesData } = await supabase
          .from("services")
          .select("id, name, type")
          .eq("is_active", true)
          .order("name");
        
        setServices(servicesData || []);

        const { data: limitsData } = await supabase
          .from("coach_service_limits")
          .select("*, services(name, type)");
        
        setAllLimits(limitsData || []);
      } catch (error) {
        console.error('Error loading service limits:', error);
      } finally {
        setLoadingLimits(false);
      }
    };

    if (loadingLimits) {
      return <div className="py-8 text-center text-muted-foreground">Loading service limits...</div>;
    }

    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Coach Service Limits</CardTitle>
            <CardDescription>
              View and manage maximum client limits per service for each coach. 
              Click on a coach's "Client Limits" action to modify their limits.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Coach</TableHead>
                  {services.map(service => (
                    <TableHead key={service.id} className="text-center">{service.name}</TableHead>
                  ))}
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activeCoaches.map((coach) => {
                  const coachLimits = allLimits.filter(l => l.coach_id === coach.id);
                  return (
                    <TableRow key={coach.id}>
                      <TableCell className="font-medium">
                        {coach.first_name} {coach.last_name}
                      </TableCell>
                      {services.map(service => {
                        const limit = coachLimits.find(l => l.service_id === service.id);
                        return (
                          <TableCell key={service.id} className="text-center">
                            {limit ? limit.max_clients : <span className="text-muted-foreground">∞</span>}
                          </TableCell>
                        );
                      })}
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setLimitsCoach(coach);
                            setLimitsDialogOpen(true);
                          }}
                        >
                          <Settings className="h-4 w-4 mr-1" />
                          Edit
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="load-capacity" className="gap-2">
            <BarChart3 className="h-4 w-4 hidden sm:block" />
            Load & Capacity
          </TabsTrigger>
          <TabsTrigger value="service-limits" className="gap-2">
            <Sliders className="h-4 w-4 hidden sm:block" />
            Service Limits
          </TabsTrigger>
          <TabsTrigger value="applications" className="gap-2">
            <FileText className="h-4 w-4 hidden sm:block" />
            Applications
          </TabsTrigger>
        </TabsList>

        {/* Load & Capacity Tab */}
        <TabsContent value="load-capacity" className="space-y-6">
          <CoachLoadOverview />
          <CoachCapacityManager />
          
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Coach Management</CardTitle>
                  <CardDescription>Add and manage coaches</CardDescription>
                </div>
                <Dialog open={dialogOpen} onOpenChange={(open) => {
                  setDialogOpen(open);
                  if (!open) resetForm();
                }}>
                  <DialogTrigger asChild>
                    <Button variant="gradient">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Coach
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] max-w-2xl">
                    <DialogHeader>
                      <DialogTitle>{editingCoach ? "Edit Coach" : "Add New Coach"}</DialogTitle>
                    </DialogHeader>
                    <ScrollArea className="max-h-[calc(90vh-8rem)] pr-4">
                      <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2 md:col-span-2">
                            <Label htmlFor="email">Email</Label>
                            <Input
                              id="email"
                              type="email"
                              value={formData.email}
                              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                              disabled={!!editingCoach}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="first_name">First Name</Label>
                            <Input
                              id="first_name"
                              value={formData.first_name}
                              onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="last_name">Last Name</Label>
                            <Input
                              id="last_name"
                              value={formData.last_name}
                              onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
                              required
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="date_of_birth">Date of Birth</Label>
                            <Input
                              id="date_of_birth"
                              type="date"
                              value={formData.date_of_birth}
                              onChange={(e) => setFormData({ ...formData, date_of_birth: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="location">Location</Label>
                            <Input
                              id="location"
                              value={formData.location}
                              onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="nickname">Nickname</Label>
                            <Input
                              id="nickname"
                              value={formData.nickname}
                              onChange={(e) => setFormData({ ...formData, nickname: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="instagram_url">Instagram URL</Label>
                            <Input
                              id="instagram_url"
                              value={formData.instagram_url}
                              onChange={(e) => setFormData({ ...formData, instagram_url: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="tiktok_url">TikTok URL</Label>
                            <Input
                              id="tiktok_url"
                              value={formData.tiktok_url}
                              onChange={(e) => setFormData({ ...formData, tiktok_url: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="snapchat_url">Snapchat URL</Label>
                            <Input
                              id="snapchat_url"
                              value={formData.snapchat_url}
                              onChange={(e) => setFormData({ ...formData, snapchat_url: e.target.value })}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="youtube_url">YouTube URL</Label>
                            <Input
                              id="youtube_url"
                              value={formData.youtube_url}
                              onChange={(e) => setFormData({ ...formData, youtube_url: e.target.value })}
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-4">
                          <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                            Cancel
                          </Button>
                          <Button type="submit" disabled={loading}>
                            {loading ? "Saving..." : (editingCoach ? "Update Coach" : "Add Coach")}
                          </Button>
                        </div>
                      </form>
                    </ScrollArea>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="active">
                <TabsList className="mb-4">
                  <TabsTrigger value="active">Active Coaches ({activeCoaches.length})</TabsTrigger>
                  <TabsTrigger value="pending">Pending ({pendingCoaches.length})</TabsTrigger>
                </TabsList>
                <TabsContent value="active">
                  {renderCoachTable(activeCoaches)}
                </TabsContent>
                <TabsContent value="pending">
                  {renderCoachTable(pendingCoaches)}
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Service Limits Tab */}
        <TabsContent value="service-limits">
          <ServiceLimitsTab />
        </TabsContent>

        {/* Pricing & Payouts Callout (replaces old Payments tab) */}
        <PricingPayoutsCallout 
          title="Coach Payments"
          description="Coach payout rates and payment calculations are now managed centrally."
        />

        {/* Applications Tab */}
        <TabsContent value="applications">
          <CoachApplicationsManager />
        </TabsContent>
      </Tabs>

      {/* Client Limits Dialog */}
      {limitsCoach && (
        <CoachServiceLimits
          coachId={limitsCoach.id}
          coachName={`${limitsCoach.first_name} ${limitsCoach.last_name}`}
          open={limitsDialogOpen}
          onOpenChange={setLimitsDialogOpen}
        />
      )}

      {/* View Coach Clients Dialog */}
      <Dialog open={clientsDialogOpen} onOpenChange={setClientsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>
              Clients of {selectedCoach?.first_name} {selectedCoach?.last_name}
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[60vh]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clients.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                      No active clients found
                    </TableCell>
                  </TableRow>
                ) : (
                  clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell className="font-medium">
                        {client.first_name} {client.last_name}
                      </TableCell>
                      <TableCell>{client.email}</TableCell>
                      <TableCell>{client.plan_name}</TableCell>
                      <TableCell>
                        <Badge variant={client.status === 'active' ? 'default' : 'secondary'}>
                          {client.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleCancelClient(client.user_id, client.id)}
                        >
                          Cancel
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}