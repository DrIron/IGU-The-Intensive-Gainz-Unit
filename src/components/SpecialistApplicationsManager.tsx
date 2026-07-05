import { useState, useEffect, useCallback, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  UserCheck, UserX, Mail, Phone, Calendar, Award, Target, BookOpen, Beaker,
  CheckCircle2, XCircle, Clock,
} from "lucide-react";
import { format } from "date-fns";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import { SPECIALIST_APPLY_CONFIG, SPECIALIST_SLUGS, getSpecialistApplyConfig } from "@/lib/specialistApplications";

interface CredentialEntry {
  name: string;
  issuer: string;
  year: string;
  expiryYear?: string;
}

interface SpecialistApplication {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone_number: string | null;
  date_of_birth: string;
  certifications: string[] | null;
  specializations: string[] | null;
  years_of_experience: number | null;
  motivation: string | null;
  status: string;
  notes: string | null;
  created_at: string;
  occupation: string | null;
  credentials_json: CredentialEntry[] | null;
  coaching_philosophy: string | null;
  evidence_based_approach: string | null;
  subrole_slug: string;
}

type ActionType = "approve" | "reject";

export function SpecialistApplicationsManager() {
  const { toast } = useToast();
  const [applications, setApplications] = useState<SpecialistApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [subroleFilter, setSubroleFilter] = useState<string>("all");
  const [selectedApp, setSelectedApp] = useState<SpecialistApplication | null>(null);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  const loadApplications = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("coach_applications")
        .select("*")
        // Specialist tracks only; the base coach pipeline has its own manager.
        .neq("subrole_slug", "coach")
        .order("created_at", { ascending: false });
      if (error) throw error;
      // credentials_json comes back as Json; our interface narrows it to CredentialEntry[].
      setApplications((data || []) as unknown as SpecialistApplication[]);
    } catch (error: unknown) {
      console.error("Error loading specialist applications:", error);
      toast({ title: "Error", description: "Failed to load applications", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const filtered = useMemo(
    () => (subroleFilter === "all" ? applications : applications.filter((a) => a.subrole_slug === subroleFilter)),
    [applications, subroleFilter]
  );

  const pendingApps = filtered.filter((a) => a.status === "pending");
  const approvedApps = filtered.filter((a) => a.status === "approved");
  const rejectedApps = filtered.filter((a) => a.status === "rejected");

  const openDialog = (app: SpecialistApplication, action: ActionType) => {
    setSelectedApp(app);
    setActionType(action);
    setAdminNotes(app.notes || "");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedApp(null);
    setActionType(null);
    setAdminNotes("");
  };

  const handleApprove = async () => {
    if (!selectedApp) return;
    const config = getSpecialistApplyConfig(selectedApp.subrole_slug);
    try {
      setProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // S2: record the decision + notify the applicant. Account provisioning
      // (create-specialist-account + subrole grant) is wired in S3 — this handler
      // is extended there; the status transition + email stay.
      const { error: updateError } = await supabase
        .from("coach_applications")
        .update({
          status: "approved",
          notes: adminNotes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", selectedApp.id);
      if (updateError) throw updateError;

      await supabase.functions.invoke("send-coach-application-emails", {
        body: {
          applicantEmail: selectedApp.email,
          applicantName: `${selectedApp.first_name} ${selectedApp.last_name}`,
          type: "approved",
          roleLabel: config.roleLabel,
          roleTeam: config.roleTeam,
          notes: adminNotes,
        },
      });

      toast({ title: "Approved", description: `${config.roleLabel} application approved and applicant notified.` });
      closeDialog();
      loadApplications();
    } catch (error: unknown) {
      console.error("Error approving application:", error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleReject = async () => {
    if (!selectedApp) return;
    const config = getSpecialistApplyConfig(selectedApp.subrole_slug);
    try {
      setProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      await supabase.functions.invoke("send-coach-application-emails", {
        body: {
          applicantEmail: selectedApp.email,
          applicantName: `${selectedApp.first_name} ${selectedApp.last_name}`,
          type: "rejected_pre_interview",
          roleLabel: config.roleLabel,
          roleTeam: config.roleTeam,
          notes: adminNotes,
        },
      });

      const { error } = await supabase
        .from("coach_applications")
        .update({
          status: "rejected",
          notes: adminNotes || null,
          reviewed_at: new Date().toISOString(),
          reviewed_by: user.id,
        })
        .eq("id", selectedApp.id);
      if (error) throw error;

      toast({ title: "Rejected", description: "Application rejected and applicant notified." });
      closeDialog();
      loadApplications();
    } catch (error: unknown) {
      console.error("Error rejecting application:", error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "approved":
        return <Badge className="gap-1 bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
      case "rejected":
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    }
  };

  const renderCard = (app: SpecialistApplication) => {
    const config = getSpecialistApplyConfig(app.subrole_slug);
    return (
      <Card key={app.id} className="hover:shadow-lg transition-shadow">
        <CardHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <CardTitle className="text-xl">{app.first_name} {app.last_name}</CardTitle>
              <CardDescription className="mt-1">Applied {format(new Date(app.created_at), "MMM dd, yyyy")}</CardDescription>
            </div>
            <div className="flex flex-col items-end gap-1">
              {getStatusBadge(app.status)}
              <Badge variant="outline" className="text-xs">{config.roleLabel}</Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
            <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><span className="truncate">{app.email}</span></div>
            {app.phone_number && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" /><span>{app.phone_number}</span></div>}
            <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground" /><span>Age: {new Date().getFullYear() - new Date(app.date_of_birth).getFullYear()}</span></div>
            <div className="flex items-center gap-2"><Award className="h-4 w-4 text-muted-foreground" /><span>{app.years_of_experience ?? 0} years experience</span></div>
          </div>

          {app.specializations && app.specializations.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Target className="h-3 w-3" />Specializations</p>
              <div className="flex flex-wrap gap-2">
                {app.specializations.map((spec, idx) => <Badge key={idx} variant="outline" className="text-xs">{spec}</Badge>)}
              </div>
            </div>
          )}

          {app.credentials_json && app.credentials_json.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Award className="h-3 w-3" />Credentials</p>
              <div className="space-y-1">
                {app.credentials_json.map((c, i) => (
                  <p key={i} className="text-sm text-muted-foreground">{c.name} {c.issuer && `-- ${c.issuer}`} {c.year && `(${c.year})`}</p>
                ))}
              </div>
            </div>
          )}

          {app.coaching_philosophy && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><BookOpen className="h-3 w-3" />{config.philosophyLabel}</p>
              <p className="text-sm text-muted-foreground line-clamp-3">{app.coaching_philosophy}</p>
            </div>
          )}

          {app.evidence_based_approach && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold mb-2 flex items-center gap-1"><Beaker className="h-3 w-3" />{config.approachLabel}</p>
              <p className="text-sm text-muted-foreground line-clamp-3">{app.evidence_based_approach}</p>
            </div>
          )}

          {app.notes && (
            <div className="pt-3 border-t">
              <p className="text-xs font-semibold mb-2">Admin Notes</p>
              <p className="text-sm text-muted-foreground">{app.notes}</p>
            </div>
          )}

          {app.status === "pending" && (
            <div className="flex gap-2 pt-2">
              <Button onClick={() => openDialog(app, "approve")} className="flex-1" variant="default">
                <UserCheck className="h-4 w-4 mr-2" />Approve
              </Button>
              <Button onClick={() => openDialog(app, "reject")} className="flex-1" variant="destructive">
                <UserX className="h-4 w-4 mr-2" />Reject
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderList = (apps: SpecialistApplication[], emptyLabel: string) =>
    apps.length === 0 ? (
      <Card><CardContent className="pt-6"><p className="text-center text-muted-foreground">{emptyLabel}</p></CardContent></Card>
    ) : (
      <div className="grid gap-4 md:grid-cols-2">{apps.map(renderCard)}</div>
    );

  if (loading) {
    return <Card><CardContent className="pt-6"><p className="text-center text-muted-foreground">Loading applications...</p></CardContent></Card>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Specialist Applications</CardTitle>
              <CardDescription>Review and process dietitian and other specialist applications.</CardDescription>
            </div>
            <Select value={subroleFilter} onValueChange={setSubroleFilter}>
              <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All specialists</SelectItem>
                {SPECIALIST_SLUGS.map((slug) => (
                  <SelectItem key={slug} value={slug}>{SPECIALIST_APPLY_CONFIG[slug].roleLabel}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
          <TabsList className="inline-flex md:grid md:w-full md:grid-cols-3 w-max">
            <TabsTrigger value="pending" className="whitespace-nowrap">Pending ({pendingApps.length})</TabsTrigger>
            <TabsTrigger value="approved" className="whitespace-nowrap">Approved ({approvedApps.length})</TabsTrigger>
            <TabsTrigger value="rejected" className="whitespace-nowrap">Rejected ({rejectedApps.length})</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="pending" className="space-y-4">{renderList(pendingApps, "No pending applications")}</TabsContent>
        <TabsContent value="approved" className="space-y-4">{renderList(approvedApps, "No approved applications")}</TabsContent>
        <TabsContent value="rejected" className="space-y-4">{renderList(rejectedApps, "No rejected applications")}</TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{actionType === "approve" ? "Approve Application" : "Reject Application"}</DialogTitle>
            <DialogDescription>
              {selectedApp && actionType === "approve" &&
                `Approving ${selectedApp.first_name} ${selectedApp.last_name} marks the application approved and notifies them. Account provisioning is completed in the role-grant step.`}
              {selectedApp && actionType === "reject" &&
                `Rejecting ${selectedApp.first_name} ${selectedApp.last_name} marks the application rejected and sends a notification.`}
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
            <Button variant="outline" onClick={closeDialog} disabled={processing}>Cancel</Button>
            <Button
              variant={actionType === "reject" ? "destructive" : "default"}
              onClick={actionType === "approve" ? handleApprove : handleReject}
              disabled={processing}
            >
              {processing ? "Processing..." : actionType === "approve" ? "Approve & Notify" : "Reject Application"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
