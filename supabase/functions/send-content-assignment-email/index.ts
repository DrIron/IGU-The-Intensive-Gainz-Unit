/**
 * send-content-assignment-email
 *
 * Notifies a client by email when their coach (or an admin) assigns
 * educational content to them. Deployed with --no-verify-jwt because we
 * validate the Authorization header ourselves (gateway otherwise rejects
 * ES256 JWTs on some functions; see CLAUDE.md JWT reference table).
 *
 * Contract:
 *   POST body: { client_id: uuid, items: Array<{kind, id, title}>, due_by?, note? }
 *   Caller header: Authorization: Bearer <user JWT>
 *
 * Flow:
 *   1. Resolve the caller via the user JWT; require coach or admin role.
 *   2. Throttle: if email_notifications has a row for
 *      (user_id=client_id, notification_type='content_assignment',
 *      context_id=client_id, sent_at >= now() - WINDOW_MIN), skip.
 *      Fail open if the dedup read errors -- prefer delivering.
 *   3. Resolve recipient email + name; sender display name.
 *   4. Render email via shared template (showUnsubscribe: false --
 *      transactional, not marketing). Use "--" not "—".
 *   5. Send via Resend; log to email_notifications.
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

const itemSchema = z.object({
  kind: z.enum(["video", "playlist"]),
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

const requestSchema = z.object({
  client_id: z.string().uuid(),
  items: z.array(itemSchema).min(1).max(20),
  due_by: z.string().nullish(),
  note: z.string().max(500).nullish(),
});

const WINDOW_MINUTES = Number(
  Deno.env.get("CONTENT_ASSIGNMENT_EMAIL_WINDOW_MIN") ?? "30",
);

const NOTIFICATION_TYPE = "content_assignment";

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
    const { client_id, items, due_by, note } = parsed.data;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Role gate: coach or admin only.
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    if (roleError) {
      console.error("[send-content-assignment-email] role lookup:", roleError.message);
      return json({ error: "Role check failed" }, 500);
    }
    const isCoachOrAdmin = (roles ?? []).some(
      (r: { role: string }) => r.role === "coach" || r.role === "admin",
    );
    if (!isCoachOrAdmin) {
      return json({ error: "Coach or admin role required" }, 403);
    }

    // Throttle. Fail open on dedup-read errors.
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();
    const { data: recent, error: throttleError } = await admin
      .from("email_notifications")
      .select("id")
      .eq("user_id", client_id)
      .eq("notification_type", NOTIFICATION_TYPE)
      .eq("context_id", client_id)
      .gte("sent_at", windowStart)
      .limit(1);
    if (throttleError) {
      console.warn("[send-content-assignment-email] throttle check:", throttleError.message);
      // fall through and send
    }
    if (recent && recent.length > 0) {
      return json({ throttled: true });
    }

    // Recipient lookup.
    const [privateRes, publicRes] = await Promise.all([
      admin
        .from("profiles_private")
        .select("email")
        .eq("profile_id", client_id)
        .maybeSingle(),
      admin
        .from("profiles_public")
        .select("first_name, display_name")
        .eq("id", client_id)
        .maybeSingle(),
    ]);

    const recipientEmail = privateRes.data?.email;
    if (!recipientEmail) {
      return json({ error: "Recipient email not found" }, 404);
    }
    const recipientName =
      publicRes.data?.first_name ?? publicRes.data?.display_name ?? "there";

    // Sender name. Falls back to a generic if the caller isn't surfaced in coaches_public yet.
    const { data: senderRow } = await admin
      .from("coaches_public")
      .select("first_name, display_name")
      .eq("user_id", caller.id)
      .maybeSingle();
    const coachName =
      senderRow?.display_name || senderRow?.first_name || "Your coach";

    // Compose body.
    const itemLines = items.map((item) => {
      const label = item.kind === "video" ? "Video" : "Learning path";
      return `&bull; ${label}: ${escapeHtml(item.title)}`;
    });
    const itemsHtml = `<p style="color:#1a1a1a;font-size:16px;line-height:1.8;margin:0 0 16px 0;">${itemLines.join("<br>")}</p>`;

    const dueLine = due_by
      ? paragraph(`Due by <strong>${escapeHtml(formatDueDate(due_by))}</strong>.`)
      : "";
    const noteLine = note && note.trim()
      ? paragraph(`<em>Note from ${escapeHtml(coachName)}: ${escapeHtml(note.trim())}</em>`)
      : "";

    const previewItems = items
      .slice(0, 3)
      .map((i) => i.title)
      .join(", ");
    const preheader = `${coachName} assigned ${items.length === 1 ? "new content" : `${items.length} items`} for you${previewItems ? ` -- ${previewItems}` : ""}.`;

    const html = wrapInLayout({
      content: [
        greeting(recipientName),
        paragraph(`${escapeHtml(coachName)} just assigned new content for you to watch:`),
        itemsHtml,
        dueLine,
        noteLine,
        ctaButton("Watch now", `${APP_BASE_URL}/educational-videos`),
        signOff(),
      ].join(""),
      preheader,
      showUnsubscribe: false,
    });

    const result = await sendEmail({
      from: EMAIL_FROM_COACHING,
      to: recipientEmail,
      subject: `${coachName} assigned new content for you`,
      html,
    });

    if (!result.success) {
      console.error("[send-content-assignment-email] sendEmail error:", result.error ?? "unknown");
      return json({ error: "Email send failed" }, 502);
    }

    const { error: logError } = await admin
      .from("email_notifications")
      .insert({
        user_id: client_id,
        notification_type: NOTIFICATION_TYPE,
        context_id: client_id,
        sent_at: new Date().toISOString(),
        status: "sent",
      });
    if (logError) {
      console.error("[send-content-assignment-email] email_notifications insert:", logError.message);
    }

    return json({ sent: true });
  } catch (err) {
    console.error("[send-content-assignment-email] unexpected:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDueDate(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
