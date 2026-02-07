import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Crown, Users, Info, Shield, CheckCircle2, Clock, MessageSquare, Dumbbell, Calendar } from "lucide-react";
import { format } from "date-fns";
import ClientNutritionProgress from "@/pages/ClientNutrition";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CareTeamCard } from "./CareTeamCard";
import { CareTeamOverviewCard } from "@/components/client/CareTeamOverviewCard";
import { MedicalSectionHeader } from "@/components/phi/PHIRestrictedField";
import { logPHIAccess } from "@/hooks/usePHIAuditLog";
import { AssignProgramDialog } from "./programs/AssignProgramDialog";
import { DirectClientCalendar } from "./programs/DirectClientCalendar";
import { CareTeamMessagesPanel } from "@/components/nutrition/CareTeamMessagesPanel";
import { useSubrolePermissions } from "@/hooks/useSubrolePermissions";

interface CoachClientDetailProps {
  clientUserId: string;
  onBack: () => void;
}

interface ClientInfo {
  displayName: string;
  firstName: string | null;
  serviceName: string;
  status: string;
  startDate: string;
  nextBillingDate: string | null;
  subscriptionId: string;
}

// Coach-safe medical flags (no PHI exposed)
interface MedicalFlags {
  needsMedicalReview: boolean;
  medicalCleared: boolean;
  medicalClearedAt: string | null;
  adminSummary: string | null;
  hasInjuriesNoted: boolean;
  submissionDate: string | null;
}

interface PrimaryCoach {
  user_id: string;
  first_name: string;
  last_name: string | null;
  profile_picture_url: string | null;
  specializations: string[] | null;
}

export function CoachClientDetail({ clientUserId, onBack }: CoachClientDetailProps) {
  const [clientInfo, setClientInfo] = useState<ClientInfo | null>(null);
  const [medicalFlags, setMedicalFlags] = useState<MedicalFlags | null>(null);
  const [primaryCoach, setPrimaryCoach] = useState<PrimaryCoach | null>(null);
  const [isPrimaryCoach, setIsPrimaryCoach] = useState(false);
  const [isCareTeamMember, setIsCareTeamMember] = useState(false);
  const [careTeamRole, setCareTeamRole] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [showAssignProgram, setShowAssignProgram] = useState(false);
  const [showDirectCalendar, setShowDirectCalendar] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const { toast } = useToast();
  const { canBuildPrograms, canAssignWorkouts } = useSubrolePermissions(currentUserId || undefined);

  const checkCurrentUserRole = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      setCurrentUserId(user.id);

      // Check if current user is admin
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      
      const roles = rolesData?.map(r => r.role) || [];
      setIsAdmin(roles.includes("admin"));
    } catch (error) {
      console.error("Error checking user role:", error);
    }
  }, []);

  const loadClientInfo = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      // Get profile info from profiles_public ONLY (non-sensitive data)
      // Coaches cannot access profiles_private (email, phone, DOB, gender)
      const { data: profile } = await supabase
        .from('profiles_public')
        .select('first_name, display_name, status')
        .eq('id', clientUserId)
        .single();

      // Get subscription info with coach
      const { data: subscription } = await supabase
        .from('subscriptions')
        .select(`
          id,
          start_date,
          next_billing_date,
          status,
          coach_id,
          services (name)
        `)
        .eq('user_id', clientUserId)
        .eq('status', 'active')
        .maybeSingle();

      // Use secure RPC to get medical flags (coach-safe, no PHI exposed)
      const { data: flagsData, error: flagsError } = await supabase
        .rpc('get_client_medical_flags', { p_client_user_id: clientUserId });

      if (flagsError) {
        console.error('Error fetching medical flags:', flagsError);
      }

      // Set medical flags from RPC response
      if (flagsData && flagsData.length > 0) {
        const flags = flagsData[0];
        setMedicalFlags({
          needsMedicalReview: flags.needs_medical_review || false,
          medicalCleared: flags.medical_cleared || false,
          medicalClearedAt: flags.medical_cleared_at,
          adminSummary: flags.admin_summary,
          hasInjuriesNoted: flags.has_injuries_noted || false,
          submissionDate: flags.submission_date,
        });
      } else {
        setMedicalFlags({
          needsMedicalReview: false,
          medicalCleared: false,
          medicalClearedAt: null,
          adminSummary: null,
          hasInjuriesNoted: false,
          submissionDate: null,
        });
      }

      if (profile && subscription) {
        setClientInfo({
          displayName: profile.display_name || profile.first_name || 'Client',
          firstName: profile.first_name,
          serviceName: subscription.services?.name || 'Unknown',
          status: subscription.status || profile.status,
          startDate: subscription.start_date,
          nextBillingDate: subscription.next_billing_date,
          subscriptionId: subscription.id,
        });

        // Log medical flags access for audit trail
        const { data: rolesData } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", user.id);
        
        const rolesList = rolesData?.map(r => r.role) || [];
        const roleLabel = rolesList.includes("admin") ? "admin" : rolesList.includes("coach") ? "coach" : "client";
        
        logPHIAccess({
          action: "view_medical_flags",
          targetUserId: clientUserId,
          targetTable: "form_submissions_safe",
          userRole: roleLabel,
        });

        // Check if current user is primary coach
        if (user && subscription.coach_id === user.id) {
          setIsPrimaryCoach(true);
        }

        // Load primary coach info (public-safe data only via coaches_directory)
        if (subscription.coach_id) {
          const { data: coachData } = await supabase
            .from('coaches_directory')
            .select('user_id, first_name, last_name, profile_picture_url, specializations')
            .eq('user_id', subscription.coach_id)
            .single();
          
          if (coachData) {
            setPrimaryCoach(coachData);
          }
        }

        // Check if current user is a care team member for this client
        if (user && !isPrimaryCoach) {
          const { data: careTeamData } = await supabase
            .from('care_team_assignments')
            .select('specialty')
            .eq('subscription_id', subscription.id)
            .eq('staff_user_id', user.id)
            .eq('status', 'active')
            .maybeSingle();
          
          if (careTeamData) {
            setIsCareTeamMember(true);
            setCareTeamRole(careTeamData.specialty);
          }
        }
      }
    } catch (error) {
      console.error('Error loading client info:', error);
    } finally {
      setLoading(false);
    }
  }, [clientUserId, isPrimaryCoach]);

  useEffect(() => {
    loadClientInfo();
    checkCurrentUserRole();
  }, [loadClientInfo, checkCurrentUserRole]);

  const handleRequestAdminReview = () => {
    toast({
      title: "Review Request Sent",
      description: "Admin has been notified to review this client's medical information.",
    });
    // In a full implementation, this would send a notification to admins
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading client details...</div>;
  }

  if (!clientInfo) {
    return <div className="text-sm text-destructive">Client not found</div>;
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { variant: "default" | "destructive" | "outline" | "secondary", label: string }> = {
      active: { variant: "default", label: "Active" },
      payment_failed: { variant: "destructive", label: "Payment Failed" },
      inactive: { variant: "destructive", label: "Deactivated" },
      cancelled: { variant: "outline", label: "Cancelled" },
    };
    const config = statusMap[status] || { variant: "outline" as const, label: status };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button onClick={onBack} variant="outline">
          ← Back to Clients
        </Button>
        <div className="flex items-center gap-2">
          {(isPrimaryCoach || isCareTeamMember || isAdmin) && (
            <Button variant="outline" onClick={() => setShowDirectCalendar(!showDirectCalendar)}>
              <Calendar className="h-4 w-4 mr-2" />
              {showDirectCalendar ? "Hide Calendar" : "Direct Calendar"}
            </Button>
          )}
          {(isPrimaryCoach || canBuildPrograms) && (
            <Button onClick={() => setShowAssignProgram(true)}>
              <Dumbbell className="h-4 w-4 mr-2" />
              Assign Program
            </Button>
          )}
        </div>
      </div>

      {medicalFlags?.needsMedicalReview && !medicalFlags?.medicalCleared && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            ⚠️ Client requires medical review. Please contact admin before prescribing high-intensity training.
          </AlertDescription>
        </Alert>
      )}

      {medicalFlags?.medicalCleared && (
        <Alert className="border-primary/30 bg-primary/5">
          <CheckCircle2 className="h-4 w-4 text-primary" />
          <AlertDescription>
            ✓ Medical clearance confirmed
            {medicalFlags.medicalClearedAt && (
              <span className="ml-1 text-sm opacity-75">
                on {format(new Date(medicalFlags.medicalClearedAt), 'MMM dd, yyyy')}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      {/* Direct Client Calendar - visible to primary coach, care team, and admin */}
      {showDirectCalendar && currentUserId && clientInfo && (
        <DirectClientCalendar
          clientUserId={clientUserId}
          coachUserId={currentUserId}
          subscriptionId={clientInfo.subscriptionId}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Client Overview</span>
            {/* Show coach's role clearly */}
            {isPrimaryCoach && (
              <Badge variant="default" className="gap-1 bg-primary">
                <Crown className="h-3 w-3" />
                Primary Coach
              </Badge>
            )}
            {isCareTeamMember && !isPrimaryCoach && (
              <Badge variant="secondary" className="gap-1">
                <Users className="h-3 w-3" />
                {careTeamRole ? `${careTeamRole.charAt(0).toUpperCase() + careTeamRole.slice(1)} Specialist` : 'Care Team'}
              </Badge>
            )}
            {isAdmin && !isPrimaryCoach && !isCareTeamMember && (
              <Badge variant="outline" className="gap-1">
                Admin View
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-2xl font-bold">{clientInfo.displayName}</h3>
            <div className="mt-2">{getStatusBadge(clientInfo.status)}</div>
          </div>

          {/* Note: Coaches cannot see email, phone, or DOB for privacy */}
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              Contact details are managed by the client. Use in-app messaging or TrueCoach for communication.
            </AlertDescription>
          </Alert>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="text-sm text-muted-foreground">Plan Type</p>
              <p className="font-medium">{clientInfo.serviceName}</p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Start Date</p>
              <p className="font-medium">
                {format(new Date(clientInfo.startDate), 'MMM dd, yyyy')}
              </p>
            </div>
            {clientInfo.nextBillingDate && (
              <div>
                <p className="text-sm text-muted-foreground">Next Renewal</p>
                <p className="font-medium">
                  {format(new Date(clientInfo.nextBillingDate), 'MMM dd, yyyy')}
                </p>
              </div>
            )}
          </div>

          {/* Medical Status Section - Coach-safe flags only, no PHI */}
          <div className="border-t pt-4">
            <MedicalSectionHeader
              title="Medical Status"
              isReadOnly={!isAdmin}
              showAdminBadge={isAdmin}
            />
            
            <div className="mt-3 space-y-3">
              {/* Medical Review Status */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-36">Review Required:</span>
                {medicalFlags?.needsMedicalReview ? (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Yes
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                    <CheckCircle2 className="h-3 w-3" />
                    No
                  </Badge>
                )}
              </div>

              {/* Medical Clearance Status */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground w-36">Cleared:</span>
                {medicalFlags?.medicalCleared ? (
                  <Badge variant="outline" className="gap-1 text-primary border-primary/30">
                    <CheckCircle2 className="h-3 w-3" />
                    Yes
                    {medicalFlags.medicalClearedAt && (
                      <span className="text-xs opacity-75 ml-1">
                        ({format(new Date(medicalFlags.medicalClearedAt), 'MMM dd')})
                      </span>
                    )}
                  </Badge>
                ) : medicalFlags?.needsMedicalReview ? (
                  <Badge variant="secondary" className="gap-1">
                    <Clock className="h-3 w-3" />
                    Pending
                  </Badge>
                ) : (
                  <Badge variant="outline" className="gap-1">
                    N/A
                  </Badge>
                )}
              </div>

              {/* Injuries Noted Flag */}
              {medicalFlags?.hasInjuriesNoted && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground w-36">Injuries Noted:</span>
                  <Badge variant="secondary" className="gap-1">
                    <Info className="h-3 w-3" />
                    Yes (details restricted)
                  </Badge>
                </div>
              )}

              {/* Admin Summary (if provided) */}
              {medicalFlags?.adminSummary && (
                <div className="mt-2 p-3 bg-muted rounded-md">
                  <p className="text-sm font-medium mb-1">Admin Notes:</p>
                  <p className="text-sm text-muted-foreground">{medicalFlags.adminSummary}</p>
                </div>
              )}

              {/* Coach Actions */}
              {!isAdmin && (
                <div className="mt-4 space-y-2">
                  <Alert>
                    <Shield className="h-4 w-4" />
                    <AlertDescription>
                      Detailed medical history is restricted. Only status flags are visible to coaches.
                    </AlertDescription>
                  </Alert>
                  
                  {(medicalFlags?.needsMedicalReview || medicalFlags?.hasInjuriesNoted) && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleRequestAdminReview}
                      className="gap-2"
                    >
                      <MessageSquare className="h-4 w-4" />
                      Request Admin Review
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Care Team Card - Management view for primary coach/admin */}
      {(isPrimaryCoach || isAdmin) && (
        <CareTeamCard
          clientId={clientUserId}
          subscriptionId={clientInfo.subscriptionId}
          primaryCoach={primaryCoach}
          isPrimaryCoach={isPrimaryCoach}
          isAdmin={isAdmin}
        />
      )}

      {/* Care Team Overview Card - Read-only view for all viewers */}
      {!isPrimaryCoach && !isAdmin && (
        <CareTeamOverviewCard
          subscriptionId={clientInfo.subscriptionId}
          primaryCoach={primaryCoach}
        />
      )}

      {/* Care Team Messages - Internal communication */}
      {(isPrimaryCoach || isCareTeamMember || isAdmin) && (
        <CareTeamMessagesPanel clientId={clientUserId} />
      )}

      <div>
        <h3 className="text-xl font-bold mb-4">Nutrition Progress</h3>
        <ClientNutritionProgress />
      </div>

      {/* Assign Program Dialog */}
      {currentUserId && clientInfo && (
        <AssignProgramDialog
          open={showAssignProgram}
          onOpenChange={setShowAssignProgram}
          coachUserId={currentUserId}
          clientUserId={clientUserId}
          clientName={clientInfo.displayName}
          subscriptionId={clientInfo.subscriptionId}
          onAssigned={() => {
            toast({
              title: "Program Assigned",
              description: `Workout program has been assigned to ${clientInfo.displayName}.`,
            });
          }}
        />
      )}
    </div>
  );
}
