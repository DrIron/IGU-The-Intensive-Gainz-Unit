/**
 * submit-lead
 *
 * B10-N1: bot defense for the anon-writable `leads` table.
 *
 * The Waitlist + Footer-newsletter forms used to INSERT into `leads` directly
 * from the browser (anon RLS policy allows it). Client-side Turnstile alone is
 * bypassable -- anyone can POST to the PostgREST endpoint with no token. This
 * function moves the legitimate FE write behind a SERVER-SIDE Turnstile check:
 * the token is verified against Cloudflare before the row is inserted with the
 * service-role client.
 *
 * Deployed with --no-verify-jwt (anon callable -- public marketing forms).
 *
 * Contract:
 *   POST body: {
 *     email: string,
 *     name?: string | null,
 *     source: "waitlist" | "newsletter" | string,
 *     utm_source?, utm_medium?, utm_campaign?, utm_content?, utm_term?,
 *     turnstile_token?: string | null
 *   }
 *   Responses:
 *     200 { success: true }          -- inserted OR already-on-list (identical
 *                                       shape, no info leakage about duplicates)
 *     400 { error: "Bot check failed" }
 *     400 { error: "Invalid request" }
 *     429 { error: "Too many requests..." }
 *     500 { error: "Failed to submit" }
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Mirror the leads CHECK constraint (migration 20260420100000) so we reject
// junk before it reaches the DB; the constraint still applies as the backstop.
const requestSchema = z.object({
  email: z.string().email().max(254).trim().toLowerCase(),
  name: z.string().max(200).trim().nullish(),
  source: z.string().min(1).max(64),
  utm_source: z.string().max(128).nullish(),
  utm_medium: z.string().max(128).nullish(),
  utm_campaign: z.string().max(128).nullish(),
  utm_content: z.string().max(128).nullish(),
  utm_term: z.string().max(128).nullish(),
  turnstile_token: z.string().max(2048).nullish(),
});

const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Verify a Turnstile token against Cloudflare.
 *
 * If TURNSTILE_SECRET_KEY is not provisioned (local/preview without the secret),
 * verification is skipped so dev forms still work -- prod always has the secret,
 * so enforcement is active there. A skip is logged for visibility.
 */
async function verifyTurnstile(token: string | null | undefined, ip: string): Promise<boolean> {
  const secret = Deno.env.get("TURNSTILE_SECRET_KEY");
  if (!secret) {
    console.warn("submit-lead: TURNSTILE_SECRET_KEY not set -- skipping bot check (dev fallback)");
    return true;
  }
  if (!token) return false;

  try {
    const form = new URLSearchParams();
    form.append("secret", secret);
    form.append("response", token);
    if (ip && ip !== "unknown") form.append("remoteip", ip);

    const res = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
    const data = await res.json();
    return data?.success === true;
  } catch (err) {
    console.error("submit-lead: Turnstile verification request failed:", err);
    return false;
  }
}

serve(async (req) => {
  // OPTIONS preflight MUST be handled before req.json() (no body to parse).
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Best-effort rate limit: 5 submissions / minute / IP.
  const ip = getClientIp(req);
  const rateCheck = checkRateLimit(ip, 5, 60_000);
  if (!rateCheck.allowed) {
    return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
  }

  try {
    const body = await req.json();
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: "Invalid request" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const { turnstile_token, ...lead } = parsed.data;

    // 1. Server-side bot check.
    const human = await verifyTurnstile(turnstile_token, ip);
    if (!human) {
      return new Response(
        JSON.stringify({ error: "Bot check failed" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // 2. Insert with the service-role client. RLS is bypassed, but the leads
    //    CHECK constraint (email regex + length caps) still applies.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { error } = await supabase.from("leads").insert({
      email: lead.email,
      name: lead.name ?? null,
      source: lead.source,
      utm_source: lead.utm_source ?? null,
      utm_medium: lead.utm_medium ?? null,
      utm_campaign: lead.utm_campaign ?? null,
      utm_content: lead.utm_content ?? null,
      utm_term: lead.utm_term ?? null,
    });

    // 23505 = duplicate email (UNIQUE on leads.email). Return the SAME success
    // shape as a fresh insert so the response never reveals whether the address
    // was already on the list.
    const isDuplicate = error?.code === "23505";
    if (error && !isDuplicate) {
      throw error;
    }

    // 3. Fire the waitlist confirmation only for genuinely NEW waitlist signups.
    //    send-waitlist-confirmation still owns the email; we invoke it edge-to-edge
    //    (fire-and-forget). Skipping on duplicates avoids re-emailing on resubmit
    //    without leaking duplicate status to the caller.
    if (!isDuplicate && lead.source === "waitlist") {
      supabase.functions
        .invoke("send-waitlist-confirmation", {
          body: { email: lead.email, name: lead.name || "there" },
        })
        .catch((err: unknown) => {
          console.error("submit-lead: waitlist confirmation email failed:", err);
        });
    }

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("submit-lead: failed to submit lead:", message);
    return new Response(
      JSON.stringify({ error: "Failed to submit" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
