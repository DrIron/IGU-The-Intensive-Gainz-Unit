import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { checkRateLimit, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify caller is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Authentication required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseClient = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify the JWT resolves to a real user
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY') ?? '', {
      global: { headers: { Authorization: authHeader } }
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(
        JSON.stringify({ error: 'Invalid authentication' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Rate limiting: 3 requests per minute per user (very strict)
    const rateCheck = checkRateLimit(`user:${caller.id}`, 3, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    const { userId } = await req.json();

    if (!userId) {
      throw new Error('User ID is required');
    }

    // Authorization: user can only delete their own account, unless they're an admin
    if (caller.id !== userId) {
      const { data: callerRoles } = await supabaseClient
        .from('user_roles')
        .select('role')
        .eq('user_id', caller.id);
      const isAdmin = callerRoles?.some(r => r.role === 'admin');
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ error: 'You can only delete your own account' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    console.log('Deleting account for user:', userId);

    // 1. Cancel any active Tap subscriptions first
    const { data: subscriptions } = await supabaseClient
      .from('subscriptions')
      .select('tap_subscription_id, tap_customer_id, status')
      .eq('user_id', userId);

    if (subscriptions && subscriptions.length > 0) {
      for (const sub of subscriptions) {
        if (sub.tap_subscription_id) {
          try {
            console.log('Deleting Tap subscription:', sub.tap_subscription_id);
            
            // DELETE subscription via Tap API
            const tapResponse = await fetch(
              `https://api.tap.company/v2/subscriptions/${sub.tap_subscription_id}`,
              {
                method: 'DELETE',
                headers: {
                  'Authorization': `Bearer ${Deno.env.get('TAP_SECRET_KEY')}`,
                },
              }
            );

            if (!tapResponse.ok) {
              console.error('Tap subscription deletion failed:', await tapResponse.text());
            } else {
              console.log('Tap subscription deleted successfully');
            }
          } catch (tapError) {
            console.error('Error deleting Tap subscription:', tapError);
          }
        }
      }
    }

    // 2. Hard delete all user data in order (respecting foreign keys)
    console.log('Deleting all user data for:', userId);
    
    // Delete nutrition-related data
    const { data: phases } = await supabaseClient
      .from('nutrition_phases')
      .select('id')
      .eq('user_id', userId);

    if (phases && phases.length > 0) {
      const phaseIds = phases.map(p => p.id);
      await supabaseClient.from('nutrition_adjustments').delete().in('phase_id', phaseIds);
      await supabaseClient.from('coach_nutrition_notes').delete().in('phase_id', phaseIds);
      await supabaseClient.from('weight_logs').delete().in('phase_id', phaseIds);
      await supabaseClient.from('circumference_logs').delete().in('phase_id', phaseIds);
      await supabaseClient.from('adherence_logs').delete().in('phase_id', phaseIds);
    }
    
    await supabaseClient.from('nutrition_phases').delete().eq('user_id', userId);
    await supabaseClient.from('weekly_progress').delete().eq('user_id', userId);

    
    // Delete other user data
    await supabaseClient.from('coach_change_requests').delete().eq('user_id', userId);
    await supabaseClient.from('testimonials').delete().eq('user_id', userId);
    await supabaseClient.from('form_submissions').delete().eq('user_id', userId);
    await supabaseClient.from('subscriptions').delete().eq('user_id', userId);
    await supabaseClient.from('email_notifications').delete().eq('user_id', userId);

    // Clean up any relationships where this user acted as a coach
    // 1) Unassign as coach from client subscriptions and nutrition phases
    await supabaseClient.from('subscriptions').update({ coach_id: null }).eq('coach_id', userId);
    await supabaseClient.from('nutrition_phases').update({ coach_id: null }).eq('coach_id', userId);

    // 2) Remove coach change requests referencing this coach
    await supabaseClient.from('coach_change_requests')
      .delete()
      .or(`requested_coach_id.eq.${userId},current_coach_id.eq.${userId}`);

    // 3) Coach-related data cleanup (if the user is/was a coach)
    await supabaseClient.from('coach_nutrition_notes').delete().eq('coach_id', userId);

    // Find coach row id to properly delete service limits that reference coaches.id
    const { data: coachRow } = await supabaseClient
      .from('coaches')
      .select('id')
      .eq('user_id', userId)
      .maybeSingle();

    if (coachRow?.id) {
      await supabaseClient.from('coach_service_limits').delete().eq('coach_id', coachRow.id);
    }

    await supabaseClient.from('coaches').delete().eq('user_id', userId);

    await supabaseClient.from('user_roles').delete().eq('user_id', userId);
    // Get profile email before deletion for Zapier notification (from profiles_private)
    const { data: profileData } = await supabaseClient
      .from('profiles_private')
      .select('email')
      .eq('profile_id', userId)
      .maybeSingle();
    const profileEmail = profileData?.email ?? null;

    // Delete from both tables (profiles_private first due to FK, then profiles_public)
    await supabaseClient.from('profiles_private').delete().eq('profile_id', userId);
    await supabaseClient.from('profiles_public').delete().eq('id', userId);

    // ============================
    // ZAPIER NOTIFICATION (NON-BLOCKING)
    // ============================
    try {
      await supabaseClient.functions.invoke('notify-zapier', {
        body: {
          event_type: 'user_deleted',
          user_id: userId,
          profile_id: userId,
          profile_email: profileEmail,
          notes: 'Account deleted',
          metadata: {
            reason: 'delete_account_function',
          },
        },
      });
      console.log('Zapier notification sent for user_deleted');
    } catch (zapierError) {
      console.error('Zapier notification failed (non-critical):', zapierError);
    }

    // Final step: Delete auth user (this will cascade any remaining auth-related data)
    const { error: authError } = await supabaseClient.auth.admin.deleteUser(userId);

    if (authError) {
      // If the user is already deleted in auth, proceed gracefully
      // @ts-expect-error - runtime error object may include status/code
      if (authError.status === 404 || authError.code === 'user_not_found') {
        console.warn('Auth user not found, proceeding with cleanup');
      } else {
        console.error('Error deleting auth user (non-fatal):', authError);
      }
    }

    console.log('Account hard deleted successfully:', userId);

    return new Response(
      JSON.stringify({ success: true, message: 'Account and all billing cancelled successfully' }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in delete-account function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
