import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle,
  DialogFooter 
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  UserCheck, 
  UserX, 
  Mail, 
  Phone, 
  Calendar, 
  Award, 
  Target,
  FileText,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";
import { format } from "date-fns";

interface CoachApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  date_of_birth: string;
  certifications: string[];
  specializations: string[];
  years_of_experience: number;
  motivation: string;
  status: string;
  notes: string | null;
  created_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export function CoachApplicationsManager() {
  const { toast } = useToast();
  const [applications, setApplications] = useState<CoachApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<CoachApplication | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('coach_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error: any) {
      console.error('Error loading applications:', error);
      toast({ 
        title: "Error", 
        description: "Failed to load applications", 
        variant: "destructive" 
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (app: CoachApplication, action: 'approve' | 'reject') => {
    setSelectedApp(app);
    setActionType(action);
    setAdminNotes(app.notes || "");
    setDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedApp) return;

    try {
      setProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Send approval email
      await supabase.functions.invoke('send-coach-application-emails', {
        body: {
          applicantEmail: selectedApp.email,
          applicantName: `${selectedApp.first_name} ${selectedApp.last_name}`,
          type: 'approved',
          notes: adminNotes
        }
      });

      // Update application status
      const { error: updateError } = await supabase
        .from('coach_applications')
        .update({
          status: 'approved',
          notes: adminNotes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id
        })
        .eq('id', selectedApp.id);

      if (updateError) throw updateError;

      // Call edge function to create coach account
      const { error: createError } = await supabase.functions.invoke('create-coach-account', {
        body: {
          applicationId: selectedApp.id,
          firstName: selectedApp.first_name,
          lastName: selectedApp.last_name,
          email: selectedApp.email,
          dateOfBirth: selectedApp.date_of_birth,
          certifications: selectedApp.certifications,
          specializations: selectedApp.specializations,
          phoneNumber: selectedApp.phone_number
        }
      });

      if (createError) throw createError;

      toast({ 
        title: "Success", 
        description: "Application approved and coach account created. Invitation email sent." 
      });

      setDialogOpen(false);
      setSelectedApp(null);
      setAdminNotes("");
      loadApplications();
    } catch (error: any) {
      console.error('Error approving application:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to approve application", 
        variant: "destructive" 
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApp) return;

    try {
      setProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Send rejection email
      await supabase.functions.invoke('send-coach-application-emails', {
        body: {
          applicantEmail: selectedApp.email,
          applicantName: `${selectedApp.first_name} ${selectedApp.last_name}`,
          type: 'rejected',
          notes: adminNotes
        }
      });

      const { error } = await supabase
        .from('coach_applications')
        .update({
          status: 'rejected',
          notes: adminNotes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id
        })
        .eq('id', selectedApp.id);

      if (error) throw error;

      toast({ 
        title: "Success", 
        description: "Application rejected" 
      });

      setDialogOpen(false);
      setSelectedApp(null);
      setAdminNotes("");
      loadApplications();
    } catch (error: any) {
      console.error('Error rejecting application:', error);
      toast({ 
        title: "Error", 
        description: error.message || "Failed to reject application", 
        variant: "destructive" 
      });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    }
  };

  const pendingApps = applications.filter(a => a.status === 'pending');
  const approvedApps = applications.filter(a => a.status === 'approved');
  const rejectedApps = applications.filter(a => a.status === 'rejected');

  const renderApplicationCard = (app: CoachApplication) => (
    <Card key={app.id} className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-xl">
              {app.first_name} {app.last_name}
            </CardTitle>
            <CardDescription className="mt-1">
              Applied {format(new Date(app.created_at), 'MMM dd, yyyy')}
            </CardDescription>
          </div>
          {getStatusBadge(app.status)}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-muted-foreground" />
            <span className="truncate">{app.email}</span>
          </div>
          {app.phone_number && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span>{app.phone_number}</span>
            </div>
          )}
          <div className="flex items-center gap-2">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span>Age: {new Date().getFullYear() - new Date(app.date_of_birth).getFullYear()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Award className="h-4 w-4 text-muted-foreground" />
            <span>{app.years_of_experience} years experience</span>
          </div>
        </div>

        {app.specializations && app.specializations.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Target className="h-3 w-3" />
              Specializations
            </p>
            <div className="flex flex-wrap gap-2">
              {app.specializations.map((spec, idx) => (
                <Badge key={idx} variant="outline" className="text-xs">
                  {spec}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {app.certifications && app.certifications.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Award className="h-3 w-3" />
              Certifications
            </p>
            <div className="flex flex-wrap gap-2">
              {app.certifications.map((cert, idx) => (
                <Badge key={idx} variant="secondary" className="text-xs">
                  {cert}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {app.motivation && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <FileText className="h-3 w-3" />
              Motivation
            </p>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {app.motivation}
            </p>
          </div>
        )}

        {app.notes && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold mb-2">Admin Notes</p>
            <p className="text-sm text-muted-foreground">
              {app.notes}
            </p>
          </div>
        )}

        {app.status === 'pending' && (
          <div className="flex gap-2 pt-2">
            <Button 
              onClick={() => handleOpenDialog(app, 'approve')} 
              className="flex-1"
              variant="default"
            >
              <UserCheck className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button 
              onClick={() => handleOpenDialog(app, 'reject')} 
              className="flex-1"
              variant="destructive"
            >
              <UserX className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-center text-muted-foreground">Loading applications...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Coach Applications</CardTitle>
          <CardDescription>Review and process coach applications</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="pending">
            Pending ({pendingApps.length})
          </TabsTrigger>
          <TabsTrigger value="approved">
            Approved ({approvedApps.length})
          </TabsTrigger>
          <TabsTrigger value="rejected">
            Rejected ({rejectedApps.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {pendingApps.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No pending applications</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {pendingApps.map(renderApplicationCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {approvedApps.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No approved applications</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {approvedApps.map(renderApplicationCard)}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="space-y-4">
          {rejectedApps.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No rejected applications</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {rejectedApps.map(renderApplicationCard)}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === 'approve' ? 'Approve Application' : 'Reject Application'}
            </DialogTitle>
            <DialogDescription>
              {actionType === 'approve' 
                ? `Approving ${selectedApp?.first_name} ${selectedApp?.last_name} will create a coach account and send them an invitation email.`
                : `Rejecting ${selectedApp?.first_name} ${selectedApp?.last_name} will mark this application as rejected.`
              }
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Admin Notes (Optional)</Label>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="Add any notes about this decision..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => setDialogOpen(false)}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button 
              variant={actionType === 'approve' ? 'default' : 'destructive'}
              onClick={actionType === 'approve' ? handleApprove : handleReject}
              disabled={processing}
            >
              {processing ? 'Processing...' : (actionType === 'approve' ? 'Approve & Create Account' : 'Reject Application')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
