import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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
  discord_username: z.string().max(100).trim().optional(),
  plan_name: z.string().min(1).max(100),
  focus_areas: z.array(z.string().max(50)).optional(),
  heard_about_us: z.string().min(1).max(100),
  heard_about_us_other: z.string().max(500).optional(),
  // Coach preference fields (1:1 plans only)
  coach_preference_type: z.enum(['auto', 'specific']).default('auto'),
  requested_coach_id: z.string().uuid().nullable().optional(),
});

// Conditional validations based on selected plan
const schema = formSchema.superRefine((data, ctx) => {
  const isOneToOne = data.plan_name === '1:1 Online' || data.plan_name === '1:1 In-Person' || data.plan_name === '1:1 Hybrid';
  const isTeam = data.plan_name === 'Fe Squad' || data.plan_name === 'Bunz of Steel';

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

// Helper function to calculate specialization match score based on focus_areas
function calculateFocusAreasMatchScore(coachSpecializations: string[] | null, clientFocusAreas: string[]): number {
  if (!coachSpecializations || coachSpecializations.length === 0 || !clientFocusAreas || clientFocusAreas.length === 0) {
    return 0;
  }
  
  // Normalize both arrays to lowercase for comparison
  const normalizedCoachSpecs = coachSpecializations.map(s => s.toLowerCase().trim());
  const normalizedFocusAreas = clientFocusAreas.map(f => f.toLowerCase().trim());
  
  // Count matching items
  let matches = 0;
  for (const focusArea of normalizedFocusAreas) {
    if (normalizedCoachSpecs.includes(focusArea)) {
      matches++;
    }
  }
  
  return matches;
}

// Helper function to find the best coach for a client
interface CoachCandidate {
  user_id: string;
  coach_id: string;
  first_name: string;
  last_name: string;
  specializations: string[] | null;
  created_at: string;
  last_assigned_at: string | null;
  active_client_count: number;
  score: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Missing Supabase configuration');
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
      console.error('Authentication error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // SECURITY: Check user roles - admins and coaches cannot sign up for services
    const { data: userRoles, error: rolesError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (rolesError) {
      console.error('Error checking user roles:', rolesError);
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
      console.error('Error checking active subscriptions:', subscriptionError);
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
      console.error('Error deleting existing roles:', roleDeleteError);
    }

    // Parse and validate request body
    const body = await req.json();
    
    let validatedData;
    try {
      validatedData = schema.parse(body);
    } catch (validationError) {
      console.error('Validation error:', validationError);
      return new Response(
        JSON.stringify({ 
          error: 'Invalid input data',
          details: validationError instanceof z.ZodError ? validationError.errors : 'Validation failed'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    const isTeamPlan = validatedData.plan_name === 'Fe Squad' || validatedData.plan_name === 'Bunz of Steel';
    let mappedExp = validatedData.training_experience ? (expMap[validatedData.training_experience] || validatedData.training_experience) : undefined;
    if (isTeamPlan && !mappedExp) mappedExp = 'beginner_0_6';

    const mappedNutrition = validatedData.nutrition_approach === 'macros_and_calories'
      ? 'macros_calories'
      : validatedData.nutrition_approach;

    // Note: preferred_coach_id selection has been removed from UI.
    // Coach assignment is now handled automatically based on focus_areas.

    // Capture the current timestamp for legal agreements
    const agreementTimestamp = new Date().toISOString();

  const insertPayload: any = {
    user_id: user.id,
    form_type: mappedFormType,
    ...validatedData,
    heard_about_us: mappedHeard,
    training_experience: mappedExp,
    nutrition_approach: mappedNutrition,
    needs_medical_review,
    focus_areas: validatedData.focus_areas || [],
    // Coach preference fields
    coach_preference_type: validatedData.coach_preference_type || 'auto',
    requested_coach_id: validatedData.requested_coach_id || null,
    // Add timestamps for legal agreement acceptances
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
      console.error('Error creating form submission:', submissionError);
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

    const { error: profilePublicError } = await supabase
      .from('profiles_public')
      .update(profilePublicUpdate)
      .eq('id', user.id);

    if (profilePublicError) {
      console.error('Error updating profiles_public:', profilePublicError);
      return new Response(
        JSON.stringify({ error: 'Failed to update profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
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
    const { error: profilePrivateError } = await supabase
      .from('profiles_private')
      .update(profilePrivateUpdate)
      .eq('profile_id', user.id);

    if (profilePrivateError) {
      console.error('Error updating profiles_private:', profilePrivateError);
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
      console.error('Error finding service:', serviceError);
      return new Response(
        JSON.stringify({ error: 'Service not found for the selected plan' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // ============================================
    // COACH ASSIGNMENT LOGIC
    // ============================================
    let coachUserId: string | undefined = undefined;
    let wasAutoAssigned = false;
    // Note: preferred_coach_id is no longer collected - coach assignment is now automatic based on focus_areas
    const currentServiceId = serviceData.id; // Capture for use in nested functions

    // For team plans, always assign to admin
    if (isTeamPlan) {
      const { data: adminRole } = await supabaseServiceRole
        .from('user_roles')
        .select('user_id')
        .eq('role', 'admin')
        .limit(1)
        .maybeSingle();
      if (adminRole?.user_id) {
        coachUserId = adminRole.user_id;
      }
    } else {
      // For 1:1 plans, check coach preference
      const coachPreferenceType = validatedData.coach_preference_type || 'auto';
      const requestedCoachId = validatedData.requested_coach_id; // This is the coach.id from coaches table
      
      // If user selected a specific coach, validate and use that coach
      if (coachPreferenceType === 'specific' && requestedCoachId) {
        console.log('User requested specific coach:', requestedCoachId);
        
        // Get the coach's user_id from the coaches table
        const { data: requestedCoach, error: coachError } = await supabaseServiceRole
          .from('coaches')
          .select('user_id, first_name, last_name, status')
          .eq('id', requestedCoachId)
          .maybeSingle();
        
        if (coachError || !requestedCoach) {
          console.warn('Requested coach not found:', requestedCoachId, coachError);
        } else if (requestedCoach.status !== 'active') {
          console.warn('Requested coach is not active:', requestedCoach.status);
        } else {
          // Check if coach has capacity
          const capacityCheck = await checkCoachCapacity(requestedCoachId, requestedCoach.user_id);
          
          if (capacityCheck.hasCapacity) {
            coachUserId = requestedCoach.user_id;
            console.log(`Assigned to requested coach: ${requestedCoach.first_name} ${requestedCoach.last_name}`);
          } else {
            console.warn(`Requested coach ${requestedCoach.first_name} is at capacity (${capacityCheck.activeCount}/${capacityCheck.maxClients}). Falling back to auto-assignment.`);
          }
        }
      }
      
      // For 1:1 plans, use smart coach matching based on:
      // 1. focus_areas <-> coach.specializations matching
      // 2. Coach capacity for this specific service
      // 3. Current client load (prefer coaches with fewer clients)
      const clientFocusAreas: string[] = validatedData.focus_areas || [];
      // Helper function to check if a coach has capacity for this service
      async function checkCoachCapacity(coachId: string, coachUserId: string): Promise<{ hasCapacity: boolean; activeCount: number; maxClients: number }> {
        // Get the coach's limit for this specific service
        const { data: limitData } = await supabaseServiceRole
          .from('coach_service_limits')
          .select('max_clients')
          .eq('coach_id', coachId)
          .eq('service_id', currentServiceId)
          .maybeSingle();
        
        if (!limitData) {
          // No limit set for this service = no capacity for this service
          return { hasCapacity: false, activeCount: 0, maxClients: 0 };
        }
        
        // Count current subscriptions for this coach + service
        // Include: pending, active (represents real current load)
        // Exclude: inactive, cancelled, expired
        const { count } = await supabaseServiceRole
          .from('subscriptions')
          .select('*', { count: 'exact', head: true })
          .eq('coach_id', coachUserId)
          .eq('service_id', currentServiceId)
          .in('status', ['pending', 'active']);
        
        const currentCount = count || 0;
        return {
          hasCapacity: currentCount < limitData.max_clients,
          activeCount: currentCount,
          maxClients: limitData.max_clients
        };
      }
      
      // Note: Preferred coach selection has been removed from UI.
      // All 1:1 clients are now auto-assigned based on capacity and focus areas.
      
      // Step 2: If no coach assigned yet (no preference or preferred was full), do smart auto-assignment
      if (!coachUserId) {
        wasAutoAssigned = true;
        
        // Get all active/approved coaches with their service limits for this service
        const { data: coachLimits } = await supabaseServiceRole
          .from('coach_service_limits')
          .select(`
            max_clients,
            coaches!inner(id, user_id, first_name, last_name, specializations, status, created_at, last_assigned_at)
          `)
          .eq('service_id', serviceData.id);
        
        if (!coachLimits || coachLimits.length === 0) {
          console.error('No coaches have service limits configured for this service. Cannot assign coach.');
        } else {
          // Build candidate list with capacity and scoring
          const candidates: CoachCandidate[] = [];
          
          for (const limit of coachLimits) {
            const coach = limit.coaches as any;
            
            // Only consider active or approved coaches
            if (coach.status !== 'active' && coach.status !== 'approved') {
              continue;
            }
            
            // Count current subscriptions for this coach + service
            // Include: pending, active (represents real current load)
            // Exclude: inactive, cancelled, expired
            const { count } = await supabaseServiceRole
              .from('subscriptions')
              .select('*', { count: 'exact', head: true })
              .eq('coach_id', coach.user_id)
              .eq('service_id', serviceData.id)
              .in('status', ['pending', 'active']);
            
            const currentCount = count || 0;
            
            // Skip if at capacity
            if (currentCount >= limit.max_clients) {
              console.log(`Coach ${coach.user_id} at capacity for service ${serviceData.id} (${currentCount}/${limit.max_clients})`);
              continue;
            }
            
            // Calculate score: specialization_matches * 10 - current_client_count
            // This prioritizes coaches with matching specializations, while preferring less loaded coaches
            const specializationMatches = calculateFocusAreasMatchScore(coach.specializations, clientFocusAreas);
            const score = (specializationMatches * 10) - currentCount;
            
            candidates.push({
              user_id: coach.user_id,
              coach_id: coach.id,
              first_name: coach.first_name,
              last_name: coach.last_name,
              specializations: coach.specializations,
              created_at: coach.created_at,
              last_assigned_at: coach.last_assigned_at,
              active_client_count: currentCount,
              score
            });
            
            console.log(`Candidate: ${coach.first_name} ${coach.last_name} - Score: ${score} (focusMatches: ${specializationMatches}, clients: ${currentCount}, specs: ${JSON.stringify(coach.specializations)})`);
          }
          
          if (candidates.length === 0) {
            console.warn(`No coaches with available capacity found for service_id ${serviceData.id}. Subscription will have coach_id = null.`);
          } else {
            // Sort by: score DESC, active_client_count ASC, last_assigned_at ASC (oldest first for round-robin)
            candidates.sort((a, b) => {
              if (b.score !== a.score) return b.score - a.score;
              if (a.active_client_count !== b.active_client_count) return a.active_client_count - b.active_client_count;
              // Round-robin tie-breaker: prefer coach who was assigned longest ago (null = never assigned = highest priority)
              const aTime = a.last_assigned_at ? new Date(a.last_assigned_at).getTime() : 0;
              const bTime = b.last_assigned_at ? new Date(b.last_assigned_at).getTime() : 0;
              return aTime - bTime;
            });
            
            const selectedCoach = candidates[0];
            coachUserId = selectedCoach.user_id;
            console.log(`Auto-assigned to coach: ${selectedCoach.first_name} ${selectedCoach.last_name} (score: ${selectedCoach.score}, clients: ${selectedCoach.active_client_count}, lastAssigned: ${selectedCoach.last_assigned_at})`);
          }
        }
      }
    }
    
    // Determine the coach assignment method based on how we got here
    // This helps admin understand how the coach was assigned
    let coachAssignmentMethod: 'auto' | 'preference' | 'manual' = 'auto';
    let needsCoachAssignment = false;
    
    if (!isTeamPlan) {
      const coachPreferenceType = validatedData.coach_preference_type || 'auto';
      if (coachPreferenceType === 'specific' && coachUserId && validatedData.requested_coach_id) {
        coachAssignmentMethod = 'preference';
      } else if (wasAutoAssigned) {
        coachAssignmentMethod = 'auto';
      }
      
      // Flag if no coach could be assigned (needs manual intervention)
      if (!coachUserId && !isTeamPlan) {
        needsCoachAssignment = true;
        console.warn(`[NEEDS_MANUAL_ASSIGNMENT] No coach could be assigned for user ${user.id}. Service: ${validatedData.plan_name}`);
      }
    }
    
    // Create the subscription row with status = 'pending'
    // Copy session booking settings from service if enabled
    const subscriptionInsert: Record<string, unknown> = {
      user_id: user.id,
      service_id: serviceData.id,
      coach_id: coachUserId || null,
      status: 'pending',
      coach_assignment_method: coachAssignmentMethod,
      needs_coach_assignment: needsCoachAssignment,
    };
    
    // If service has session booking enabled, copy settings to subscription
    if (serviceData.enable_session_booking) {
      subscriptionInsert.session_booking_enabled = true;
      subscriptionInsert.weekly_session_limit = serviceData.default_weekly_session_limit;
      subscriptionInsert.session_duration_minutes = serviceData.default_session_duration_minutes;
    }
    
    const { data: subscription, error: subscriptionCreateError } = await supabase
      .from('subscriptions')
      .insert(subscriptionInsert)
      .select()
      .single();
    
    if (subscriptionCreateError) {
      console.error('Error creating subscription:', subscriptionCreateError);
      return new Response(
        JSON.stringify({ error: 'Failed to create subscription' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('Created subscription:', subscription.id, 'with coach:', coachUserId, 'and status: pending', wasAutoAssigned ? '(auto-assigned)' : '(preferred)');

    // Update coach's last_assigned_at for round-robin fairness tracking
    if (coachUserId && !isTeamPlan) {
      try {
        await supabaseServiceRole
          .from('coaches')
          .update({ last_assigned_at: new Date().toISOString() })
          .eq('user_id', coachUserId);
        console.log('Updated last_assigned_at for coach:', coachUserId);
      } catch (updateError) {
        console.error('Failed to update last_assigned_at (non-critical):', updateError);
      }
    }

    console.log('Form submission successful for user:', user.id, 'Status:', newStatus);

    // ============================
    // ZAPIER NOTIFICATION (NON-BLOCKING)
    // ============================
    try {
      // Fetch coach email if available
      let coachEmail: string | null = null;
      if (coachUserId) {
        const { data: coachData } = await supabaseServiceRole
          .from('coaches')
          .select('email')
          .eq('user_id', coachUserId)
          .maybeSingle();
        coachEmail = coachData?.email ?? null;
      }
      
      await supabaseServiceRole.functions.invoke('notify-zapier', {
        body: {
          event_type: 'onboarding_submitted',
          user_id: user.id,
          profile_id: user.id,
          profile_email: validatedData.email,
          profile_status: newStatus,
          subscription_id: subscription.id,
          subscription_status: subscription.status,
          service_id: serviceData.id,
          service_name: validatedData.plan_name,
          coach_id: coachUserId ?? null,
          coach_email: coachEmail,
          notes: 'New onboarding submitted',
          metadata: {
            form_type: mappedFormType,
            plan_type: serviceData.type,
            needs_medical_review,
            was_auto_assigned: wasAutoAssigned,
          },
        },
      });
      console.log('Zapier notification sent for onboarding_submitted');
    } catch (zapierError) {
      console.error('Zapier notification failed (non-critical):', zapierError);
    }

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
        console.error('Failed to log email notification:', logError);
      }
    };
    
    // FLOW 2: MEDICAL REVIEW REQUIRED - notify client
    if (needs_medical_review) {
      try {
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Dr Iron <noreply@mail.theigu.com>',
              to: [validatedData.email],
              subject: '[Dr Iron Coaching] Your application is under medical review',
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Your Application is Under Medical Review</h1>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    Hi ${validatedData.first_name},
                  </p>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    Thank you for completing your application for <strong>${validatedData.plan_name}</strong>. Based on your PAR-Q responses, we need to conduct a medical review to ensure your safety and success with our program.
                  </p>
                  
                  <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 30px 0; border-radius: 4px;">
                    <p style="color: #856404; font-size: 14px; margin: 0; line-height: 1.6;">
                      <strong>What happens next:</strong><br>
                      • Our team will review your application and PAR-Q responses<br>
                      • We may reach out for additional information if needed<br>
                      • We'll either clear you to proceed or advise you to consult your physician<br>
                      • You'll receive an email once the review is complete
                    </p>
                  </div>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    This process typically takes 1-2 business days. You can log in at <a href="https://theigu.com" style="color: #667eea;">https://theigu.com</a> to check your application status.
                  </p>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5;">
                    Best regards,<br>
                    <strong>Dr. Iron Team</strong>
                  </p>
                </div>
              `,
            }),
          });
          await logEmail(user.id, 'medical_review_required', 'sent');
        }
        console.log('Sent medical review notification to client');
      } catch (emailError) {
        console.error('Error sending medical review notification to client:', emailError);
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
        console.log('Sent medical review notification to admin');
      } catch (emailError) {
        console.error('Error sending medical review notification to admin:', emailError);
      }
    }
    
    // FLOW 1: 1:1 APPLICATION RECEIVED - notify client
    if (isOneToOne && !needs_medical_review && newStatus === 'pending_coach_approval') {
      try {
        const resendApiKey = Deno.env.get('RESEND_API_KEY');
        if (resendApiKey) {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${resendApiKey}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              from: 'Dr Iron <noreply@mail.theigu.com>',
              to: [validatedData.email],
              subject: '[Dr Iron Coaching] We\'ve received your 1:1 coaching application',
              html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                  <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Application Received!</h1>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    Hi ${validatedData.first_name},
                  </p>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    Thank you for applying for <strong>${validatedData.plan_name}</strong>! We've received your application and it's now with your assigned coach for review.
                  </p>
                  
                  <div style="background-color: #e8f4f8; border-left: 4px solid #4CAF50; padding: 20px; margin: 30px 0; border-radius: 4px;">
                    <p style="color: #1c5d7d; font-size: 14px; margin: 0; line-height: 1.6;">
                      <strong>What's next:</strong><br>
                      • Your coach will review your application and training goals<br>
                      • They may reach out if they need any clarifications<br>
                      • Once approved, you'll receive an email to complete payment<br>
                      • After payment, your coach will get you started on your program
                    </p>
                  </div>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5; margin-bottom: 20px;">
                    You can log in at <a href="https://theigu.com" style="color: #667eea;">https://theigu.com</a> anytime to check your application status.
                  </p>
                  
                  <p style="color: #666; font-size: 16px; line-height: 1.5;">
                    Best regards,<br>
                    <strong>Dr. Iron Team</strong>
                  </p>
                </div>
              `,
            }),
          });
          await logEmail(user.id, 'onboarding_received', 'sent');
        }
        console.log('Sent 1:1 application received notification to client');
      } catch (emailError) {
        console.error('Error sending application received notification:', emailError);
        await logEmail(user.id, 'onboarding_received', 'failed');
      }
    }
    
    // FLOW 4: Send notification to coach for 1:1 plans
    if (isOneToOne && coachUserId && subscription && newStatus === 'pending_coach_approval') {
      try {
        // Get coach basic info from coaches table
        const { data: coachData } = await supabaseServiceRole
          .from('coaches')
          .select('id, first_name, last_name')
          .eq('user_id', coachUserId)
          .maybeSingle();
        
        if (coachData) {
          // Get coach email from coaches_private table (server-side access)
          const { data: contactData } = await supabaseServiceRole
            .from('coaches_private')
            .select('email')
            .eq('coach_public_id', coachData.id)
            .maybeSingle();
          
          if (contactData?.email) {
            await supabaseServiceRole.functions.invoke('send-pending-client-notification', {
              body: {
                coachUserId,
                coachEmail: contactData.email,
                coachFirstName: coachData.first_name,
                clientFirstName: validatedData.first_name,
                clientLastName: validatedData.last_name,
                clientEmail: validatedData.email,
                serviceName: validatedData.plan_name,
              },
            });
            console.log('Sent pending client notification to coach');
          } else {
            console.warn('Coach email not found in coaches_private for coach:', coachData.id);
          }
        }
      } catch (emailError) {
        console.error('Error sending coach notification:', emailError);
      }
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
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
