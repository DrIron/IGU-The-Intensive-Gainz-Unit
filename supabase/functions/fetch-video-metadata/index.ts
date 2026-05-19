/**
 * fetch-video-metadata
 *
 * Looks up duration + title for a YouTube URL via the Data API v3.
 * Loom has no public metadata API, so Loom URLs are rejected and the admin
 * falls back to manual duration entry.
 *
 * Deployed with --no-verify-jwt because we validate the Authorization header
 * ourselves and gate on admin role.
 *
 * Contract:
 *   POST body: { url: string }
 *   Caller header: Authorization: Bearer <user JWT>
 *
 *   200 OK:           { duration_seconds, title, video_id }
 *   200 NO_KEY*:      { error: "YOUTUBE_API_KEY not configured", code: "NO_KEY" }  (503)
 *   400 NOT_YOUTUBE:  { error: "Not a YouTube URL", code: "NOT_YOUTUBE" }
 *   404 NOT_FOUND:    { error: "Video not found", code: "NOT_FOUND" }
 *   401 / 403 / 502 / 500: standard error envelope.
 *
 *   * NO_KEY signals the feature is disabled. Frontend stays silent and lets
 *     the admin enter duration manually.
 */

import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const YT_ID_PATTERNS: RegExp[] = [
  /youtube\.com\/watch\?v=([A-Za-z0-9_-]{11})/,
  /youtu\.be\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/embed\/([A-Za-z0-9_-]{11})/,
  /youtube\.com\/shorts\/([A-Za-z0-9_-]{11})/,
];

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
    const youtubeApiKey = Deno.env.get("YOUTUBE_API_KEY");

    // Caller identity.
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return json({ error: "Invalid authentication" }, 401);
    }

    // Feature toggle: if no key is configured, the feature is disabled.
    if (!youtubeApiKey) {
      return json({ error: "YOUTUBE_API_KEY not configured", code: "NO_KEY" }, 503);
    }

    // Admin role gate.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: roles, error: roleError } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id);
    if (roleError) {
      console.error("[fetch-video-metadata] role lookup:", roleError.message);
      return json({ error: "Role check failed" }, 500);
    }
    const isAdmin = (roles ?? []).some((r: { role: string }) => r.role === "admin");
    if (!isAdmin) {
      return json({ error: "Admin role required" }, 403);
    }

    const body = await req.json().catch(() => null);
    const url = typeof body?.url === "string" ? body.url.trim() : "";
    if (!url) {
      return json({ error: "Missing url" }, 400);
    }

    const videoId = extractYouTubeId(url);
    if (!videoId) {
      return json({ error: "Not a YouTube URL", code: "NOT_YOUTUBE" }, 400);
    }

    const ytUrl =
      `https://www.googleapis.com/youtube/v3/videos` +
      `?id=${encodeURIComponent(videoId)}&part=contentDetails,snippet&key=${encodeURIComponent(youtubeApiKey)}`;

    const ytRes = await fetch(ytUrl);
    if (!ytRes.ok) {
      const text = await ytRes.text().catch(() => "");
      console.error(`[fetch-video-metadata] YouTube API ${ytRes.status}:`, text);
      return json({ error: "YouTube API error" }, 502);
    }
    const payload = await ytRes.json();
    const item = Array.isArray(payload?.items) ? payload.items[0] : null;
    if (!item) {
      return json({ error: "Video not found", code: "NOT_FOUND" }, 404);
    }

    const isoDuration: string | undefined = item?.contentDetails?.duration;
    const title: string | undefined = item?.snippet?.title;
    const duration_seconds = isoDuration ? parseIsoDuration(isoDuration) : null;

    return json({
      duration_seconds,
      title: title ?? null,
      video_id: videoId,
    });
  } catch (err) {
    console.error("[fetch-video-metadata] unexpected:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});

function extractYouTubeId(url: string): string | null {
  for (const pattern of YT_ID_PATTERNS) {
    const m = url.match(pattern);
    if (m && m[1]) return m[1];
  }
  return null;
}

function parseIsoDuration(iso: string): number | null {
  const m = iso.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!m) return null;
  return (
    (parseInt(m[1] ?? "0", 10) * 3600) +
    (parseInt(m[2] ?? "0", 10) * 60) +
    parseInt(m[3] ?? "0", 10)
  );
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
