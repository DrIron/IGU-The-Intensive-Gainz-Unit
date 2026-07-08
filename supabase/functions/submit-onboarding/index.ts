import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";
import { wrapInLayout } from '../_shared/emailTemplate.ts';
import { greeting, paragraph, alertBox, orderedList, ctaButton, signOff } from '../_shared/emailComponents.ts';
import { sendEmail } from '../_shared/sendEmail.ts';
import { EMAIL_FROM_COACHING, APP_BASE_URL } from '../_shared/config.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Surface the real Postgres/PostgREST error in the SERVER logs only (never in the
// client response body). Every 500 branch below used to log a bare
// error:"db_error", which is why localizing the last incident needed a full DB
// sweep. message/code/details/hint make the next one diagnosable from logs alone.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbErrDetails(e: any) {
  return e
    ? { message: e.message ?? null, code: e.code ?? null, details: e.details ?? null, hint: e.hint ?? null }
    : null;
}

// Server-side validation schema matching client-side
const formSchema = z.object({
  // PAR-Q
  parq_heart_condition: z.boolean(),
  parq_chest_pain_active: z.boolean(),
  parq_chest_pain_inactive: z.boolean(),
  parq_balance_dizziness: z.boolean(),
  parq_bone_joint_problem: z.boolean(),
  parq_medication: z.boolean(),
  parq_other_reason: z.boolean(),
  parq_injuries_conditions: z.string().max(1000).optional(),
  parq_additional_details: z.string().max(2000).optional(),
  
  // Training (conditionally required)
  training_experience: z.string().max(50).optional(),
  training_goals: z.string().max(2000).optional(),
  training_days_per_week: z.string().max(50).optional(),
  preferred_training_times: z.array(z.string().max(50)).optional(),
  gym_access_type: z.string().max(100).optional(),
  preferred_gym_location: z.string().max(200).optional(),
  home_gym_equipment: z.string().max(500).optional(),
  other_gym_location: z.string().max(200).optional(),
  nutrition_approach: z.string().max(100).optional(),
  accepts_team_program: z.boolean().optional(),
  understands_no_nutrition: z.boolean().optional(),
  accepts_lower_body_only: z.boolean().optional(),
  
  // Legal
  agreed_terms: z.boolean().refine(val => val === true, "Required"),
  agreed_privacy: z.boolean().refine(val => val === true, "Required"),
  agreed_refund_policy: z.boolean().refine(val => val === true, "Required"),
  agreed_intellectual_property: z.boolean().refine(val => val === true, "Required"),
  agreed_medical_disclaimer: z.boolean().refine(val => val === true, "Required"),
  
  // Documents (optional - can be uploaded later on dashboard)
  master_agreement_url: z.string().url().max(500).optional(),
  liability_release_url: z.string().url().max(500).optional(),
  
  // Service & Personal Info
  first_name: z.string().min(1).max(100).trim(),
  last_name: z.string().min(1).max(100).trim(),
  email: z.string().email().max(255).trim().toLowerCase(),
  phone_number: z.string().min(1).max(50).trim(),
  gender: z.enum(['male', 'female']).optional(),
  date_of_birth: z.string().max(20).trim().optional(),
  height_cm: z.number().int().min(100).max(250).optional(),
  activity_level: z.enum(["1.2", "1.375", "1.55", "1.725", "1.9"]).optional(),
  discord_username: z.string().max(100).trim().optional(),
  plan_name: z.string().min(1).max(100),
  focus_areas: z.array(z.string().max(50)).optional(),
  heard_about_us: z.string().min(1).max(100),
  heard_about_us_other: z.string().max(500).optional(),
  // Coach preference fields (1:1 plans only)
  coach_preference_type: z.enum(['auto', 'specific']).default('auto'),
  requested_coach_id: z.string().uuid().nullable().optional(),
  // Team selection (team plans only)
  selected_team_id: z.string().uuid().optional(),
});

// Conditional validations based on selected plan
const schema = formSchema.superRefine((data, ctx) => {
  const isOneToOne = data.plan_name === '1:1 Online' || data.plan_name === '1:1 In-Person' || data.plan_name === '1:1 Hybrid';
  const isTeam = data.plan_name === 'Fe Squad' || data.plan_name === 'Bunz of Steel' || data.plan_name === 'Team Plan';

  if (isOneToOne) {
    if (!data.training_experience || data.training_experience.trim().length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['training_experience'], message: 'Required' });
    }
    if (!data.training_goals || data.training_goals.trim().length < 10) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['training_goals'], message: 'Please describe your goals (minimum 10 characters)' });
    }
    if (data.plan_name === '1:1 Online') {
      if (!data.training_days_per_week) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['training_days_per_week'], message: 'Required' });
      }
      if (!data.gym_access_type) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['gym_access_type'], message: 'Required' });
      }
    }
    if (data.plan_name === '1:1 In-Person' || data.plan_name === '1:1 Hybrid') {
      if (!data.preferred_training_times || data.preferred_training_times.length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['preferred_training_times'], message: 'Required' });
      }
      if (!data.preferred_gym_location || data.preferred_gym_location.trim().length === 0) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['preferred_gym_location'], message: 'Required' });
      }
    }
  }

  if (isTeam) {
    if (!data.accepts_team_program) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accepts_team_program'], message: 'Required' });
    }
    if (!data.understands_no_nutrition) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['understands_no_nutrition'], message: 'Required' });
    }
    if (data.plan_name === 'Bunz of Steel' && !data.accepts_lower_body_only) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['accepts_lower_body_only'], message: 'Required' });
    }
  }
});

// Coach assignment (focus-area scoring + capacity + round-robin) moved into
// the assign_coach_atomic RPC -- see migration 20260522120000.

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "config_check", ok: false, error: "missing_supabase_config" }));
      return new Response(
        JSON.stringify({ error: 'Configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get auth token from request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's auth token
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "auth", ok: false, error: "auth_error" }));
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: 5 requests per minute per user
    const rateCheck = checkRateLimit(`user:${user.id}`, 5, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    // Parse and validate request body BEFORE any DB reads/writes -- a malformed
    // payload must be rejected before the destructive user_roles reset below.
    const body = await req.json();

    let validatedData;
    try {
      validatedData = schema.parse(body);
    } catch (validationError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "validation", ok: false, error: "validation_error" }));
      return new Response(
        JSON.stringify({
          error: 'Invalid input data',
          details: validationError instanceof z.ZodError ? validationError.errors : 'Validation failed'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Check user roles - admins and coaches cannot sign up for services
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "check_roles", ok: false, error: "db_error" }));
    }

    if (userRoles && userRoles.length > 0) {
      const roles = userRoles.map(r => r.role);
      if (roles.includes('admin') || roles.includes('coach')) {
        return new Response(
          JSON.stringify({ error: 'Admins and coaches cannot sign up for services' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // SECURITY: Check for active subscriptions - users with active subscriptions cannot sign up for another
    const { data: activeSubscriptions, error: subscriptionError } = await supabase
      .from('subscriptions')
      .select('id, status')
      .eq('user_id', user.id)
      .eq('status', 'active');

    if (subscriptionError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "check_active_subs", ok: false, error: "db_error" }));
    }

    if (activeSubscriptions && activeSubscriptions.length > 0) {
      return new Response(
        JSON.stringify({ error: 'You already have an active subscription. Please cancel your current subscription before signing up for another service.' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use service role to clean up existing roles for this user
    const supabaseServiceRole = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Delete any existing user_roles for this user to avoid conflicts
    const { error: roleDeleteError } = await supabaseServiceRole
      .from('user_roles')
      .delete()
      .eq('user_id', user.id);
    
    if (roleDeleteError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "delete_existing_roles", ok: false, error: "db_error" }));
    }

    // Calculate needs_medical_review
    const needs_medical_review =
      validatedData.parq_heart_condition ||
      validatedData.parq_chest_pain_active ||
      validatedData.parq_chest_pain_inactive ||
      validatedData.parq_balance_dizziness ||
      validatedData.parq_bone_joint_problem ||
      validatedData.parq_medication ||
      validatedData.parq_other_reason;

    // Map plan_name to enum form_type
    const formTypeMap: Record<string, string> = {
      'Team Plan': 'team_plan',
      'Fe Squad': 'fe_squad',
      'Bunz of Steel': 'buns_of_steel',
      '1:1 Online': 'one_to_one_online',
      '1:1 In-Person': 'one_to_one_in_person',
      '1:1 Hybrid': 'one_to_one_hybrid',
    };
    const mappedFormType = formTypeMap[validatedData.plan_name];
    if (!mappedFormType) {
      return new Response(
        JSON.stringify({ error: 'Unsupported plan name' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Normalize enums from legacy values and provide safe defaults
    const referralAllowed = new Set(['instagram', 'tiktok', 'youtube', 'google', 'twitter_x', 'friend_referral', 'gym_flyer', 'returning_client', 'other']);
    const mappedHeard = referralAllowed.has(validatedData.heard_about_us)
      ? validatedData.heard_about_us
      : (validatedData.heard_about_us === 'friend' ? 'friend_referral' : 'other');

    const expMap: Record<string, string> = {
      beginner: 'beginner_0_6',
      intermediate: 'intermediate_6_24',
      advanced: 'advanced_24_plus',
    };
    let isTeamPlan = validatedData.plan_name === 'Fe Squad' || validatedData.plan_name === 'Bunz of Steel' || validatedData.plan_name === 'Team Plan';
    let mappedExp = validatedData.training_experience ? (expMap[validatedData.training_experience] || validatedData.training_experience) : undefined;
    if (isTeamPlan && !mappedExp) mappedExp = 'beginner_0_6';

    const mappedNutrition = validatedData.nutrition_approach === 'macros_and_calories'
      ? 'macros_calories'
      : validatedData.nutrition_approach;

    // Note: preferred_coach_id selection has been removed from UI.
    // Coach assignment is now handled automatically based on focus_areas.

    // Capture the current timestamp for legal agreements
    const agreementTimestamp = new Date().toISOString();

  // Whitelist ONLY real form_submissions columns. A blind `...validatedData`
  // spread leaked non-column keys into the insert -- gender / height_cm /
  // date_of_birth belong to profiles_private, activity_level to profiles_public,
  // other_gym_location has no column at all. PostgREST rejects an unknown key
  // with "Could not find the 'X' column ... in the schema cache" -> the whole
  // insert 500s and NO row persists (which is exactly what broke onboarding once
  // demographics/activity/gym fields entered the schema). date_of_birth is a real
  // form_submissions column so it stays here too; the others are written to their
  // own tables below. undefined optionals are dropped by supabase-js (col default).
  const insertPayload: Record<string, unknown> = {
    user_id: user.id,
    form_type: mappedFormType,
    needs_medical_review,
    // PAR-Q
    parq_heart_condition: validatedData.parq_heart_condition,
    parq_chest_pain_active: validatedData.parq_chest_pain_active,
    parq_chest_pain_inactive: validatedData.parq_chest_pain_inactive,
    parq_balance_dizziness: validatedData.parq_balance_dizziness,
    parq_bone_joint_problem: validatedData.parq_bone_joint_problem,
    parq_medication: validatedData.parq_medication,
    parq_other_reason: validatedData.parq_other_reason,
    parq_injuries_conditions: validatedData.parq_injuries_conditions,
    parq_additional_details: validatedData.parq_additional_details,
    // Training / gym
    training_experience: mappedExp,
    training_goals: validatedData.training_goals,
    training_days_per_week: validatedData.training_days_per_week,
    preferred_training_times: validatedData.preferred_training_times,
    gym_access_type: validatedData.gym_access_type,
    preferred_gym_location: validatedData.preferred_gym_location,
    home_gym_equipment: validatedData.home_gym_equipment,
    nutrition_approach: mappedNutrition,
    // Team acknowledgments
    accepts_team_program: validatedData.accepts_team_program,
    understands_no_nutrition: validatedData.understands_no_nutrition,
    accepts_lower_body_only: validatedData.accepts_lower_body_only,
    // Personal / contact
    first_name: validatedData.first_name,
    last_name: validatedData.last_name,
    email: validatedData.email,
    phone_number: validatedData.phone_number,
    date_of_birth: validatedData.date_of_birth,
    discord_username: validatedData.discord_username,
    // Plan / referral
    plan_name: validatedData.plan_name,
    focus_areas: validatedData.focus_areas || [],
    heard_about_us: mappedHeard,
    heard_about_us_other: validatedData.heard_about_us_other,
    // Documents
    master_agreement_url: validatedData.master_agreement_url,
    liability_release_url: validatedData.liability_release_url,
    // Coach preference
    coach_preference_type: validatedData.coach_preference_type || 'auto',
    requested_coach_id: validatedData.requested_coach_id || null,
    // Team selection
    selected_team_id: validatedData.selected_team_id || null,
    // Legal agreements + acceptance timestamps
    agreed_terms: validatedData.agreed_terms,
    agreed_privacy: validatedData.agreed_privacy,
    agreed_refund_policy: validatedData.agreed_refund_policy,
    agreed_intellectual_property: validatedData.agreed_intellectual_property,
    agreed_medical_disclaimer: validatedData.agreed_medical_disclaimer,
    agreed_terms_at: validatedData.agreed_terms ? agreementTimestamp : null,
    agreed_privacy_at: validatedData.agreed_privacy ? agreementTimestamp : null,
    agreed_refund_policy_at: validatedData.agreed_refund_policy ? agreementTimestamp : null,
    agreed_intellectual_property_at: validatedData.agreed_intellectual_property ? agreementTimestamp : null,
    agreed_medical_disclaimer_at: validatedData.agreed_medical_disclaimer ? agreementTimestamp : null,
  };

    // Ensure NOT NULL columns have safe values even for team plans
    if (!insertPayload.training_goals || String(insertPayload.training_goals).trim().length === 0) {
      if (isTeamPlan) {
        insertPayload.training_goals = 'Team plan - goals to be provided after activation';
      } else {
        insertPayload.training_goals = String(insertPayload.training_goals ?? '').trim() || 'Goals to be provided';
      }
    }

    // preferred_coach_id is no longer collected from the UI - coach assignment is automatic

    const { data: submission, error: submissionError } = await supabase
      .from('form_submissions')
      .insert(insertPayload)
      .select()
      .single();

    if (submissionError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "create_form_submission", ok: false, error: "db_error", ...dbErrDetails(submissionError) }));
      return new Response(
        JSON.stringify({ error: 'Failed to submit form' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine the appropriate profile status based on lifecycle
    let newStatus: string;
    const isOneToOne = !isTeamPlan;
    
    if (needs_medical_review) {
      newStatus = 'needs_medical_review';
    } else if (isOneToOne) {
      newStatus = 'pending_coach_approval';
    } else {
      newStatus = 'pending_payment';
    }
    
    const paymentDeadline = new Date();
    paymentDeadline.setDate(paymentDeadline.getDate() + 7);
    
    // Update profiles_public (public fields)
    const profilePublicUpdate: any = {
      first_name: validatedData.first_name,
      display_name: `${validatedData.first_name} ${validatedData.last_name}`,
      status: newStatus,
      onboarding_completed_at: new Date().toISOString(),
    };

    if (isTeamPlan && newStatus === 'pending_payment') {
      profilePublicUpdate.payment_deadline = paymentDeadline.toISOString();
    }

    if (validatedData.activity_level) {
      profilePublicUpdate.activity_level = validatedData.activity_level;
    }

    const { error: profilePublicError } = await supabase
      .from('profiles_public')
      .update(profilePublicUpdate)
      .eq('id', user.id);

    if (profilePublicError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "update_profiles_public", ok: false, error: "db_error", ...dbErrDetails(profilePublicError) }));
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Enqueue a medical review row for the admin review panel. Placed after the
    // profiles_public update so a failed profile update doesn't leave an orphan
    // review. UNIQUE (user_id) -- upsert re-opens the review on resubmit.
    if (needs_medical_review) {
      const { error: medicalReviewError } = await supabase
        .from('medical_reviews')
        .upsert({
          user_id: user.id,
          status: 'pending',
          flagged_at: new Date().toISOString(),
          reviewed_at: null,
          reviewed_by: null,
          review_notes: null,
        }, { onConflict: 'user_id' });

      if (medicalReviewError) {
        console.error(JSON.stringify({ fn: "submit-onboarding", step: "create_medical_review", ok: false, error: "db_error", ...dbErrDetails(medicalReviewError) }));
        return new Response(
          JSON.stringify({ error: 'Failed to create medical review' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Update profiles_private (PII fields)
    const profilePrivateUpdate: Record<string, unknown> = {
      full_name: `${validatedData.first_name} ${validatedData.last_name}`,
      last_name: validatedData.last_name,
      phone: validatedData.phone_number,
    };
    if (validatedData.gender) {
      profilePrivateUpdate.gender = validatedData.gender;
    }
    if (validatedData.date_of_birth) {
      profilePrivateUpdate.date_of_birth = validatedData.date_of_birth;
    }
    if (validatedData.height_cm !== undefined) {
      profilePrivateUpdate.height_cm = validatedData.height_cm;
    }
    const { error: profilePrivateError } = await supabase
      .from('profiles_private')
      .update(profilePrivateUpdate)
      .eq('profile_id', user.id);

    if (profilePrivateError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "update_profiles_private", ok: false, error: "db_error", ...dbErrDetails(profilePrivateError) }));
      // Non-critical - continue
    }
    
    // Get the service_id from the services table based on plan_name
    // Include session booking fields for copying to subscription
    const { data: serviceData, error: serviceError } = await supabase
      .from('services')
      .select('id, type, enable_session_booking, default_weekly_session_limit, default_session_duration_minutes')
      .eq('name', validatedData.plan_name)
      .maybeSingle();
    
    if (serviceError || !serviceData) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "find_service", ok: false, error: "db_error", ...dbErrDetails(serviceError) }));
      return new Response(
        JSON.stringify({ error: 'Service not found for the selected plan' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Re-derive isTeamPlan from service type (authoritative check)
    isTeamPlan = serviceData.type === 'team';

    // ============================================
    // COACH ASSIGNMENT + SUBSCRIPTION CREATE -- atomic
    // ============================================
    // assign_coach_atomic (migration 20260522120000) locks
    // coach_service_limits rows FOR UPDATE during candidate scoring and
    // INSERTs the subscription within the same transaction, closing the
    // TOCTOU race the prior read-then-write logic had. RPC also handles:
    //   - team-plan with selected_team_id (sets coach to head coach)
    //   - team-plan with NO/invalid selected_team_id (flags
    //     needs_coach_assignment instead of polluting admin role)
    //   - 1:1 requested-coach preference with capacity recheck under lock
    //   - 1:1 auto-assignment by focus_areas match + round-robin
    //   - last_assigned_at bump on the chosen coach
    const { data: assignmentResult, error: assignmentError } = await supabaseServiceRole
      .rpc('assign_coach_atomic', {
        p_user_id: user.id,
        p_service_id: serviceData.id,
        p_focus_areas: validatedData.focus_areas || [],
        p_requested_coach_id: validatedData.requested_coach_id || null,
        p_is_team_plan: isTeamPlan,
        p_selected_team_id: validatedData.selected_team_id || null,
        p_session_booking_enabled: serviceData.enable_session_booking ?? false,
        p_weekly_session_limit: serviceData.default_weekly_session_limit ?? null,
        p_session_duration_minutes: serviceData.default_session_duration_minutes ?? null,
      });

    if (assignmentError || !assignmentResult) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "assign_coach_atomic", ok: false, error: "db_error", ...dbErrDetails(assignmentError) }));
      return new Response(
        JSON.stringify({ error: 'Failed to create subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const coachUserId: string | null = assignmentResult.coach_user_id ?? null;
    const wasAutoAssigned: boolean = assignmentResult.was_auto_assigned === true;
    const coachAssignmentMethod: string = assignmentResult.coach_assignment_method ?? 'auto';
    const needsCoachAssignment: boolean = assignmentResult.needs_coach_assignment === true;
    const subscription = { id: assignmentResult.subscription_id as string };

    if (needsCoachAssignment) {
      console.warn(JSON.stringify({ fn: "submit-onboarding", step: "needs_manual_assignment", ok: false, user_id: user.id, service: validatedData.plan_name, is_team_plan: isTeamPlan }));
    }
    console.log(JSON.stringify({ fn: "submit-onboarding", step: "create_subscription", ok: true, subscription_id: subscription.id, coach_user_id: coachUserId, auto_assigned: wasAutoAssigned, method: coachAssignmentMethod }));

    console.log(JSON.stringify({ fn: "submit-onboarding", step: "submission_complete", ok: true, user_id: user.id, status: newStatus }));

    // ============================
    // EMAIL NOTIFICATIONS (NON-BLOCKING)
    // ============================
    const logEmail = async (userId: string, notificationType: string, status: string) => {
      try {
        await supabaseServiceRole
          .from('email_notifications')
          .insert({
            user_id: userId,
            notification_type: notificationType,
            status,
            sent_at: new Date().toISOString()
          });
      } catch (logError) {
        console.error(JSON.stringify({ fn: "submit-onboarding", step: "log_email_notification", ok: false, error: "db_error" }));
      }
    };
    
    // FLOW 2: MEDICAL REVIEW REQUIRED - notify client
    if (needs_medical_review) {
      try {
        const medicalReviewContent = [
          greeting(validatedData.first_name),
          paragraph(`Thank you for completing your application for <strong>${validatedData.plan_name}</strong>. Based on your PAR-Q responses, we need to conduct a medical review to ensure your safety and success with our program.`),
          alertBox('<strong>Medical Review Required</strong><br>Our team will review your PAR-Q responses to ensure your safety before proceeding.', 'warning'),
          paragraph('<strong>What happens next:</strong>'),
          orderedList([
            'Our team will review your application and PAR-Q responses',
            'We may reach out for additional information if needed',
            'We\'ll either clear you to proceed or advise you to consult your physician',
            'You\'ll receive an email once the review is complete',
          ]),
          paragraph('This process typically takes 1-2 business days. You can check your application status anytime on your dashboard.'),
          ctaButton('Check Application Status', `${APP_BASE_URL}/dashboard`),
          signOff(),
        ].join('');

        const medicalReviewHtml = wrapInLayout({
          content: medicalReviewContent,
          preheader: 'Your application is under medical review -- we will be in touch shortly.',
        });

        const result = await sendEmail({
          from: EMAIL_FROM_COACHING,
          to: validatedData.email,
          subject: 'Your Application is Under Medical Review',
          html: medicalReviewHtml,
        });

        if (result.success) {
          await logEmail(user.id, 'medical_review_required', 'sent');
        } else {
          await logEmail(user.id, 'medical_review_required', 'failed');
        }
        console.log(JSON.stringify({ fn: "submit-onboarding", step: "email_medical_review_client", ok: true }));
      } catch (emailError) {
        console.error(JSON.stringify({ fn: "submit-onboarding", step: "email_medical_review_client", ok: false, error: "send_failed" }));
        await logEmail(user.id, 'medical_review_required', 'failed');
      }

      // Send notification to admin
      try {
        await supabaseServiceRole.functions.invoke('send-medical-review-notification', {
          body: {
            userId: user.id,
            firstName: validatedData.first_name,
            lastName: validatedData.last_name,
            email: validatedData.email,
            planName: validatedData.plan_name,
          },
        });
        console.log(JSON.stringify({ fn: "submit-onboarding", step: "email_medical_review_admin", ok: true }));
      } catch (emailError) {
        console.error(JSON.stringify({ fn: "submit-onboarding", step: "email_medical_review_admin", ok: false, error: "send_failed" }));
      }
    }
    
    // FLOW 1: 1:1 APPLICATION RECEIVED - notify client
    if (isOneToOne && !needs_medical_review && newStatus === 'pending_coach_approval') {
      try {
        const applicationReceivedContent = [
          greeting(validatedData.first_name),
          paragraph(`Thank you for applying for <strong>${validatedData.plan_name}</strong>! We've received your application and it's now with your assigned coach for review.`),
          alertBox('<strong>Application Submitted Successfully</strong><br>Your coach will review your application and reach out shortly.', 'success'),
          paragraph('<strong>What\'s next:</strong>'),
          orderedList([
            'Your coach will review your application and training goals',
            'They may reach out if they need any clarifications',
            'Once approved, you\'ll receive an email to complete payment',
            'After payment, your coach will get you started on your program',
          ]),
          paragraph('You can check your application status anytime on your dashboard.'),
          ctaButton('Check Application Status', `${APP_BASE_URL}/dashboard`),
          signOff(),
        ].join('');

        const applicationReceivedHtml = wrapInLayout({
          content: applicationReceivedContent,
          preheader: 'Your coaching application has been received -- your coach will review it shortly.',
        });

        const result = await sendEmail({
          from: EMAIL_FROM_COACHING,
          to: validatedData.email,
          subject: 'We\'ve Received Your Coaching Application',
          html: applicationReceivedHtml,
        });

        if (result.success) {
          await logEmail(user.id, 'onboarding_received', 'sent');
        } else {
          await logEmail(user.id, 'onboarding_received', 'failed');
        }
        console.log(JSON.stringify({ fn: "submit-onboarding", step: "email_application_received", ok: true }));
      } catch (emailError) {
        console.error(JSON.stringify({ fn: "submit-onboarding", step: "email_application_received", ok: false, error: "send_failed" }));
        await logEmail(user.id, 'onboarding_received', 'failed');
      }
    }
    
    // FLOW 4: Send notification to coach for 1:1 plans
    if (isOneToOne && coachUserId && subscription && newStatus === 'pending_coach_approval') {
      try {
        // Get coach first_name from coaches_public (canonical home post
        // column-ownership refactor). We need coaches.id only for the
        // legacy notification API; query both.
        const [{ data: coachRow }, { data: profileData }] = await Promise.all([
          supabaseServiceRole.from('coaches').select('id').eq('user_id', coachUserId).maybeSingle(),
          supabaseServiceRole.from('coaches_public').select('first_name, last_name').eq('user_id', coachUserId).maybeSingle(),
        ]);

        if (profileData) {
          // Get coach email from coaches_private. Key flipped from
          // coach_public_id → user_id (D4 refactor drops the FK in Phase 3).
          const { data: contactData } = await supabaseServiceRole
            .from('coaches_private')
            .select('email')
            .eq('user_id', coachUserId)
            .maybeSingle();

          if (contactData?.email) {
            await supabaseServiceRole.functions.invoke('send-pending-client-notification', {
              body: {
                coachUserId,
                coachEmail: contactData.email,
                coachFirstName: profileData.first_name,
                clientFirstName: validatedData.first_name,
                clientLastName: validatedData.last_name,
                clientEmail: validatedData.email,
                serviceName: validatedData.plan_name,
              },
            });
            console.log(JSON.stringify({ fn: "submit-onboarding", step: "email_pending_client_to_coach", ok: true }));
          } else {
            console.warn(JSON.stringify({ fn: "submit-onboarding", step: "email_pending_client_to_coach", ok: false, error: "coach_email_not_found" }));
          }
        }
      } catch (emailError) {
        console.error(JSON.stringify({ fn: "submit-onboarding", step: "email_pending_client_to_coach", ok: false, error: "send_failed" }));
      }
    }

    // FLOW 5: Send welcome email to ALL clients (always)
    try {
      await supabaseServiceRole.functions.invoke('send-welcome-email', {
        body: {
          email: validatedData.email,
          firstName: validatedData.first_name,
          planName: validatedData.plan_name,
          status: newStatus,
        },
      });
      console.log(JSON.stringify({ fn: "submit-onboarding", step: "email_welcome", ok: true }));
    } catch (emailError) {
      console.error(JSON.stringify({ fn: "submit-onboarding", step: "email_welcome", ok: false, error: "send_failed" }));
    }

    return new Response(
      JSON.stringify({
        success: true,
        submission_id: submission.id,
        needs_medical_review,
        status: newStatus,
        was_auto_assigned: wasAutoAssigned,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error(JSON.stringify({ fn: "submit-onboarding", step: "unhandled", ok: false, error: "unexpected_error", message: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : null }));
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
