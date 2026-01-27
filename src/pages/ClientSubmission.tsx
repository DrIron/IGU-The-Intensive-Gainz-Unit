import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowLeft, Loader2, Shield, Info } from "lucide-react";
import { useUserRole, canViewPHI, canEditMedicalData } from "@/hooks/useUserRole";
import { PHIRestrictedField, MedicalSectionHeader } from "@/components/phi/PHIRestrictedField";
import { usePHIAuditLog } from "@/hooks/usePHIAuditLog";

// Public form data that coaches can see
interface FormSubmissionPublic {
  id: string;
  first_name: string;
  last_name: string;
  plan_name: string;
  training_experience: string;
  training_goals: string;
  training_days_per_week: string;
  gym_access_type: string;
  preferred_gym_location: string;
  home_gym_equipment: string;
  preferred_training_times: string[];
  nutrition_approach: string;
  discord_username: string;
  heard_about_us: string;
  heard_about_us_other: string;
  accepts_team_program: boolean;
  understands_no_nutrition: boolean;
  accepts_lower_body_only: boolean;
  needs_medical_review: boolean;
  agreed_terms: boolean;
  agreed_privacy: boolean;
  agreed_refund_policy: boolean;
  agreed_intellectual_property: boolean;
  agreed_medical_disclaimer: boolean;
  agreed_terms_at: string;
  agreed_privacy_at: string;
  agreed_refund_policy_at: string;
  agreed_intellectual_property_at: string;
  agreed_medical_disclaimer_at: string;
  created_at: string;
  focus_areas: string[];
  coach_preference_type: string | null;
  requested_coach_id: string | null;
  user_id: string;
}

// PHI data only visible to admins and record owners
interface FormSubmissionPHI {
  email?: string;
  phone_number?: string;
  parq_heart_condition?: boolean;
  parq_chest_pain_active?: boolean;
  parq_chest_pain_inactive?: boolean;
  parq_balance_dizziness?: boolean;
  parq_bone_joint_problem?: boolean;
  parq_medication?: boolean;
  parq_other_reason?: boolean;
  parq_injuries_conditions?: string;
  parq_additional_details?: string;
}

interface SubscriptionWithCoach {
  id: string;
  coach_id: string | null;
  coach_assignment_method: string | null;
  needs_coach_assignment: boolean | null;
  coaches: {
    first_name: string;
    last_name: string | null;
  } | null;
}

export default function ClientSubmission() {
  const { userId } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin, isCoach, userId: currentUserId, loading: roleLoading } = useUserRole();
  
  const [submission, setSubmission] = useState<FormSubmissionPublic | null>(null);
  const [phiData, setPhiData] = useState<FormSubmissionPHI | null>(null);
  const [subscription, setSubscription] = useState<SubscriptionWithCoach | null>(null);
  const [requestedCoach, setRequestedCoach] = useState<{ first_name: string; last_name: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  
  const { logAccess } = usePHIAuditLog();

  // Determine PHI access
  const userCanViewPHI = canViewPHI(isAdmin, currentUserId, userId || "");
  const userCanEditMedical = canEditMedicalData(isAdmin);

  useEffect(() => {
    if (!roleLoading) {
      loadSubmission();
    }
  }, [userId, roleLoading, isAdmin]);

  const loadSubmission = async () => {
    try {
      let publicData: any = null;
      let fullData: any = null;
      
      if (isAdmin) {
        // Admins get full access via form_submissions
        const { data, error } = await supabase
          .from("form_submissions")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (error) throw error;
        fullData = data;
        publicData = data;
      } else {
        // Coaches use form_submissions_safe - no access to form_submissions at all
        const { data, error } = await supabase
          .from("form_submissions_safe")
          .select("*")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (error) throw error;
        publicData = data;
      }
      
      if (publicData) {
        // Set public data
        setSubmission(publicData as FormSubmissionPublic);
        
        // Log PHI access for audit trail
        const userRoleLabel = isAdmin ? "admin" : isCoach ? "coach" : "client";
        logAccess({
          action: isAdmin ? "view_medical_detail" : "view_medical_summary",
          targetUserId: userId,
          targetTable: isAdmin ? "form_submissions" : "form_submissions_safe",
          userRole: userRoleLabel,
        });
        
        // If admin, also set PHI data
        if (isAdmin && fullData) {
          setPhiData({
            email: fullData.email,
            phone_number: fullData.phone_number,
            parq_heart_condition: fullData.parq_heart_condition,
            parq_chest_pain_active: fullData.parq_chest_pain_active,
            parq_chest_pain_inactive: fullData.parq_chest_pain_inactive,
            parq_balance_dizziness: fullData.parq_balance_dizziness,
            parq_bone_joint_problem: fullData.parq_bone_joint_problem,
            parq_medication: fullData.parq_medication,
            parq_other_reason: fullData.parq_other_reason,
            parq_injuries_conditions: fullData.parq_injuries_conditions,
            parq_additional_details: fullData.parq_additional_details,
          });
        }
      }

      // Load subscription with coach info
      if (userId) {
        const { data: subData } = await supabase
          .from("subscriptions")
          .select(`
            id,
            coach_id,
            coach_assignment_method,
            needs_coach_assignment,
            coaches (
              first_name,
              last_name
            )
          `)
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        
        setSubscription(subData as SubscriptionWithCoach | null);
      }

      // Load requested coach name if applicable - use coaches_directory (public-safe view)
      if (publicData?.requested_coach_id) {
        const { data: coachData } = await supabase
          .from("coaches_directory")
          .select("first_name, last_name")
          .eq("user_id", publicData.requested_coach_id)
          .maybeSingle();
        
        setRequestedCoach(coachData);
      }
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

  if (loading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!submission) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card>
          <CardContent className="pt-6">
            <p className="text-muted-foreground">No submission found for this client.</p>
            <Button onClick={() => navigate(-1)} className="mt-4">
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 pt-20 pb-4 px-4">
      <div className="container mx-auto max-w-4xl py-8">
        <Button 
          variant="ghost" 
          onClick={() => navigate("/dashboard")}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Clients
        </Button>

        {/* Role-based access notice for coaches */}
        {isCoach && !isAdmin && (
          <Alert className="mb-4">
            <Shield className="h-4 w-4" />
            <AlertDescription>
              You are viewing this form as a coach. Personal contact information and detailed medical history are restricted. Contact admin for full access if needed.
            </AlertDescription>
          </Alert>
        )}

        {/* Admin access indicator */}
        {isAdmin && (
          <Alert className="mb-4 border-primary/20 bg-primary/5">
            <Info className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">Admin View:</span> You have full access to all client data including PHI.
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-2xl">Client Registration Form</CardTitle>
            <CardDescription>
              Submitted on {new Date(submission.created_at).toLocaleDateString("en-US", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit"
              })}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Personal Information - PHI restricted for coaches */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Personal Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">Full Name</p>
                  <p className="font-medium">{submission.first_name} {submission.last_name}</p>
                </div>
                
                {/* Email - PHI restricted */}
                <PHIRestrictedField
                  label="Email"
                  value={phiData?.email}
                  canView={userCanViewPHI}
                  placeholder="Contact via TrueCoach"
                />
                
                {/* Phone - PHI restricted */}
                <PHIRestrictedField
                  label="Phone Number"
                  value={phiData?.phone_number}
                  canView={userCanViewPHI}
                  placeholder="Contact via TrueCoach"
                />
                
                <div>
                  <p className="text-sm text-muted-foreground">Discord Username</p>
                  <p className="font-medium">{submission.discord_username || "Not provided"}</p>
                </div>
              </div>
            </div>

            {/* Plan Selection & Coach Assignment */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Selected Plan & Coach</h3>
              <div className="space-y-3">
                <div>
                  <Badge variant="default" className="text-base px-4 py-2">{submission.plan_name}</Badge>
                </div>
                
                {/* Coach Preference Info */}
                {submission.coach_preference_type && (
                  <div className="bg-muted/50 rounded-lg p-4 space-y-2">
                    <div>
                      <p className="text-sm text-muted-foreground">Coach Preference</p>
                      <p className="font-medium">
                        {submission.coach_preference_type === "auto" 
                          ? "Auto-match (system selected)" 
                          : "Client selected specific coach"}
                      </p>
                    </div>
                    
                    {submission.coach_preference_type === "specific" && requestedCoach && (
                      <div>
                        <p className="text-sm text-muted-foreground">Requested Coach</p>
                        <p className="font-medium">{requestedCoach.first_name} {requestedCoach.last_name}</p>
                      </div>
                    )}
                    
                    {subscription && (
                      <>
                        <div>
                          <p className="text-sm text-muted-foreground">Assigned Coach</p>
                          {subscription.coaches ? (
                            <div className="flex items-center gap-2">
                              <p className="font-medium">
                                {subscription.coaches.first_name} {subscription.coaches.last_name}
                              </p>
                              {subscription.coach_assignment_method && (
                                <Badge variant="outline" className="text-xs">
                                  {subscription.coach_assignment_method === "preference" 
                                    ? "Via preference" 
                                    : subscription.coach_assignment_method === "auto"
                                    ? "Auto-matched"
                                    : subscription.coach_assignment_method === "manual"
                                    ? "Manually assigned"
                                    : "Reassigned"}
                                </Badge>
                              )}
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <p className="font-medium text-muted-foreground">Not yet assigned</p>
                              {subscription.needs_coach_assignment && (
                                <Badge variant="destructive" className="text-xs">
                                  Needs manual assignment
                                </Badge>
                              )}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Training Information */}
            {submission.training_experience && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Training Information</h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-sm text-muted-foreground">Training Experience</p>
                    <p className="font-medium capitalize">{submission.training_experience?.replace("_", " ")}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Training Goals</p>
                    <p className="font-medium">{submission.training_goals}</p>
                  </div>
                  {submission.training_days_per_week && (
                    <div>
                      <p className="text-sm text-muted-foreground">Training Days Per Week</p>
                      <p className="font-medium">{submission.training_days_per_week}</p>
                    </div>
                  )}
                  {submission.gym_access_type && (
                    <div>
                      <p className="text-sm text-muted-foreground">Gym Access Type</p>
                      <p className="font-medium capitalize">{submission.gym_access_type?.replace("_", " ")}</p>
                    </div>
                  )}
                  {submission.preferred_gym_location && (
                    <div>
                      <p className="text-sm text-muted-foreground">Preferred Gym Location</p>
                      <p className="font-medium">{submission.preferred_gym_location}</p>
                    </div>
                  )}
                  {submission.home_gym_equipment && (
                    <div>
                      <p className="text-sm text-muted-foreground">Home Gym Equipment</p>
                      <p className="font-medium">{submission.home_gym_equipment}</p>
                    </div>
                  )}
                  {submission.preferred_training_times && submission.preferred_training_times.length > 0 && (
                    <div>
                      <p className="text-sm text-muted-foreground">Preferred Training Times</p>
                      <p className="font-medium">{submission.preferred_training_times.join(", ")}</p>
                    </div>
                  )}
                  {submission.nutrition_approach && (
                    <div>
                      <p className="text-sm text-muted-foreground">Nutrition Approach</p>
                      <p className="font-medium capitalize">{submission.nutrition_approach?.replace("_", " ")}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Team Program Acknowledgments */}
            {(submission.accepts_team_program || submission.understands_no_nutrition || submission.accepts_lower_body_only) && (
              <div>
                <h3 className="text-lg font-semibold mb-3">Program Acknowledgments</h3>
                <div className="space-y-2">
                  {submission.accepts_team_program && (
                    <p className="text-sm">✓ Accepts team program format</p>
                  )}
                  {submission.understands_no_nutrition && (
                    <p className="text-sm">✓ Understands no nutrition coaching included</p>
                  )}
                  {submission.accepts_lower_body_only && (
                    <p className="text-sm">✓ Accepts lower body only training</p>
                  )}
                </div>
              </div>
            )}

            {/* PAR-Q Health Screening - PHI RESTRICTED */}
            <div>
              <MedicalSectionHeader
                title="Health Screening (PAR-Q)"
                isReadOnly={!userCanEditMedical}
                showAdminBadge={isAdmin}
              />
              
              {submission.needs_medical_review && (
                <Badge variant="destructive" className="mb-3">Needs Medical Review</Badge>
              )}

              {/* For coaches: Show summary only, no detailed medical data */}
              {!userCanViewPHI ? (
                <div className="bg-muted/50 rounded-lg p-4 space-y-3">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Medical details are restricted. Contact admin for full history.
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">Medical Review Required:</span>
                      <span className="ml-2 font-medium">{submission.needs_medical_review ? "Yes" : "No"}</span>
                    </div>
                  </div>
                  <Alert>
                    <Info className="h-4 w-4" />
                    <AlertDescription>
                      Use TrueCoach messaging to discuss training modifications with the client directly.
                    </AlertDescription>
                  </Alert>
                </div>
              ) : (
                /* For admins: Show full PAR-Q details */
                <div className="space-y-2">
                  <p className="text-sm">Heart condition: {phiData?.parq_heart_condition ? "✓ Yes" : "✗ No"}</p>
                  <p className="text-sm">Chest pain during activity: {phiData?.parq_chest_pain_active ? "✓ Yes" : "✗ No"}</p>
                  <p className="text-sm">Chest pain at rest: {phiData?.parq_chest_pain_inactive ? "✓ Yes" : "✗ No"}</p>
                  <p className="text-sm">Balance/dizziness issues: {phiData?.parq_balance_dizziness ? "✓ Yes" : "✗ No"}</p>
                  <p className="text-sm">Bone/joint problems: {phiData?.parq_bone_joint_problem ? "✓ Yes" : "✗ No"}</p>
                  <p className="text-sm">Taking medication: {phiData?.parq_medication ? "✓ Yes" : "✗ No"}</p>
                  <p className="text-sm">Other health reasons: {phiData?.parq_other_reason ? "✓ Yes" : "✗ No"}</p>
                  {phiData?.parq_injuries_conditions && (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground">Injuries/Conditions</p>
                      <p className="font-medium">{phiData.parq_injuries_conditions}</p>
                    </div>
                  )}
                  {phiData?.parq_additional_details && (
                    <div className="mt-3">
                      <p className="text-sm text-muted-foreground">Additional Details</p>
                      <p className="font-medium">{phiData.parq_additional_details}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Referral Source */}
            <div>
              <h3 className="text-lg font-semibold mb-3">Referral Source</h3>
              <p className="font-medium capitalize">{submission.heard_about_us?.replace("_", " ")}</p>
              {submission.heard_about_us_other && (
                <p className="text-sm text-muted-foreground mt-1">{submission.heard_about_us_other}</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
