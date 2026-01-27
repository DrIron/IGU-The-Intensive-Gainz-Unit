import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiting (per function instance)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX_REQUESTS = 5; // Max 5 requests per minute per user

function checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const userLimit = rateLimitMap.get(userId);

  if (!userLimit || now > userLimit.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (userLimit.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  userLimit.count++;
  return true;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[bootstrap-admin-role] No auth header provided");
      return new Response(
        JSON.stringify({ error: "Unauthorized", roles: [] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the JWT and get claims
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseUser.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.log("[bootstrap-admin-role] Invalid token:", claimsError?.message);
      return new Response(
        JSON.stringify({ error: "Invalid token", roles: [] }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub;
    const userEmail = claimsData.claims.email?.toLowerCase();

    if (!userId || !userEmail) {
      console.log("[bootstrap-admin-role] Missing user ID or email in claims");
      return new Response(
        JSON.stringify({ error: "Invalid user data", roles: [] }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Rate limit check
    if (!checkRateLimit(userId)) {
      console.log(`[bootstrap-admin-role] Rate limit exceeded for user: ${userId}`);
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded", roles: [] }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get the bootstrap emails list
    const bootstrapEmailsRaw = Deno.env.get("ADMIN_BOOTSTRAP_EMAILS") || "";
    const bootstrapEmails = bootstrapEmailsRaw
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0);

    // Create service role client for admin operations
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user email is in the bootstrap list (exact match only)
    const isInBootstrapList = bootstrapEmails.includes(userEmail);

    console.log(`[bootstrap-admin-role] User: ${userEmail}, In bootstrap list: ${isInBootstrapList}`);

    if (isInBootstrapList) {
      // Upsert admin role
      const { error: upsertError } = await supabaseAdmin
        .from("user_roles")
        .upsert(
          { user_id: userId, role: "admin" },
          { onConflict: "user_id,role" }
        );

      if (upsertError) {
        console.error("[bootstrap-admin-role] Failed to upsert admin role:", upsertError);
      } else {
        console.log(`[bootstrap-admin-role] Admin role granted to: ${userEmail}`);

        // Log to admin_audit_log
        await supabaseAdmin.from("admin_audit_log").insert({
          admin_user_id: userId,
          action_type: "admin_bootstrap",
          target_type: "user_roles",
          target_id: userId,
          details: {
            email: userEmail,
            source: "bootstrap-admin-role",
            timestamp: new Date().toISOString(),
          },
        });
      }
    }

    // Fetch current roles
    const { data: roles, error: rolesError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      console.error("[bootstrap-admin-role] Failed to fetch roles:", rolesError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch roles", roles: [] }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const roleList = roles?.map((r) => r.role) || [];
    console.log(`[bootstrap-admin-role] Returning roles for ${userEmail}:`, roleList);

    return new Response(
      JSON.stringify({
        success: true,
        bootstrapped: isInBootstrapList,
        roles: roleList,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[bootstrap-admin-role] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", roles: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
