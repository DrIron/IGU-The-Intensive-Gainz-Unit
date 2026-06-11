import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Admin path: full personal details required (mirrors the admin dialog).
const manualClientSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  phoneNumber: z.string().min(8).max(20).trim(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  serviceId: z.string().uuid(),
});

// Head-coach path: lighter (no phone/DOB/gender) + a mandatory reason.
// The client fills the rest of their profile when they use the app.
const headCoachSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  serviceId: z.string().uuid(),
  reason: z.string().min(3, "Please give a short reason").max(500).trim(),
});

// Fallback cap when coaches_public.max_exempt_clients is NULL.
const DEFAULT_EXEMPT_CAP = 5;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, 5, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Auth: caller must be an admin OR a head coach.
    const authHeader = req.headers.get('Authorization')?.replace('Bearer ', '');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(authHeader);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve caller roles. Destructure { error } per CLAUDE.md so a silent
    // role-fetch failure doesn't falsely reject a legitimate caller.
    const { data: roleRows, error: roleErr } = await supabaseAdmin
      .from('user_roles').select('role').eq('user_id', caller.id);
    if (roleErr) throw roleErr;
    const roleList = (roleRows ?? []).map((r: any) => r.role as string);
    const isAdmin = roleList.includes('admin');

    // Head-coach branch: a coach flagged is_head_coach may self-create payment-
    // exempt "test drive" clients (assigned to themselves, capped, reason
    // required, surfaced in the admin daily summary). Any service type allowed.
    let isHeadCoach = false;
    let maxExemptClients: number | null = null;
    if (!isAdmin) {
      const { data: cp, error: cpErr } = await supabaseAdmin
        .from('coaches_public')
        .select('is_head_coach, max_exempt_clients')
        .eq('user_id', caller.id)
        .maybeSingle();
      if (cpErr) throw cpErr;
      isHeadCoach = roleList.includes('coach') && (cp?.is_head_coach ?? false);
      maxExemptClients = cp?.max_exempt_clients ?? null;
    }

    if (!isAdmin && !isHeadCoach) {
      return new Response(JSON.stringify({ error: 'Admin or head coach role required' }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const actorType: 'admin' | 'head_coach' = isAdmin ? 'admin' : 'head_coach';

    const body = await req.json();
    const validated = actorType === 'admin'
      ? manualClientSchema.parse(body)
      : headCoachSchema.parse(body);
    const { email, firstName, lastName, serviceId } = validated as {
      email: string; firstName: string; lastName: string; serviceId: string;
    };
    const phoneNumber = (validated as { phoneNumber?: string }).phoneNumber;
    const dateOfBirth = (validated as { dateOfBirth?: string }).dateOfBirth;
    const gender = (validated as { gender?: string }).gender;
    const reason = (validated as { reason?: string }).reason;

    // Verify serviceId exists and is active
    const { data: service, error: serviceError } = await supabaseAdmin
      .from('services')
      .select('id')
      .eq('id', serviceId)
      .eq('is_active', true)
      .maybeSingle();

    if (serviceError || !service) {
      throw new Error('Invalid or inactive service selected');
    }

    // Try to create the user first (fast path). If email already exists,
    // fall back to a quick DB lookup. Avoids expensive paginated listUsers scan.
    let userId: string | null = null;

    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
      },
    });

    if (!authError && authData?.user) {
      userId = authData.user.id;
      console.log(JSON.stringify({ fn: "create-manual-client", step: "user_created", ok: true, user_id: userId }));
    } else {
      // User likely already exists — look up by email via fast DB queries
      console.log(JSON.stringify({ fn: "create-manual-client", step: "create_user_failed", ok: false, error: authError?.message }));

      // 1) Check profiles view (joins profiles_public + profiles_private)
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      if (existingProfile?.id) {
        userId = existingProfile.id;
        console.log(JSON.stringify({ fn: "create-manual-client", step: "user_exists_profile", ok: true, user_id: userId }));
      }

      // 2) Check profiles_private directly (profiles view may fail if profiles_public was deleted)
      if (!userId) {
        const { data: existingPrivate } = await supabaseAdmin
          .from('profiles_private')
          .select('profile_id')
          .ilike('email', email)
          .maybeSingle();
        if (existingPrivate?.profile_id) {
          userId = existingPrivate.profile_id;
          console.log(JSON.stringify({ fn: "create-manual-client", step: "user_exists_private", ok: true, user_id: userId }));
        }
      }

      // 3) Check coaches_private (email lives on coaches_private, not coaches —
      //    coaches.email does not exist; original query was a silent bug)
      if (!userId) {
        const { data: coachUser } = await supabaseAdmin
          .from('coaches_private')
          .select('user_id')
          .ilike('email', email)
          .maybeSingle();
        if (coachUser?.user_id) {
          userId = coachUser.user_id;
          console.log(JSON.stringify({ fn: "create-manual-client", step: "user_exists_coach", ok: true, user_id: userId }));
        }
      }

      // 4) Try generateLink recovery — works for existing confirmed users
      // and returns the user object (unlike inviteUserByEmail which fails for confirmed users)
      if (!userId) {
        try {
          const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: 'recovery',
            email,
            options: { redirectTo: 'https://theigu.com/reset-password' },
          });
          if (!linkErr && linkData?.user?.id) {
            userId = linkData.user.id;
            console.log(JSON.stringify({ fn: "create-manual-client", step: "recovery_generate_link", ok: true, user_id: userId }));
          }
        } catch (_e) {
          // ignore
        }
      }

      // 5) Last resort: invite by email (creates user if not present)
      if (!userId) {
        try {
          const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
            email,
            { redirectTo: 'https://theigu.com/reset-password', data: { first_name: firstName, last_name: lastName } }
          );
          if (!inviteError && inviteData?.user?.id) {
            userId = inviteData.user.id;
            console.log(JSON.stringify({ fn: "create-manual-client", step: "recovery_invite", ok: true, user_id: userId }));
          }
        } catch (_e) {
          // ignore
        }
      }

      if (!userId) {
        throw new Error(authError?.message || 'Failed to create or find user');
      }
    }

    // Ensure profile exists and update details (write to profiles_public and profiles_private)
    const { error: profilePublicError } = await supabaseAdmin
      .from("profiles_public")
      .upsert(
        { 
          id: userId!,
          first_name: firstName,
          display_name: `${firstName} ${lastName}`,
          payment_exempt: true, // Manually created clients are exempt from payment
          status: 'pending',
        },
        { onConflict: 'id' }
      );
    
    if (profilePublicError) {
      console.error(JSON.stringify({ fn: "create-manual-client", step: "upsert_profiles_public", ok: false, error: profilePublicError.message }));
      throw profilePublicError;
    }

    const { error: profilePrivateError } = await supabaseAdmin
      .from("profiles_private")
      .upsert(
        { 
          profile_id: userId!,
          email,
          full_name: `${firstName} ${lastName}`,
          last_name: lastName,
          phone: phoneNumber,
          date_of_birth: dateOfBirth,
          gender: gender,
        },
        { onConflict: 'profile_id' }
      );
    
    if (profilePrivateError) {
      console.error(JSON.stringify({ fn: "create-manual-client", step: "upsert_profiles_private", ok: false, error: profilePrivateError.message }));
      throw profilePrivateError;
    }

    // Resolve the coach to assign.
    //  - Head coach: assign the client to themselves.
    //  - Admin: assign the IGU admin coach account (existing behavior).
    let coachId: string | null = null;
    if (actorType === 'head_coach') {
      coachId = caller.id;
    } else {
      // Find the IGU admin coach account. Email lives on coaches_private (moved
      // from coaches.email by 20260117164058 PII split); user_id joins to
      // coaches_public for the status check. This function runs as service role
      // so RLS on coaches_private is bypassed.
      const { data: privateRow, error: privateErr } = await supabaseAdmin
        .from("coaches_private")
        .select("user_id")
        .eq("email", "dr.ironofficial@gmail.com")
        .maybeSingle();

      if (privateErr) {
        console.error(JSON.stringify({ fn: "create-manual-client", step: "find_admin_coach_private", ok: false, error: "query_failed" }));
      }

      if (privateRow?.user_id) {
        const { data: publicRow, error: publicErr } = await supabaseAdmin
          .from("coaches_public")
          .select("user_id, status")
          .eq("user_id", privateRow.user_id)
          .maybeSingle();
        if (publicErr) {
          console.error(JSON.stringify({ fn: "create-manual-client", step: "find_admin_coach_public", ok: false, error: "query_failed" }));
        }
        if (publicRow?.status === "approved") {
          coachId = publicRow.user_id;
        }
      }
    }
    console.log(JSON.stringify({ fn: "create-manual-client", step: "assign_coach", ok: true, coach_id: coachId, actor: actorType }));

    // Ensure profiles_legacy row exists (FK required by subscriptions table)
    const { error: legacyError } = await supabaseAdmin
      .from("profiles_legacy")
      .upsert(
        { id: userId!, email },
        { onConflict: 'id' }
      );

    if (legacyError) {
      console.error(JSON.stringify({ fn: "create-manual-client", step: "upsert_profiles_legacy", ok: false, error: legacyError.message }));
      throw legacyError;
    }

    // Create active subscription (no payment needed for manual clients)
    // Idempotency: skip if an active/pending subscription for same service
    // already exists. Use limit(1) -- legacy data may have two rows in this
    // status set, which would 406 a bare maybeSingle() and break idempotency.
    const { data: existingSubs, error: existingSubErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id,status')
      .eq('user_id', userId)
      .eq('service_id', serviceId)
      .in('status', ['active', 'pending'])
      .limit(1);

    if (existingSubErr) {
      console.error(JSON.stringify({ fn: "create-manual-client", step: "check_existing_sub", ok: false, error: existingSubErr.message }));
      throw existingSubErr;
    }

    const existingSub = existingSubs && existingSubs.length > 0 ? existingSubs[0] : null;

    if (!existingSub) {
      // Head-coach cap: block once the coach hits their active-exempt limit.
      // Fail closed on count error so a transient DB issue can't bypass the cap.
      if (actorType === 'head_coach') {
        const cap = maxExemptClients ?? DEFAULT_EXEMPT_CAP;
        const { data: currentCount, error: countErr } = await supabaseAdmin
          .rpc('count_active_exempt_clients_for_coach', { p_coach_id: caller.id });
        if (countErr) {
          console.error(JSON.stringify({ fn: "create-manual-client", step: "exempt_cap_count", ok: false, error: countErr.message }));
          throw new Error('Unable to verify your payment-exempt client limit. Please try again.');
        }
        if ((currentCount ?? 0) >= cap) {
          return new Response(
            JSON.stringify({ success: false, error: `You've reached your payment-exempt client limit (${cap}). Contact an admin to raise it.` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
      }

      const { error: subError } = await supabaseAdmin
        .from("subscriptions")
        .insert({
          user_id: userId,
          service_id: serviceId,
          status: "active", // Set to active immediately
          start_date: new Date().toISOString(),
          coach_id: coachId,
          // Head-coach exempt adds: record who waived payment and why (audit +
          // daily-summary source). Admin path leaves these null.
          ...(actorType === 'head_coach'
            ? { activation_override_by: caller.id, activation_override_reason: reason }
            : {}),
        });

      if (subError) {
        console.error(JSON.stringify({ fn: "create-manual-client", step: "create_subscription", ok: false, error: "insert_failed" }));
        throw subError;
      }
    } else {
      console.log(JSON.stringify({ fn: "create-manual-client", step: "subscription_exists", ok: true }));
    }

    // Update profile status to active (write to profiles_public)
    const { error: statusError } = await supabaseAdmin
      .from("profiles_public")
      .update({ status: "active" })
      .eq("id", userId);

    if (statusError) {
      console.error(JSON.stringify({ fn: "create-manual-client", step: "update_status", ok: false, error: statusError.message }));
      throw statusError;
    }

    // Generate password reset link
    let passwordResetLink = null;
    try {
      const redirectTo = 'https://theigu.com/reset-password';
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });
      if (linkError) throw linkError;
      passwordResetLink = linkData?.properties?.action_link || null;
      console.log(JSON.stringify({ fn: "create-manual-client", step: "password_reset_link", ok: true }));
    } catch (linkError) {
      console.error(JSON.stringify({ fn: "create-manual-client", step: "password_reset_link", ok: false, error: "link_gen_failed" }));
    }

    // Send signup confirmation email with password setup link
    if (passwordResetLink) {
      try {
        await supabaseAdmin.functions.invoke('send-signup-confirmation', {
          body: {
            email,
            name: `${firstName} ${lastName}`,
            passwordResetLink,
            isManualClient: true,
          },
        });
        console.log(JSON.stringify({ fn: "create-manual-client", step: "signup_email", ok: true }));
      } catch (emailError) {
        console.error(JSON.stringify({ fn: "create-manual-client", step: "signup_email", ok: false, error: "send_failed" }));
        // Don't fail the whole operation if email fails
      }
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error: any) {
    console.error(JSON.stringify({ fn: "create-manual-client", step: "fatal", ok: false, error: "unhandled_exception" }));
    
    // Check if it's a validation error
    if (error.name === 'ZodError') {
      const firstError = error.errors?.[0];
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: firstError?.message || 'Invalid input data' 
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }
    
    return new Response(
      JSON.stringify({ success: false, error: error.message || 'Failed to create manual client' }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400 
      }
    );
  }
});