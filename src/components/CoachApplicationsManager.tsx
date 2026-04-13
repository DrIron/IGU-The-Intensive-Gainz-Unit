import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
  Clock,
  Video,
  Briefcase,
  Users,
  AlertTriangle,
  BookOpen,
  Beaker
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { sanitizeErrorForUser } from '@/lib/errorSanitizer';

interface CredentialEntry {
  name: string;
  issuer: string;
  year: string;
  expiryYear?: string;
}

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
  requested_subroles: string[] | null;
  // Phase 4 fields
  occupation: string | null;
  coaching_modality: string | null;
  current_client_count: number | null;
  max_capacity: number | null;
  credentials_json: CredentialEntry[] | null;
  coaching_philosophy: string | null;
  evidence_based_approach: string | null;
  // Interview fields
  interview_scheduled_at: string | null;
  interview_zoom_link: string | null;
  interview_completed_at: string | null;
  interview_notes: string | null;
}

type ActionType = 'approve' | 'reject' | 'schedule_interview' | 'complete_interview' | 'reschedule';

const MODALITY_LABELS: Record<string, string> = {
  online: "Online",
  in_person: "In-Person",
  hybrid: "Hybrid",
};

export function CoachApplicationsManager() {
  const { toast } = useToast();
  const [applications, setApplications] = useState<CoachApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedApp, setSelectedApp] = useState<CoachApplication | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [adminNotes, setAdminNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  // Interview scheduling fields
  const [interviewDate, setInterviewDate] = useState("");
  const [interviewTime, setInterviewTime] = useState("");
  const [interviewZoomLink, setInterviewZoomLink] = useState("");
  const [interviewNotes, setInterviewNotes] = useState("");

  const loadApplications = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('coach_applications')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error: unknown) {
      console.error('Error loading applications:', error);
      toast({
        title: "Error",
        description: "Failed to load applications",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    loadApplications();
  }, [loadApplications]);

  const handleOpenDialog = (app: CoachApplication, action: ActionType) => {
    setSelectedApp(app);
    setActionType(action);
    setAdminNotes(app.notes || "");
    // Pre-fill interview fields if rescheduling
    if (action === 'reschedule' && app.interview_scheduled_at) {
      const dt = new Date(app.interview_scheduled_at);
      setInterviewDate(format(dt, 'yyyy-MM-dd'));
      setInterviewTime(format(dt, 'HH:mm'));
      setInterviewZoomLink(app.interview_zoom_link || "");
    } else {
      setInterviewDate("");
      setInterviewTime("");
      setInterviewZoomLink("");
    }
    setInterviewNotes(app.interview_notes || "");
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setSelectedApp(null);
    setAdminNotes("");
    setInterviewDate("");
    setInterviewTime("");
    setInterviewZoomLink("");
    setInterviewNotes("");
  };

  const handleScheduleInterview = async () => {
    if (!selectedApp || !interviewDate || !interviewTime) return;

    try {
      setProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const scheduledAt = new Date(`${interviewDate}T${interviewTime}:00`).toISOString();

      const { error } = await supabase
        .from('coach_applications')
        .update({
          status: 'interview_scheduled',
          interview_scheduled_at: scheduledAt,
          interview_zoom_link: interviewZoomLink || null,
          notes: adminNotes || null,
          reviewed_by: user.id,
        })
        .eq('id', selectedApp.id);

      if (error) throw error;

      // Send interview scheduled email
      await supabase.functions.invoke('send-coach-application-emails', {
        body: {
          applicantEmail: selectedApp.email,
          applicantName: `${selectedApp.first_name} ${selectedApp.last_name}`,
          type: 'interview_scheduled',
          notes: adminNotes,
          interviewDate: format(new Date(scheduledAt), 'EEEE, MMMM d, yyyy'),
          interviewTime: format(new Date(scheduledAt), 'h:mm a'),
          interviewZoomLink: interviewZoomLink || null,
        }
      });

      toast({ title: "Interview Scheduled", description: `Interview scheduled for ${format(new Date(scheduledAt), 'MMM d, yyyy h:mm a')}` });
      closeDialog();
      loadApplications();
    } catch (error: unknown) {
      console.error('Error scheduling interview:', error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setProcessing(false);
    }
  };

  const handleCompleteInterview = async () => {
    if (!selectedApp) return;

    try {
      setProcessing(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      const { error } = await supabase
        .from('coach_applications')
        .update({
          status: 'interview_completed',
          interview_completed_at: new Date().toISOString(),
          interview_notes: interviewNotes || null,
          notes: adminNotes || null,
          reviewed_by: user.id,
        })
        .eq('id', selectedApp.id);

      if (error) throw error;

      toast({ title: "Interview Marked Complete", description: "You can now approve or reject this application." });
      closeDialog();
      loadApplications();
    } catch (error: unknown) {
      console.error('Error completing interview:', error);
      toast({ title: "Error", description: sanitizeErrorForUser(error), variant: "destructive" });
    } finally {
      setProcessing(false);
    }
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
          first_name: selectedApp.first_name,
          last_name: selectedApp.last_name,
          email: selectedApp.email,
          date_of_birth: selectedApp.date_of_birth,
          certifications: selectedApp.certifications,
          specializations: selectedApp.specializations,
          phoneNumber: selectedApp.phone_number
        }
      });

      if (createError) throw createError;

      // Create pending user_subroles records for requested subroles
      if (selectedApp.requested_subroles && selectedApp.requested_subroles.length > 0) {
        try {
          const { data: subroleDefsData } = await supabase
            .from('subrole_definitions')
            .select('id, slug')
            .in('slug', selectedApp.requested_subroles);

          if (subroleDefsData && subroleDefsData.length > 0) {
            const { data: coachData } = await supabase
              .from('coaches')
              .select('user_id')
              .eq('email', selectedApp.email)
              .maybeSingle();

            if (coachData?.user_id) {
              const subroleInserts = subroleDefsData.map((sd: any) => ({
                user_id: coachData.user_id,
                subrole_id: sd.id,
                status: 'pending' as const,
                credential_notes: `Requested during coach application (${selectedApp.first_name} ${selectedApp.last_name})`,
              }));

              await supabase
                .from('user_subroles')
                .insert(subroleInserts);
            }
          }
        } catch (subroleErr) {
          if (import.meta.env.DEV) console.warn('Could not create subrole requests:', subroleErr);
        }
      }

      toast({
        title: "Success",
        description: "Application approved and coach account created. Invitation email sent."
      });

      closeDialog();
      loadApplications();
    } catch (error: unknown) {
      console.error('Error approving application:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
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

      // Determine rejection email type based on current status
      const emailType = selectedApp.status === 'interview_completed' || selectedApp.status === 'interview_scheduled'
        ? 'rejected_post_interview'
        : 'rejected_pre_interview';

      await supabase.functions.invoke('send-coach-application-emails', {
        body: {
          applicantEmail: selectedApp.email,
          applicantName: `${selectedApp.first_name} ${selectedApp.last_name}`,
          type: emailType,
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

      closeDialog();
      loadApplications();
    } catch (error: unknown) {
      console.error('Error rejecting application:', error);
      toast({
        title: "Error",
        description: sanitizeErrorForUser(error),
        variant: "destructive"
      });
    } finally {
      setProcessing(false);
    }
  };

  const handleDialogAction = () => {
    switch (actionType) {
      case 'approve': return handleApprove();
      case 'reject': return handleReject();
      case 'schedule_interview':
      case 'reschedule': return handleScheduleInterview();
      case 'complete_interview': return handleCompleteInterview();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved':
        return <Badge className="gap-1 bg-green-600 hover:bg-green-700"><CheckCircle2 className="h-3 w-3" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" />Rejected</Badge>;
      case 'interview_scheduled':
        return <Badge className="gap-1 bg-blue-600 hover:bg-blue-700"><Video className="h-3 w-3" />Interview Scheduled</Badge>;
      case 'interview_completed':
        return <Badge className="gap-1 bg-purple-600 hover:bg-purple-700"><CheckCircle2 className="h-3 w-3" />Interview Done</Badge>;
      default:
        return <Badge variant="secondary" className="gap-1"><Clock className="h-3 w-3" />Pending</Badge>;
    }
  };

  // Group applications by pipeline stage
  const pendingApps = applications.filter(a => a.status === 'pending');
  const interviewApps = applications.filter(a => a.status === 'interview_scheduled' || a.status === 'interview_completed');
  const approvedApps = applications.filter(a => a.status === 'approved');
  const rejectedApps = applications.filter(a => a.status === 'rejected');

  const renderCredentials = (credentials: CredentialEntry[]) => {
    const currentYear = new Date().getFullYear();
    return (
      <div className="space-y-1.5">
        {credentials.map((cred, idx) => {
          const isExpired = cred.expiryYear && parseInt(cred.expiryYear) < currentYear;
          const expiringSoon = cred.expiryYear && parseInt(cred.expiryYear) === currentYear;
          return (
            <div key={idx} className="flex items-center gap-2 text-sm">
              <Award className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
              <span className="truncate">{cred.name}</span>
              {cred.issuer && <span className="text-muted-foreground">({cred.issuer})</span>}
              {cred.year && <span className="text-muted-foreground text-xs">{cred.year}</span>}
              {isExpired && (
                <Badge variant="destructive" className="text-[10px] h-4 px-1 gap-0.5">
                  <AlertTriangle className="h-2.5 w-2.5" />Expired
                </Badge>
              )}
              {expiringSoon && !isExpired && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1 gap-0.5 bg-amber-500/20 text-amber-400">
                  <AlertTriangle className="h-2.5 w-2.5" />Expiring
                </Badge>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  const renderInterviewInfo = (app: CoachApplication) => {
    if (!app.interview_scheduled_at) return null;
    const scheduled = new Date(app.interview_scheduled_at);
    const isPast = scheduled < new Date();

    return (
      <div className="pt-3 border-t space-y-2">
        <p className="text-xs font-semibold flex items-center gap-1">
          <Video className="h-3 w-3" />
          Interview Details
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-muted-foreground">Date: </span>
            <span className={isPast && app.status === 'interview_scheduled' ? 'text-amber-400' : ''}>
              {format(scheduled, 'MMM d, yyyy h:mm a')}
            </span>
            {isPast && app.status === 'interview_scheduled' && (
              <span className="text-amber-400 text-xs ml-1">(overdue)</span>
            )}
          </div>
          {app.interview_zoom_link && (
            <div>
              <span className="text-muted-foreground">Link: </span>
              <a href={app.interview_zoom_link} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-xs truncate">
                {app.interview_zoom_link.length > 35 ? app.interview_zoom_link.slice(0, 35) + '...' : app.interview_zoom_link}
              </a>
            </div>
          )}
        </div>
        {app.interview_completed_at && (
          <p className="text-xs text-muted-foreground">
            Completed {formatDistanceToNow(new Date(app.interview_completed_at), { addSuffix: true })}
          </p>
        )}
        {app.interview_notes && (
          <div className="mt-1">
            <p className="text-xs text-muted-foreground">{app.interview_notes}</p>
          </div>
        )}
      </div>
    );
  };

  const renderStageActions = (app: CoachApplication) => {
    switch (app.status) {
      case 'pending':
        return (
          <div className="flex gap-2 pt-2">
            <Button onClick={() => handleOpenDialog(app, 'schedule_interview')} className="flex-1" variant="default">
              <Video className="h-4 w-4 mr-2" />
              Schedule Interview
            </Button>
            <Button onClick={() => handleOpenDialog(app, 'reject')} className="flex-1" variant="destructive">
              <UserX className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        );
      case 'interview_scheduled':
        return (
          <div className="flex gap-2 pt-2">
            <Button onClick={() => handleOpenDialog(app, 'complete_interview')} className="flex-1" variant="default">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mark Complete
            </Button>
            <Button onClick={() => handleOpenDialog(app, 'reschedule')} className="flex-1" variant="outline">
              <Calendar className="h-4 w-4 mr-2" />
              Reschedule
            </Button>
          </div>
        );
      case 'interview_completed':
        return (
          <div className="flex gap-2 pt-2">
            <Button onClick={() => handleOpenDialog(app, 'approve')} className="flex-1" variant="default">
              <UserCheck className="h-4 w-4 mr-2" />
              Approve
            </Button>
            <Button onClick={() => handleOpenDialog(app, 'reject')} className="flex-1" variant="destructive">
              <UserX className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        );
      default:
        return null;
    }
  };

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
          {app.occupation && (
            <div className="flex items-center gap-2">
              <Briefcase className="h-4 w-4 text-muted-foreground" />
              <span>{app.occupation}</span>
            </div>
          )}
          {app.coaching_modality && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{MODALITY_LABELS[app.coaching_modality] || app.coaching_modality}</span>
            </div>
          )}
          {(app.current_client_count != null || app.max_capacity != null) && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <span>{app.current_client_count ?? 0} clients (max {app.max_capacity ?? 20})</span>
            </div>
          )}
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

        {app.requested_subroles && app.requested_subroles.length > 0 && (
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Award className="h-3 w-3" />
              Requested Subroles
            </p>
            <div className="flex flex-wrap gap-2">
              {app.requested_subroles.map((slug, idx) => (
                <Badge key={idx} variant="default" className="text-xs capitalize">
                  {slug.replace(/_/g, ' ')}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Structured credentials (Phase 4) */}
        {app.credentials_json && app.credentials_json.length > 0 ? (
          <div>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Award className="h-3 w-3" />
              Credentials
            </p>
            {renderCredentials(app.credentials_json)}
          </div>
        ) : app.certifications && app.certifications.length > 0 ? (
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
        ) : null}

        {app.coaching_philosophy && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <BookOpen className="h-3 w-3" />
              Coaching Philosophy
            </p>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {app.coaching_philosophy}
            </p>
          </div>
        )}

        {app.evidence_based_approach && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold mb-2 flex items-center gap-1">
              <Beaker className="h-3 w-3" />
              Evidence-Based Approach
            </p>
            <p className="text-sm text-muted-foreground line-clamp-3">
              {app.evidence_based_approach}
            </p>
          </div>
        )}

        {app.motivation && !app.coaching_philosophy && (
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

        {renderInterviewInfo(app)}

        {app.notes && (
          <div className="pt-3 border-t">
            <p className="text-xs font-semibold mb-2">Admin Notes</p>
            <p className="text-sm text-muted-foreground">
              {app.notes}
            </p>
          </div>
        )}

        {renderStageActions(app)}
      </CardContent>
    </Card>
  );

  const getDialogTitle = () => {
    switch (actionType) {
      case 'approve': return 'Approve Application';
      case 'reject': return 'Reject Application';
      case 'schedule_interview': return 'Schedule Interview';
      case 'reschedule': return 'Reschedule Interview';
      case 'complete_interview': return 'Complete Interview';
      default: return '';
    }
  };

  const getDialogDescription = () => {
    if (!selectedApp) return '';
    const name = `${selectedApp.first_name} ${selectedApp.last_name}`;
    switch (actionType) {
      case 'approve': return `Approving ${name} will create a coach account and send them an invitation email.`;
      case 'reject': return `Rejecting ${name} will mark this application as rejected and send a notification.`;
      case 'schedule_interview': return `Schedule an interview with ${name}. They will receive an email with the date, time, and meeting link.`;
      case 'reschedule': return `Reschedule the interview with ${name}. They will receive an updated email.`;
      case 'complete_interview': return `Mark the interview with ${name} as completed. You can then approve or reject.`;
      default: return '';
    }
  };

  const getDialogActionLabel = () => {
    if (processing) return 'Processing...';
    switch (actionType) {
      case 'approve': return 'Approve & Create Account';
      case 'reject': return 'Reject Application';
      case 'schedule_interview': return 'Schedule & Send Email';
      case 'reschedule': return 'Reschedule & Send Email';
      case 'complete_interview': return 'Mark as Completed';
      default: return '';
    }
  };

  const getDialogActionVariant = (): 'default' | 'destructive' => {
    return actionType === 'reject' ? 'destructive' : 'default';
  };

  const isDialogActionDisabled = () => {
    if (processing) return true;
    if ((actionType === 'schedule_interview' || actionType === 'reschedule') && (!interviewDate || !interviewTime)) return true;
    return false;
  };

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
          <CardDescription>Review and process coach applications through the hiring pipeline</CardDescription>
        </CardHeader>
      </Card>

      <Tabs defaultValue="pending" className="space-y-4">
        <div className="overflow-x-auto -mx-4 px-4 md:mx-0 md:px-0">
        <TabsList className="inline-flex md:grid md:w-full md:grid-cols-4 w-max">
          <TabsTrigger value="pending" className="whitespace-nowrap">
            Pending ({pendingApps.length})
          </TabsTrigger>
          <TabsTrigger value="interview" className="whitespace-nowrap">
            Interview ({interviewApps.length})
          </TabsTrigger>
          <TabsTrigger value="approved" className="whitespace-nowrap">
            Approved ({approvedApps.length})
          </TabsTrigger>
          <TabsTrigger value="rejected" className="whitespace-nowrap">
            Rejected ({rejectedApps.length})
          </TabsTrigger>
        </TabsList>
        </div>

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

        <TabsContent value="interview" className="space-y-4">
          {interviewApps.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-muted-foreground">No applications in interview stage</p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {interviewApps.map(renderApplicationCard)}
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

      {/* Multi-Purpose Action Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{getDialogTitle()}</DialogTitle>
            <DialogDescription>{getDialogDescription()}</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Interview scheduling fields */}
            {(actionType === 'schedule_interview' || actionType === 'reschedule') && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input
                      type="date"
                      value={interviewDate}
                      onChange={(e) => setInterviewDate(e.target.value)}
                      min={format(new Date(), 'yyyy-MM-dd')}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Time *</Label>
                    <Input
                      type="time"
                      value={interviewTime}
                      onChange={(e) => setInterviewTime(e.target.value)}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Zoom / Meeting Link</Label>
                  <Input
                    type="url"
                    value={interviewZoomLink}
                    onChange={(e) => setInterviewZoomLink(e.target.value)}
                    placeholder="https://zoom.us/j/..."
                  />
                </div>
              </>
            )}

            {/* Interview notes for completion */}
            {actionType === 'complete_interview' && (
              <div className="space-y-2">
                <Label>Interview Notes</Label>
                <Textarea
                  value={interviewNotes}
                  onChange={(e) => setInterviewNotes(e.target.value)}
                  placeholder="Summary of interview discussion, impressions, red flags..."
                  rows={4}
                />
              </div>
            )}

            {/* Admin notes (always shown) */}
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
              onClick={closeDialog}
              disabled={processing}
            >
              Cancel
            </Button>
            <Button
              variant={getDialogActionVariant()}
              onClick={handleDialogAction}
              disabled={isDialogActionDisabled()}
            >
              {getDialogActionLabel()}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
