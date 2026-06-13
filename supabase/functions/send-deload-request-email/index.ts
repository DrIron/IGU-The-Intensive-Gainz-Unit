/**
 * send-deload-request-email
 *
 * Fires when a client INSERTS a row into deload_requests. Notifies the
 * client's primary coach + every active care-team member.
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
 *   1. Resolve caller via user JWT. Must be the client on the request.
 *   2. Load the request via service-role client.
 *   3. Build recipient list (primary coach + active care team).
 *   4. Send each recipient one email -- the DB partial unique index already
 *      forbids two pending requests for the same client, so no in-function
 *      window-based dedup is needed.
 *   5. Log to email_notifications.
 *
 * Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §10.4
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

const NOTIFICATION_TYPE = "deload_request";
const MESSAGE_PREVIEW_CHARS = 220;

interface Recipient {
  user_id: string;
  email: string;
  first_name: string;
}

serve(async (req) => {
  // CRITICAL: respond to OPTIONS before req.json() — preflight has no body
  // and JSON.parse("") would throw and kill CORS (CLAUDE.md edge function rule).
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

    // Resolve caller via their JWT.
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

    // Load the deload request. Service-role bypass so we don't fight RLS
    // for the read (we trust caller-id check below).
    const { data: request, error: requestError } = await admin
      .from("deload_requests")
      .select("id, client_id, subscription_id, requested_at, client_message, status")
      .eq("id", request_id)
      .maybeSingle();
    if (requestError) {
      console.error("request lookup:", requestError.message);
      return json({ error: "Request lookup failed" }, 500);
    }
    if (!request) {
      return json({ error: "Request not found" }, 404);
    }
    if (request.status !== "pending") {
      // Coach already responded between INSERT and this notification fire.
      return json({ ok: true, skipped: "not_pending" });
    }
    if (request.client_id !== caller.id) {
      // Only the client themselves can trigger their own notification.
      return json({ error: "Caller is not the client" }, 403);
    }

    const recipients = await loadCareTeamRecipients(admin, request.client_id);
    if (recipients.length === 0) {
      return json({ ok: true, sent: 0, reason: "no recipients" });
    }

    const clientName = await loadDisplayName(admin, request.client_id);
    const reviewUrl = `${APP_BASE_URL}/coach/clients/${request.client_id}?tab=overview`;
    const messagePreview = makePreview(request.client_message ?? "");

    let sent = 0;
    for (const recipient of recipients) {
      const html = wrapInLayout({
        content: [
          greeting(recipient.first_name),
          paragraph(`${clientName} just requested a deload week.`),
          messagePreview
            ? alertBox(`<strong>Their note:</strong> "${escapeHtml(messagePreview)}"`, "info")
            : paragraph("They didn't add a note."),
          paragraph("Open their overview to approve, schedule for a future week, or decline -- and respond with context if you decline."),
          ctaButton("Review request", reviewUrl),
          signOff(),
        ].join(""),
        preheader: `${clientName} requested a deload week${messagePreview ? `: ${messagePreview}` : ""}`,
      });

      const result = await sendEmail({
        from: EMAIL_FROM_COACHING,
        to: recipient.email,
        subject: `${clientName} requested a deload`,
        html,
      });

      if (!result.success) {
        console.error("sendEmail error:", result.error ?? "unknown");
        continue;
      }

      const { error: logError } = await admin
        .from("email_notifications")
        .insert({
          user_id: recipient.user_id,
          notification_type: NOTIFICATION_TYPE,
          context_id: request.client_id,
          sent_at: new Date().toISOString(),
          status: "sent",
        });
      if (logError) {
        // Log only -- a missing row doesn't break the user-facing flow.
        console.error("email_notifications insert:", logError.message);
      }

      sent += 1;
    }

    return json({ ok: true, sent, total_recipients: recipients.length });
  } catch (err) {
    console.error("send-deload-request-email error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});

// ── Recipient loading ─────────────────────────────────────────────────────────

async function loadCareTeamRecipients(
  admin: ReturnType<typeof createClient>,
  clientId: string,
): Promise<Recipient[]> {
  const [assignmentsRes, subsRes] = await Promise.all([
    admin
      .from("care_team_assignments")
      .select("staff_user_id")
      .eq("client_id", clientId)
      .in("lifecycle_status", ["active", "scheduled_end"]),
    admin
      .from("subscriptions")
      .select("coach_id")
      .eq("user_id", clientId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const ids = new Set<string>();
  for (const row of assignmentsRes.data ?? []) {
    if (row.staff_user_id) ids.add(row.staff_user_id);
  }
  for (const row of subsRes.data ?? []) {
    if (row.coach_id) ids.add(row.coach_id);
  }

  if (ids.size === 0) return [];
  return loadRecipientProfiles(admin, [...ids]);
}

async function loadRecipientProfiles(
  admin: ReturnType<typeof createClient>,
  userIds: string[],
): Promise<Recipient[]> {
  const [privateRes, publicRes] = await Promise.all([
    admin
      .from("profiles_private")
      .select("profile_id, email")
      .in("profile_id", userIds),
    admin
      .from("profiles_public")
      .select("id, first_name, display_name")
      .in("id", userIds),
  ]);

  const emailByUser = new Map<string, string>();
  for (const row of privateRes.data ?? []) {
    if (row.email) emailByUser.set(row.profile_id, row.email);
  }

  const publicByUser = new Map<string, { first_name: string | null; display_name: string | null }>();
  for (const row of publicRes.data ?? []) {
    publicByUser.set(row.id, { first_name: row.first_name, display_name: row.display_name });
  }

  const recipients: Recipient[] = [];
  for (const id of userIds) {
    const email = emailByUser.get(id);
    if (!email) continue;
    const pub = publicByUser.get(id);
    recipients.push({
      user_id: id,
      email,
      first_name: pub?.first_name ?? pub?.display_name ?? "there",
    });
  }
  return recipients;
}

async function loadDisplayName(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const { data } = await admin
    .from("profiles_public")
    .select("first_name, display_name")
    .eq("id", userId)
    .maybeSingle();
  return data?.display_name || data?.first_name || "Your client";
}

function makePreview(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
  if (!clean) return "";
  if (clean.length <= MESSAGE_PREVIEW_CHARS) return clean;
  return `${clean.slice(0, MESSAGE_PREVIEW_CHARS - 1)}...`;
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
