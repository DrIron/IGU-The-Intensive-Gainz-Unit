import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const manualClientSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  phoneNumber: z.string().min(8).max(20).trim(),
  dateOfBirth: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format"),
  gender: z.enum(['male', 'female', 'other', 'prefer_not_to_say']),
  serviceId: z.string().uuid(),
});

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
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

    const body = await req.json();
    const validated = manualClientSchema.parse(body);
    const { email, firstName, lastName, phoneNumber, dateOfBirth, gender, serviceId } = validated;

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

    // Resolve user by email via paginated listUsers, then fallback to profile lookup
    let userId: string | null = null;
    try {
      let page = 1;
      const perPage = 1000;
      while (!userId) {
        const { data: pageData, error: pageErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (pageErr) break;
        const found = pageData?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
        if (found) {
          userId = found.id;
          console.log('User already exists (auth):', userId);
          break;
        }
        if (!pageData || pageData.users.length < perPage) break;
        page += 1;
      }
    } catch (e) {
      console.log('listUsers failed, will try profile lookup');
    }

    if (!userId) {
      const { data: existingProfile } = await supabaseAdmin
        .from('profiles')
        .select('id')
        .ilike('email', email)
        .maybeSingle();
      userId = existingProfile?.id || null;
      if (userId) console.log('User already exists (profile):', userId);
    }

    // Additional recovery: check if this email belongs to a coach record
    if (!userId) {
      const { data: coachUser, error: coachLookupErr } = await supabaseAdmin
        .from('coaches')
        .select('user_id')
        .ilike('email', email)
        .maybeSingle();
      if (coachLookupErr) {
        console.log('Coach lookup error (non-fatal):', coachLookupErr);
      }
      if (coachUser?.user_id) {
        userId = coachUser.user_id;
        console.log('User exists as coach, reusing auth user id:', userId);
      }
    }

    if (!userId) {
      // Create the user account (will trigger profile creation via trigger)
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: {
          first_name: firstName,
          last_name: lastName,
        },
      });

      if (authError) {
        console.error('Auth error on createUser, attempting recovery:', authError);
        // 1) Try to find existing auth user by email (case-insensitive)
        try {
          let page = 1;
          const perPage = 1000;
          while (!userId) {
            const { data: pageData, error: pageErr } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
            if (pageErr) break;
            const found = pageData?.users?.find((u: any) => (u.email || '').toLowerCase() === email.toLowerCase());
            if (found) {
              userId = found.id;
              console.log('Recovered existing auth user:', userId);
              break;
            }
            if (!pageData || pageData.users.length < perPage) break;
            page += 1;
          }
        } catch (_e) {
          console.log('Recovery listUsers failed');
        }

        // 2) If still not found, try profile (case-insensitive)
        if (!userId) {
          const { data: recoveredProfile } = await supabaseAdmin
            .from('profiles')
            .select('id')
            .ilike('email', email)
            .maybeSingle();
          if (recoveredProfile?.id) {
            userId = recoveredProfile.id;
            console.log('Recovered existing user via profile:', userId);
          }
        }

        // 3) If still not found, try coach by email (case-insensitive)
        if (!userId) {
          const { data: coachUser2 } = await supabaseAdmin
            .from('coaches')
            .select('user_id')
            .ilike('email', email)
            .maybeSingle();
          if (coachUser2?.user_id) {
            userId = coachUser2.user_id;
            console.log('Recovered existing user via coach record:', userId);
          }
        }

        // 4) Fallback: try sending an invite (also creates the user if not present)
        if (!userId) {
          try {
            const redirectTo = 'https://theigu.com/reset-password';
            const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
              email,
              { redirectTo, data: { first_name: firstName, last_name: lastName } }
            );
            if (inviteError) {
              console.log('Invite failed:', inviteError);
            } else if (inviteData?.user?.id) {
              userId = inviteData.user.id;
              console.log('Recovered via invite flow, user id:', userId);
            }
          } catch (invErr) {
            console.log('Invite flow exception:', invErr);
          }
        }

        // 5) Final fallback: try signup link generation (creates user if allowed)
        if (!userId) {
          try {
            const tempPassword = crypto.randomUUID() + 'Aa1!#';
            const { data: signupLinkData, error: signupLinkError } = await supabaseAdmin.auth.admin.generateLink({
              type: 'signup',
              email,
              password: tempPassword,
              options: { redirectTo: 'https://theigu.com/reset-password', data: { first_name: firstName, last_name: lastName } }
            });
            if (signupLinkError) {
              console.log('Signup link generation failed:', signupLinkError);
            } else if (signupLinkData?.user?.id) {
              userId = signupLinkData.user.id;
              console.log('Recovered via signup link, user id:', userId);
            }
          } catch (sgErr) {
            console.log('Signup link exception:', sgErr);
          }
        }

        if (!userId) {
          throw authError;
        }
      } else {
        if (!authData.user) throw new Error("Failed to create user");
        userId = authData.user.id;
        console.log('Created new user:', userId);
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
      console.error('profiles_public upsert error:', profilePublicError);
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
      console.error('profiles_private upsert error:', profilePrivateError);
    }

    // Find the Dr. Iron admin coach account
    const { data: adminCoach, error: coachError } = await supabaseAdmin
      .from("coaches")
      .select("user_id")
      .eq("email", "driron.admin@theigu.com")
      .eq("status", "approved")
      .maybeSingle();

    if (coachError) {
      console.error('Error finding admin coach:', coachError);
    }

    const coachId = adminCoach?.user_id || null;
    console.log('Assigning client to coach:', coachId);

    // Create active subscription (no payment needed for manual clients)
    // Idempotency: skip if an active/pending subscription for same service already exists
    const { data: existingSub, error: existingSubErr } = await supabaseAdmin
      .from('subscriptions')
      .select('id,status')
      .eq('user_id', userId)
      .eq('service_id', serviceId)
      .in('status', ['active', 'pending'])
      .maybeSingle();

    if (existingSubErr) {
      console.error('Check existing subscription error:', existingSubErr);
    }

    if (!existingSub) {
      const { error: subError } = await supabaseAdmin
        .from("subscriptions")
        .insert({
          user_id: userId,
          service_id: serviceId,
          status: "active", // Set to active immediately
          start_date: new Date().toISOString(),
          coach_id: coachId,
        });

      if (subError) {
        console.error('Subscription error:', subError);
        throw subError;
      }
    } else {
      console.log('Subscription already exists, skipping creation');
    }

    // Update profile status to active (write to profiles_public)
    const { error: statusError } = await supabaseAdmin
      .from("profiles_public")
      .update({ status: "active" })
      .eq("id", userId);

    if (statusError) {
      console.error('Status update error:', statusError);
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
      console.log('Generated password reset link');
    } catch (linkError) {
      console.error('Error generating password reset link:', linkError);
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
        console.log('Sent signup confirmation email');
      } catch (emailError) {
        console.error('Error sending signup email:', emailError);
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
    console.error('Error in create-manual-client:', error);
    
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