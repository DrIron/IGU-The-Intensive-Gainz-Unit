import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const urlSchema = z.string().url().max(500).optional().or(z.literal(''));

const requestSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  first_name: z.string().min(1).max(50).trim(),
  last_name: z.string().min(1).max(50).trim(),
  date_of_birth: z.string().nullable().optional(),
  location: z.string().max(100).trim().optional(),
  nickname: z.string().max(50).trim().optional(),
  instagram_url: urlSchema,
  tiktok_url: urlSchema,
  snapchat_url: urlSchema,
  youtube_url: urlSchema,
  // Additional fields for coach applications
  applicationId: z.string().uuid().optional(),
  certifications: z.array(z.string().min(1).max(200)).max(20).optional(), // Max 20 certs, 200 chars each
  specializations: z.array(z.string().min(1).max(100)).max(15).optional(), // Max 15 specs, 100 chars each
  phoneNumber: z.string().max(20).trim().nullable().optional(),
  // Optional approved-on-create subroles (e.g. ["dietitian"], ["physiotherapist"]).
  // Generalises this function for admin "Add Dietitian" / "Add Physio" flows
  // without forking. Unknown slugs are silently skipped at the
  // subrole_definitions lookup; this validator is just an upper bound.
  subroles: z.array(z.string().min(1).max(50)).max(5).optional(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, 5, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAdmin = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    // Verify the JWT resolves to a real user
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Authorization: only admins can create coach accounts
    const { data: callerRoles } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', caller.id);
    const isAdmin = callerRoles?.some(r => r.role === 'admin');
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const validated = requestSchema.parse(body);
    const {
      email, first_name, last_name, date_of_birth, location, nickname,
      instagram_url, tiktok_url, snapchat_url, youtube_url,
      applicationId, certifications, specializations, phoneNumber,
      subroles,
    } = validated;

    // Check if user already exists in auth
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);

    let userId: string;
    let isNewUser = false;

    if (existingUser) {
      userId = existingUser.id;
      
      // SECURITY: Check if user already has admin role - preserve it!
      const { data: existingRoles, error: existingRolesError } = await supabaseAdmin
        .from('user_roles')
        .select('role')
        .eq('user_id', userId);

      if (existingRolesError) throw existingRolesError;

      const hasAdminRole = existingRoles?.some(r => r.role === 'admin');
      
      if (hasAdminRole) {
        console.log('User has admin role - preserving it');
        // Don't delete roles, just add coach role via upsert
      } else {
        // Safe to manage roles for non-admin users
        // Use upsert instead of delete to avoid race conditions
      }
      
    } else {
      // Create new auth user without password - they'll set it via recovery link
      const { data: newUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          first_name,
          last_name,
        }
      });

      if (authError) throw authError;
      if (!newUser.user) throw new Error('Failed to create user');
      
      userId = newUser.user.id;
      isNewUser = true;
    }

    // Add coach role (using upsert to avoid conflicts)
    const { error: roleError } = await supabaseAdmin
      .from('user_roles')
      .upsert({
        user_id: userId,
        role: 'coach',
      }, {
        onConflict: 'user_id,role'
      });

    if (roleError) throw roleError;

    // Create profiles_legacy row first to satisfy FK constraint on coaches table
    const { error: profilesLegacyError } = await supabaseAdmin
      .from('profiles_legacy')
      .upsert({
        id: userId,
        email,
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        date_of_birth: date_of_birth ?? null,
        status: 'active',
      }, {
        onConflict: 'id',
      });

    if (profilesLegacyError) {
      console.error('Error upserting profiles_legacy:', profilesLegacyError);
      throw profilesLegacyError;
    }

    // Route all 3-table writes through upsert_coach_full(...) RPC (D3 of
    // the coach column-ownership refactor — docs/COACH_TABLES_REFACTOR_PLAN.md).
    // The RPC writes coaches + coaches_public + coaches_private atomically
    // inside one transaction; partial writes are impossible. This also
    // structurally fixes the seed bug where coaches_public was never
    // populated for new coaches (§ 6 of the plan).
    const publicPayload: Record<string, unknown> = {
      first_name,
      last_name,
      location,
      nickname,
    };
    if (certifications) publicPayload.qualifications = certifications;
    if (specializations) publicPayload.specializations = specializations;

    const privatePayload: Record<string, unknown> = {
      email,
      date_of_birth: date_of_birth ?? null,
      instagram_url: instagram_url ?? null,
      tiktok_url: tiktok_url ?? null,
      snapchat_url: snapchat_url ?? null,
      youtube_url: youtube_url ?? null,
    };
    if (phoneNumber) privatePayload.whatsapp_number = phoneNumber;

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('upsert_coach_full', {
      p_user_id: userId,
      p_public: publicPayload,
      p_private: privatePayload,
      p_admin: { status: applicationId ? 'active' : 'pending' },
    });

    if (rpcError) throw rpcError;
    if (!rpcResult || (rpcResult as { ok?: boolean }).ok !== true) {
      throw new Error('upsert_coach_full did not return ok: ' + JSON.stringify(rpcResult));
    }

    // Refetch the coaches row for the response + downstream link/email.
    const { data: coachData, error: fetchError } = await supabaseAdmin
      .from('coaches')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (fetchError) throw fetchError;

    // Optional subrole approval block. Generalises this function for admin
    // "Add Dietitian" / "Add Physio" flows: each slug becomes an approved
    // user_subroles row stamped with the calling admin as reviewer (mirrors
    // SubroleApprovalQueue's approve mutation exactly -- there is no trigger
    // from user_subroles into staff_professional_info, so admin still sets
    // level via ProfessionalLevelManager afterwards).
    //
    // Defensive design:
    //   - Unknown slugs are logged and skipped (slugs the seeded
    //     subrole_definitions doesn't carry, e.g. typos from a future caller).
    //   - ON CONFLICT (user_id, subrole_id) DO NOTHING via upsert with
    //     ignoreDuplicates: brand-new users won't have prior rows, but for
    //     existingUser updates we don't want to flip an already-approved row
    //     back to admin-direct or overwrite review metadata.
    //   - The dietitian slug additionally seeds public.dietitians with the
    //     defaults from the table CREATE statement, so the new user shows up
    //     on the dietitian list immediately. Physiotherapists have no analog
    //     profile table (locked decision in the brief).
    const approvedSlugs: string[] = [];
    if (subroles && subroles.length > 0) {
      const { data: defs, error: defsError } = await supabaseAdmin
        .from('subrole_definitions')
        .select('id, slug')
        .in('slug', subroles);
      if (defsError) {
        console.error('subrole_definitions lookup failed:', defsError);
      } else {
        const defBySlug = new Map<string, string>(
          (defs || []).map((d: { id: string; slug: string }) => [d.slug, d.id]),
        );
        const reviewedAt = new Date().toISOString();
        for (const slug of subroles) {
          const subroleId = defBySlug.get(slug);
          if (!subroleId) {
            console.warn('Unknown subrole slug, skipping:', slug);
            continue;
          }
          const { error: usrError } = await supabaseAdmin
            .from('user_subroles')
            .upsert(
              {
                user_id: userId,
                subrole_id: subroleId,
                status: 'approved',
                reviewed_by: caller.id,
                reviewed_at: reviewedAt,
                admin_notes: 'Admin-direct creation',
              },
              {
                onConflict: 'user_id,subrole_id',
                ignoreDuplicates: true,
              },
            );
          if (usrError) {
            console.error('user_subroles upsert failed for slug', slug, ':', usrError);
            continue;
          }
          if (slug === 'dietitian') {
            const { error: dietitianError } = await supabaseAdmin
              .from('dietitians')
              .upsert(
                { user_id: userId, accepting_clients: true, max_clients: 50 },
                { onConflict: 'user_id', ignoreDuplicates: true },
              );
            if (dietitianError) {
              console.error('dietitians seed failed:', dietitianError);
            }
          }
          approvedSlugs.push(slug);
        }
      }
    }

    let passwordResetLink = null;
    try {
      const redirectTo = `https://theigu.com/coach-password-setup?coach_id=${coachData.id}`;
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo },
      });
      if (linkError) throw linkError;
      passwordResetLink = linkData?.properties?.action_link || null;
      console.log('Generated password reset link with redirect to:', redirectTo);
    } catch (linkError) {
      console.error('Error generating password reset link:', linkError);
    }

    // Send invitation email
    try {
      const { data: emailData, error: emailError } = await supabaseAdmin.functions.invoke('send-coach-invitation', {
        body: {
          coachId: coachData.id,
          coachEmail: email,
          coachName: `${first_name} ${last_name}`,
          isNewUser: isNewUser,
          coachStatus: coachData.status,
          passwordResetLink: passwordResetLink,
        },
      });
      if (emailError) {
        console.error('Error from send-coach-invitation:', emailError);
      } else {
        console.log('Invitation email sent successfully:', JSON.stringify(emailData));
      }
    } catch (emailError) {
      console.error('Exception sending invitation email:', emailError);
      // Don't fail the whole operation if email fails
    }

    const baseMessage = existingUser ? 'Coach account updated successfully' : 'Coach account created successfully';
    const message =
      approvedSlugs.length > 0
        ? `${baseMessage} with ${approvedSlugs.join(' + ')} subrole approved`
        : baseMessage;

    return new Response(
      JSON.stringify({
        success: true,
        coach: coachData,
        approvedSubroles: approvedSlugs,
        message,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      },
    );
  } catch (error) {
    console.error('Error creating coach:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Failed to create coach account" }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      },
    );
  }
});