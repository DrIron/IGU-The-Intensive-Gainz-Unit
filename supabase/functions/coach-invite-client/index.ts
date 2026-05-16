import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const inviteSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  firstName: z.string().min(1).max(50).trim(),
  lastName: z.string().min(1).max(50).trim(),
  serviceId: z.string().uuid(),
});

serve(async (req) => {
  // OPTIONS must come before req.json()
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, 5, 60_000);
    if (!rateCheck.allowed) return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // Verify caller identity
    const authHeader = req.headers.get("Authorization")?.replace("Bearer ", "");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Authorization required" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: { user: caller }, error: callerError } = await supabaseAdmin.auth.getUser(authHeader);
    if (callerError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Caller must be coach or admin. Destructure { error } per CLAUDE.md —
    // a silent role-fetch failure would falsely reject every legit caller.
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);

    if (roleError) {
      console.error(JSON.stringify({ fn: "coach-invite-client", step: "role_check", ok: false, error: roleError.message }));
      return new Response(JSON.stringify({ error: "Unable to verify caller role. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const roleList = (roleRows ?? []).map((r: any) => r.role as string);
    const isAdmin = roleList.includes("admin");
    const isCoach = roleList.includes("coach");

    if (!isAdmin && !isCoach) {
      return new Response(JSON.stringify({ error: "Coach or admin role required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch coach profile for level + quota (service role bypasses RLS).
    // Destructure { error } per CLAUDE.md; treat fetch failure as fatal so we
    // don't silently fall back to default level/quotas the coach didn't earn.
    const { data: coachData, error: coachDataError } = await supabaseAdmin
      .from("coaches_public")
      .select("coach_level, max_onetoone_clients, max_team_clients, is_head_coach")
      .eq("user_id", caller.id)
      .maybeSingle();

    if (coachDataError) {
      console.error(JSON.stringify({ fn: "coach-invite-client", step: "coach_lookup", ok: false, error: coachDataError.message }));
      return new Response(JSON.stringify({ error: "Unable to verify coach profile. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Level gate: Junior coaches must go through admin. Admins bypass entirely.
    if (!isAdmin) {
      const level: string = coachData?.coach_level ?? "junior";
      if (level === "junior") {
        return new Response(
          JSON.stringify({
            error:
              "Only Senior and Lead coaches can invite clients directly. Please contact an admin to add clients on your behalf.",
          }),
          { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    const body = await req.json();
    const validated = inviteSchema.parse(body);
    const { email, firstName, lastName, serviceId } = validated;

    // Verify service is active. Distinguish error (transient DB issue → 500)
    // from missing row (bad client input → 400) per CLAUDE.md.
    const { data: service, error: serviceError } = await supabaseAdmin
      .from("services")
      .select("id, name, service_type")
      .eq("id", serviceId)
      .eq("is_active", true)
      .maybeSingle();

    if (serviceError) {
      console.error(JSON.stringify({ fn: "coach-invite-client", step: "service_lookup", ok: false, error: serviceError.message }));
      return new Response(JSON.stringify({ error: "Unable to verify service. Please try again." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!service) {
      return new Response(JSON.stringify({ error: "Invalid or inactive service selected" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Quota check (admins bypass)
    if (!isAdmin) {
      const isTeam = service.service_type === "team_plan";
      const maxClients: number = isTeam
        ? (coachData?.max_team_clients ?? 20)
        : (coachData?.max_onetoone_clients ?? 20);

      const { count, error: countErr } = await supabaseAdmin
        .from("subscriptions")
        .select("id", { count: "exact", head: true })
        .eq("coach_id", caller.id)
        .in("status", ["active", "pending_payment", "pending_coach_approval", "pending"]);

      // Fail closed on count error: a transient DB issue mustn't let a
      // quota-blocked coach create a new invite. The prior `!countErr && ...`
      // form skipped the check entirely on error — inverse of the safe default.
      if (countErr) {
        console.error(JSON.stringify({ fn: "coach-invite-client", step: "quota_check", ok: false, error: countErr.message }));
        return new Response(
          JSON.stringify({ error: "Unable to verify client quota. Please try again." }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if ((count ?? 0) >= maxClients) {
        return new Response(
          JSON.stringify({
            error: `You have reached your client limit (${maxClients}). Contact an admin to increase your quota.`,
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Send invite -- Supabase creates the user and delivers a magic link.
    // redirectTo lands the client on the onboarding form pre-seeded with coach + service.
    const redirectTo = `https://theigu.com/onboarding?coach=${caller.id}&service=${serviceId}`;

    const { data: inviteData, error: inviteError } =
      await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        redirectTo,
        data: {
          first_name: firstName,
          last_name: lastName,
          invited_by_coach_id: caller.id,
          invited_service_id: serviceId,
        },
      });

    if (inviteError) {
      console.error(
        JSON.stringify({
          fn: "coach-invite-client",
          step: "invite",
          ok: false,
          error: inviteError.message,
        })
      );

      // Supabase returns 422 when the email is already registered
      const msg = inviteError.message?.toLowerCase() ?? "";
      if (msg.includes("already") || msg.includes("registered") || (inviteError as any).status === 422) {
        return new Response(
          JSON.stringify({
            error:
              "This email address already has an IGU account. Ask them to sign in and go to /onboarding directly.",
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      throw inviteError;
    }

    console.log(
      JSON.stringify({
        fn: "coach-invite-client",
        step: "invite_sent",
        ok: true,
        invited_user_id: inviteData.user.id,
        coach_id: caller.id,
        service_id: serviceId,
      })
    );

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error(
      JSON.stringify({ fn: "coach-invite-client", step: "fatal", ok: false })
    );
    if (error.name === "ZodError") {
      return new Response(
        JSON.stringify({ error: error.errors?.[0]?.message ?? "Invalid input" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return new Response(
      JSON.stringify({ error: error.message ?? "Failed to send invitation" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
