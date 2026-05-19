/**
 * send-content-link-email
 *
 * Notifies clients by email when a coach (or admin) links educational
 * content to a program template they're following, or to their active
 * nutrition phase. Deployed with --no-verify-jwt because we validate
 * the Authorization header ourselves (see CLAUDE.md JWT reference table).
 *
 * Contract:
 *   POST body: {
 *     target: { kind: "program-template" | "nutrition-phase"; id: uuid; title: string },
 *     items:  Array<{ kind: "video" | "playlist"; id: uuid; title: string }>,  // 1..20
 *     note?:  string | null
 *   }
 *   Caller header: Authorization: Bearer <user JWT>
 *
 * Flow:
 *   1. Resolve the caller via the user JWT; require coach or admin role.
 *   2. Resolve recipients:
 *      - program-template -> distinct user_ids of active client_programs with this source_template_id
 *      - nutrition-phase  -> the single user_id on that phase row
 *   3. For each recipient, throttle on (user_id, notification_type, context_id=target.id, sent_at).
 *      Fail open if the dedup read errors -- prefer delivering.
 *   4. Render email via shared template (showUnsubscribe: false -- transactional). Use "--" not "—".
 *   5. Send via Resend; log to email_notifications.
 *   6. Return { sent, throttled, missing_email, error_count, recipients_total }.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { EMAIL_FROM_COACHING, APP_BASE_URL } from "../_shared/config.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import { greeting, paragraph, ctaButton, signOff } from "../_shared/emailComponents.ts";
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

const targetSchema = z.object({
  kind: z.enum(["program-template", "nutrition-phase"]),
  id: z.string().uuid(),
  title: z.string().min(1).max(200),
});

const requestSchema = z.object({
  target: targetSchema,
  items: z.array(itemSchema).min(1).max(20),
  note: z.string().max(500).nullish(),
});

const WINDOW_MINUTES = Number(Deno.env.get("CONTENT_LINK_EMAIL_WINDOW_MIN") ?? "30");

const NOTIFICATION_TYPE_PROGRAM = "content_link_program";
const NOTIFICATION_TYPE_PHASE = "content_link_phase";

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
    const { target, items, note } = parsed.data;

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Role gate: coach or admin only.
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    if (roleError) {
      console.error("[send-content-link-email] role lookup:", roleError.message);
      return json({ error: "Role check failed" }, 500);
    }
    const isCoachOrAdmin = (roles ?? []).some(
      (r: { role: string }) => r.role === "coach" || r.role === "admin",
    );
    if (!isCoachOrAdmin) {
      return json({ error: "Coach or admin role required" }, 403);
    }

    // Resolve recipients.
    const recipients = new Set<string>();
    if (target.kind === "program-template") {
      const { data: rows, error: recipErr } = await admin
        .from("client_programs")
        .select("user_id")
        .eq("source_template_id", target.id)
        .eq("status", "active");
      if (recipErr) {
        console.error("[send-content-link-email] recipient lookup (program):", recipErr.message);
        return json({ error: "Recipient lookup failed" }, 500);
      }
      for (const row of rows ?? []) {
        if (row.user_id) recipients.add(row.user_id);
      }
    } else {
      const { data: phaseRow, error: phaseErr } = await admin
        .from("nutrition_phases")
        .select("user_id")
        .eq("id", target.id)
        .maybeSingle();
      if (phaseErr) {
        console.error("[send-content-link-email] recipient lookup (phase):", phaseErr.message);
        return json({ error: "Recipient lookup failed" }, 500);
      }
      if (!phaseRow) {
        return json({ error: "Nutrition phase not found" }, 404);
      }
      recipients.add(phaseRow.user_id);
    }

    const recipientsTotal = recipients.size;
    if (recipientsTotal === 0) {
      return json({ sent: 0, throttled: 0, missing_email: 0, error_count: 0, recipients_total: 0 });
    }

    // Sender display name. Same fallback chain as send-content-assignment-email.
    const { data: senderRow } = await admin
      .from("coaches_public")
      .select("first_name, display_name")
      .eq("user_id", caller.id)
      .maybeSingle();
    const coachName = senderRow?.display_name || senderRow?.first_name || "Your coach";

    const notificationType =
      target.kind === "program-template" ? NOTIFICATION_TYPE_PROGRAM : NOTIFICATION_TYPE_PHASE;
    const windowStart = new Date(Date.now() - WINDOW_MINUTES * 60_000).toISOString();

    const itemLines = items.map((item) => {
      const label = item.kind === "video" ? "Video" : "Learning path";
      return `&bull; ${label}: ${escapeHtml(item.title)}`;
    });
    const itemsHtml = `<p style="color:#1a1a1a;font-size:16px;line-height:1.8;margin:0 0 16px 0;">${itemLines.join("<br>")}</p>`;
    const noteLine =
      note && note.trim()
        ? paragraph(`<em>Note from ${escapeHtml(coachName)}: ${escapeHtml(note.trim())}</em>`)
        : "";
    const previewItems = items.slice(0, 3).map((i) => i.title).join(", ");
    const preheader = `${items.length} new ${items.length === 1 ? "item" : "items"} ready to watch${previewItems ? ` -- ${previewItems}` : ""}.`;

    const subject =
      target.kind === "program-template"
        ? `New content for ${target.title}`
        : `New content for your current phase`;
    const introLine =
      target.kind === "program-template"
        ? `${escapeHtml(coachName)} added new recommended content for <strong>${escapeHtml(target.title)}</strong>, which you're currently following:`
        : `${escapeHtml(coachName)} added new recommended content for your current nutrition phase:`;

    let sent = 0;
    let throttled = 0;
    let missingEmail = 0;
    let errorCount = 0;

    for (const recipientId of recipients) {
      try {
        // Throttle. Fail open on dedup-read errors.
        const { data: recent, error: throttleErr } = await admin
          .from("email_notifications")
          .select("id")
          .eq("user_id", recipientId)
          .eq("notification_type", notificationType)
          .eq("context_id", target.id)
          .gte("sent_at", windowStart)
          .limit(1);
        if (throttleErr) {
          console.warn(
            "[send-content-link-email] throttle check (fail-open):",
            throttleErr.message,
          );
        }
        if (recent && recent.length > 0) {
          throttled++;
          continue;
        }

        const [privateRes, publicRes] = await Promise.all([
          admin
            .from("profiles_private")
            .select("email")
            .eq("profile_id", recipientId)
            .maybeSingle(),
          admin
            .from("profiles_public")
            .select("first_name, display_name")
            .eq("id", recipientId)
            .maybeSingle(),
        ]);

        const recipientEmail = privateRes.data?.email;
        if (!recipientEmail) {
          missingEmail++;
          continue;
        }
        const recipientName =
          publicRes.data?.first_name ?? publicRes.data?.display_name ?? "there";

        const html = wrapInLayout({
          content: [
            greeting(recipientName),
            paragraph(introLine),
            itemsHtml,
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
          subject,
          html,
        });

        if (!result.success) {
          console.error(
            "[send-content-link-email] sendEmail error:",
            result.error ?? "unknown",
          );
          errorCount++;
          continue;
        }

        const { error: logError } = await admin.from("email_notifications").insert({
          user_id: recipientId,
          notification_type: notificationType,
          context_id: target.id,
          sent_at: new Date().toISOString(),
          status: "sent",
        });
        if (logError) {
          console.error(
            "[send-content-link-email] email_notifications insert:",
            logError.message,
          );
        }
        sent++;
      } catch (loopErr) {
        console.error("[send-content-link-email] recipient loop:", loopErr);
        errorCount++;
      }
    }

    return json({
      sent,
      throttled,
      missing_email: missingEmail,
      error_count: errorCount,
      recipients_total: recipientsTotal,
    });
  } catch (err) {
    console.error("[send-content-link-email] unexpected:", err);
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

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
