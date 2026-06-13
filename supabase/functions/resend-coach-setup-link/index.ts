import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { AUTH_REDIRECT_URLS } from '../_shared/config.ts';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  coachId: z.string().uuid(),
});

/**
 * Self-serve "resend my setup link" for invited coaches.
 *
 * Why this exists: the coach password-setup link is a single-use, short-lived
 * Supabase recovery link. It is routinely consumed by email security scanners
 * or expires before the coach clicks it, leaving them on CoachPasswordSetup
 * with no session ("Auth session missing" on updateUser). This endpoint lets
 * a coach who is already sitting on that page (and therefore has a valid
 * coach_id in the URL) request a fresh link without admin involvement.
 *
 * Security model: this is intentionally unauthenticated -- the coach has no
 * session yet, that's the whole problem. It is the coach equivalent of a
 * public "forgot password" form, so it follows the same rules:
 *   - rate limited per IP (best-effort)
 *   - NEVER returns the link or the email address to the caller
 *   - always responds 200 { success: true } regardless of whether the coach
 *     exists, so coach_ids cannot be enumerated
 * The email only ever goes to the address already on file for that coach.
 */
serve(async (req: Request): Promise<Response> => {
  // CLAUDE.md: handle OPTIONS before req.json()
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Generic success response -- used for both real success and the
  // "don't leak existence" path so callers can't distinguish them.
  const ok = () =>
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, 3, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    const body = await req.json().catch(() => ({}));
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      // Malformed input -- treat as generic success (no enumeration signal).
      return ok();
    }
    const { coachId } = parsed.data;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Look up the coach (base coaches table carries id/user_id/name/status).
    const { data: coach, error: coachError } = await supabaseAdmin
      .from('coaches')
      .select('id, user_id, first_name, last_name, status')
      .eq('id', coachId)
      .maybeSingle();
    if (coachError) throw coachError;
    if (!coach) {
      console.warn('resend-coach-setup-link: no coach for id', coachId);
      return ok();
    }

    // If the coach has already set a password and signed in, there is nothing
    // to resend -- silently succeed.
    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(coach.user_id);
    if (authUser?.user?.last_sign_in_at) {
      console.log('resend-coach-setup-link: coach already signed in, skipping', coachId);
      return ok();
    }

    // Email lives in coaches_private.
    const { data: priv, error: privError } = await supabaseAdmin
      .from('coaches_private')
      .select('email')
      .eq('user_id', coach.user_id)
      .maybeSingle();
    if (privError) throw privError;

    const email: string | null = priv?.email ?? authUser?.user?.email ?? null;
    if (!email) {
      console.warn('resend-coach-setup-link: no email on file for coach', coachId);
      return ok();
    }

    // Generate a FRESH recovery link pointing back at the setup page.
    const redirectTo = AUTH_REDIRECT_URLS.coachPasswordSetup(coach.id);
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo },
    });
    if (linkError) throw linkError;
    const passwordResetLink = linkData?.properties?.action_link ?? null;
    if (!passwordResetLink) {
      console.error('resend-coach-setup-link: generateLink returned no action_link for', coachId);
      return ok();
    }

    // Reuse the existing invitation email renderer/sender.
    const coachName = `${coach.first_name ?? ''} ${coach.last_name ?? ''}`.trim() || 'there';
    const { error: emailError } = await supabaseAdmin.functions.invoke('send-coach-invitation', {
      body: {
        coachId: coach.id,
        coachEmail: email,
        coachName,
        isNewUser: false,
        coachStatus: coach.status,
        passwordResetLink,
      },
    });
    if (emailError) {
      console.error('resend-coach-setup-link: send-coach-invitation failed', emailError);
      // Still return generic success -- don't reveal internal failure to the caller.
    } else {
      console.log('resend-coach-setup-link: fresh link sent for coach', coachId);
    }

    return ok();
  } catch (error: any) {
    console.error('resend-coach-setup-link error:', error);
    // Generic success even on error -- avoids leaking anything to the caller.
    return ok();
  }
});
