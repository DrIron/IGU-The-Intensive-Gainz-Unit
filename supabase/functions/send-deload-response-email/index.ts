/**
 * send-deload-response-email
 *
 * Fires when a coach / care-team member / admin UPDATES a deload_request
 * row off 'pending' status. Notifies the client of the outcome.
 *
 * Deployed with --no-verify-jwt because we do our own Authorization-header
 * validation (gateway otherwise rejects ES256 JWTs on some functions; see
 * CLAUDE.md JWT reference table).
 *
 * Contract:
 *   POST body: { request_id: uuid }
 *   Caller header: Authorization: Bearer <user JWT>
 *
 * Flow:
 *   1. Resolve caller via user JWT. Must be care-team or admin for the
 *      request's client.
 *   2. Load the request via service-role client. Skip if status === 'pending'
 *      (no response to email).
 *   3. Email the client with the outcome + optional coach response message
 *      + (when approved) the scheduled week.
 *   4. Log to email_notifications. No window-based throttle -- one response
 *      per request, no spam vector.
 *
 * Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §10.5
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_FROM_COACHING, APP_BASE_URL } from "../_shared/config.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import {
  greeting,
  paragraph,
  ctaButton,
  signOff,
  alertBox,
} from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  request_id: z.string().uuid(),
});

const NOTIFICATION_TYPE = "deload_response";

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return json({ error: "Invalid authentication" }, 401);
    }

    const parsed = requestSchema.safeParse(await req.json());
    if (!parsed.success) {
      return json({ error: "Invalid request body" }, 400);
    }
    const { request_id } = parsed.data;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: request, error: requestError } = await admin
      .from("deload_requests")
      .select(
        "id, client_id, status, coach_user_id, coach_responded_at, " +
        "coach_response_message, approved_week_offset, applied_preset_id",
      )
      .eq("id", request_id)
      .maybeSingle();
    if (requestError) {
      console.error("request lookup:", requestError.message);
      return json({ error: "Request lookup failed" }, 500);
    }
    if (!request) {
      return json({ error: "Request not found" }, 404);
    }
    if (request.status === "pending") {
      // Coach hasn't actually responded yet -- nothing to notify on.
      return json({ ok: true, skipped: "still_pending" });
    }
    if (request.status === "cancelled") {
      // Client cancelled their own request -- no email to client about that.
      return json({ ok: true, skipped: "cancelled" });
    }

    // Caller must be staff for this client (RLS would already block direct
    // table writes, but we double-check here so an authenticated stranger
    // can't trigger a notification by guessing a request id).
    const { data: isStaff, error: staffError } = await admin.rpc(
      "is_care_team_member_for_client",
      { p_staff_uid: caller.id, p_client_uid: request.client_id },
    );
    const { data: isAdmin } = await admin.rpc("is_admin", { p_user_id: caller.id });
    if (staffError) {
      console.warn("staff check failed:", staffError.message);
    }
    if (!isStaff && !isAdmin) {
      return json({ error: "Caller is not staff for this client" }, 403);
    }

    // Load client recipient + responder display name.
    const [clientProfileRes, responderProfileRes, clientEmailRes] = await Promise.all([
      admin
        .from("profiles_public")
        .select("first_name, display_name")
        .eq("id", request.client_id)
        .maybeSingle(),
      request.coach_user_id
        ? admin
            .from("profiles_public")
            .select("first_name, display_name")
            .eq("id", request.coach_user_id)
            .maybeSingle()
        : Promise.resolve({ data: null }),
      admin
        .from("profiles_private")
        .select("email")
        .eq("profile_id", request.client_id)
        .maybeSingle(),
    ]);

    const clientEmail = clientEmailRes.data?.email;
    if (!clientEmail) {
      return json({ ok: true, sent: 0, reason: "client has no email" });
    }

    const clientFirstName =
      clientProfileRes.data?.first_name || clientProfileRes.data?.display_name || "there";
    const responderName =
      responderProfileRes.data?.display_name ||
      responderProfileRes.data?.first_name ||
      "Your coach";

    const dashboardUrl = `${APP_BASE_URL}/dashboard`;

    // Status-specific copy.
    let subject: string;
    let leadParagraph: string;
    let detail: string | null = null;
    if (request.status === "approved") {
      subject = "Your deload request was approved";
      const weekLabel = request.approved_week_offset != null
        ? `Week ${request.approved_week_offset}`
        : "your current week";
      leadParagraph = `${responderName} approved your deload request and scheduled it for ${weekLabel}.`;
      if (request.applied_preset_id) {
        detail = `Preset: ${formatPresetLabel(request.applied_preset_id)}.`;
      }
    } else if (request.status === "declined") {
      subject = "Update on your deload request";
      leadParagraph = `${responderName} reviewed your deload request and decided to hold off for now.`;
    } else {
      // Future statuses (e.g. 'scheduled' if we split that out later) --
      // generic copy.
      subject = "Update on your deload request";
      leadParagraph = `${responderName} responded to your deload request.`;
    }

    const responseMessageBlock = request.coach_response_message
      ? alertBox(
          `<strong>${escapeHtml(responderName)}:</strong> "${escapeHtml(request.coach_response_message)}"`,
          request.status === "approved" ? "success" : "info",
        )
      : "";

    const html = wrapInLayout({
      content: [
        greeting(clientFirstName),
        paragraph(leadParagraph),
        detail ? paragraph(detail) : "",
        responseMessageBlock,
        ctaButton("Open dashboard", dashboardUrl),
        signOff(),
      ].join(""),
      preheader: subject,
    });

    const result = await sendEmail({
      from: EMAIL_FROM_COACHING,
      to: clientEmail,
      subject,
      html,
    });

    if (!result.success) {
      console.error("sendEmail error:", result.error ?? "unknown");
      return json({ error: "Email send failed" }, 500);
    }

    const { error: logError } = await admin
      .from("email_notifications")
      .insert({
        user_id: request.client_id,
        notification_type: NOTIFICATION_TYPE,
        context_id: request.id,
        sent_at: new Date().toISOString(),
        status: "sent",
      });
    if (logError) {
      console.error("email_notifications insert:", logError.message);
    }

    return json({ ok: true, sent: 1, status: request.status });
  } catch (err) {
    console.error("send-deload-response-email error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});

function formatPresetLabel(presetId: string): string {
  switch (presetId) {
    case "volume":
      return "Volume deload (sets -40%, RIR +1)";
    case "intensity":
      return "Intensity deload (load -20%, RIR +2)";
    case "recovery":
      return "Recovery deload (sets -50%, load -30%, RIR +2)";
    case "custom":
      return "Custom deload";
    default:
      return presetId;
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
