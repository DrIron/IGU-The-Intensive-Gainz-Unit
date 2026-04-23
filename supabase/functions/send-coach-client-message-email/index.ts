/**
 * send-coach-client-message-email
 *
 * Fires an email notification to the recipients of a coach_client_messages
 * row that was just inserted. Deployed with --no-verify-jwt because we do
 * our own Authorization-header validation (gateway otherwise rejects ES256
 * JWTs on some functions; see CLAUDE.md JWT reference table).
 *
 * Contract:
 *   POST body: { message_id: uuid }
 *   Caller header: Authorization: Bearer <user JWT>
 *
 * Flow:
 *   1. Resolve the caller via the user JWT.
 *   2. Load the message using a service-role client; verify caller is the
 *      sender (rejects spoofing).
 *   3. Compute recipients:
 *        sender = client  -> every active care_team_assignments.staff_user_id
 *        sender = staff   -> the client
 *   4. For each recipient, check email_notifications for a send to the
 *      same (user_id, notification_type='coach_client_message',
 *      context_id=client_id) within WINDOW_MINUTES. Skip if one exists.
 *   5. Resolve recipient email + first name from profiles_private /
 *      profiles_public, send via Resend, log to email_notifications.
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
} from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const requestSchema = z.object({
  message_id: z.string().uuid(),
});

// Minutes between successive emails to the same recipient for the same
// thread. First message of a burst emails immediately; 2..N within the
// window update the in-app badge only.
const WINDOW_MINUTES = Number(
  Deno.env.get("COACH_CLIENT_MESSAGE_EMAIL_WINDOW_MIN") ?? "30",
);

const NOTIFICATION_TYPE = "coach_client_message";

const MESSAGE_PREVIEW_CHARS = 140;

interface Recipient {
  user_id: string;
  email: string;
  first_name: string;
  display_name: string | null;
}

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

    // Caller identity via their JWT.
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
    const { message_id } = parsed.data;

    // Service-role client for privileged reads (profiles_private) and
    // writes (email_notifications).
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: message, error: messageError } = await admin
      .from("coach_client_messages")
      .select("id, client_id, sender_id, message, deleted_at")
      .eq("id", message_id)
      .maybeSingle();
    if (messageError) {
      console.error("message lookup:", messageError.message);
      return json({ error: "Message lookup failed" }, 500);
    }
    if (!message) {
      return json({ error: "Message not found" }, 404);
    }
    if (message.deleted_at) {
      return json({ ok: true, skipped: "deleted" });
    }
    if (message.sender_id !== caller.id) {
      // Only the sender can trigger a notification for their own message --
      // prevents third parties from spamming on someone else's behalf.
      return json({ error: "Sender mismatch" }, 403);
    }

    const senderIsClient = message.sender_id === message.client_id;
    const recipients = senderIsClient
      ? await loadCareTeamRecipients(admin, message.client_id)
      : await loadClientRecipient(admin, message.client_id);

    if (recipients.length === 0) {
      return json({ ok: true, sent: 0, reason: "no recipients" });
    }

    const senderName = await loadSenderDisplayName(admin, message.sender_id);
    const preview = makePreview(message.message);
    const threadUrl = senderIsClient
      ? `${APP_BASE_URL}/coach/clients/${message.client_id}?tab=messages`
      : `${APP_BASE_URL}/messages`;

    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    let sent = 0;
    let throttled = 0;

    for (const recipient of recipients) {
      const { data: recent, error: throttleError } = await admin
        .from("email_notifications")
        .select("id")
        .eq("user_id", recipient.user_id)
        .eq("notification_type", NOTIFICATION_TYPE)
        .eq("context_id", message.client_id)
        .gte("sent_at", windowStart)
        .limit(1);
      if (throttleError) {
        console.warn("throttle check:", throttleError.message);
        // Fail open: if the dedup table read hiccups, prefer delivering
        // over silently dropping a message notification.
      }
      if (recent && recent.length > 0) {
        throttled += 1;
        continue;
      }

      const html = wrapInLayout({
        content: [
          greeting(recipient.first_name),
          paragraph(`${senderName} just sent you a message in your IGU thread:`),
          paragraph(`<em>"${escapeHtml(preview)}"</em>`),
          ctaButton("View conversation", threadUrl),
          signOff(),
        ].join(""),
        preheader: `${senderName}: ${preview}`,
      });

      const result = await sendEmail({
        from: EMAIL_FROM_COACHING,
        to: recipient.email,
        subject: `New message from ${senderName}`,
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
          context_id: message.client_id,
          sent_at: new Date().toISOString(),
          status: "sent",
        });
      if (logError) {
        console.error("email_notifications insert:", logError.message);
      }

      sent += 1;
    }

    return json({ ok: true, sent, throttled, total_recipients: recipients.length });
  } catch (err) {
    console.error("send-coach-client-message-email error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});

async function loadCareTeamRecipients(
  admin: ReturnType<typeof createClient>,
  clientId: string,
): Promise<Recipient[]> {
  // Active care team assignments + primary coach (from subscriptions.coach_id).
  // Dedup at the end so a primary coach who also has a care-team row is
  // only emailed once.
  const [assignmentsRes, subsRes] = await Promise.all([
    admin
      .from("care_team_assignments")
      .select("staff_user_id")
      .eq("client_id", clientId)
      .eq("status", "active"),
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

async function loadClientRecipient(
  admin: ReturnType<typeof createClient>,
  clientId: string,
): Promise<Recipient[]> {
  return loadRecipientProfiles(admin, [clientId]);
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
      display_name: pub?.display_name ?? null,
    });
  }
  return recipients;
}

async function loadSenderDisplayName(
  admin: ReturnType<typeof createClient>,
  senderId: string,
): Promise<string> {
  const { data } = await admin
    .from("profiles_public")
    .select("first_name, display_name")
    .eq("id", senderId)
    .maybeSingle();
  return data?.display_name || data?.first_name || "Someone";
}

function makePreview(body: string): string {
  const clean = body.replace(/\s+/g, " ").trim();
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
