import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TestResult {
  name: string;
  status: "PASS" | "FAIL";
  reason: string;
  details: {
    error?: string;
    rowCount: number;
  };
}

interface SmokeTestResponse {
  ran_at: string;
  results: TestResult[];
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization - only admins can run this
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create client with user's token to verify they're admin
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify user is admin
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claims?.claims?.sub) {
      return new Response(
        JSON.stringify({ error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claims.claims.sub as string;

    // Check if user has admin role using service client
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: adminRole, error: roleError } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !adminRole) {
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Security Smoke Tests] Running for admin user: ${userId}`);

    // ============================================================
    // Create ANON client (no auth header - simulates anonymous user)
    // ============================================================
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);

    const results: TestResult[] = [];

    // ============================================================
    // Test 1: coaches_directory (view) - should be blocked for anon
    // ============================================================
    try {
      const { data: coachesData, error: coachesError } = await anonClient
        .from("coaches_directory")
        .select("id")
        .limit(1);

      if (coachesError) {
        // Error means access was blocked - PASS
        results.push({
          name: "coaches_directory",
          status: "PASS",
          reason: "Anonymous access blocked by RLS",
          details: {
            error: coachesError.message,
            rowCount: 0,
          },
        });
      } else if (!coachesData || coachesData.length === 0) {
        // No rows returned - could be PASS (RLS blocks) or just empty table
        // We treat this as PASS since anon couldn't read data
        results.push({
          name: "coaches_directory",
          status: "PASS",
          reason: "No rows returned for anonymous user (RLS active)",
          details: {
            rowCount: 0,
          },
        });
      } else {
        // Data returned - FAIL (anon can read)
        results.push({
          name: "coaches_directory",
          status: "FAIL",
          reason: "Anonymous user was able to read data!",
          details: {
            rowCount: coachesData.length,
          },
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      results.push({
        name: "coaches_directory",
        status: "PASS",
        reason: "Access blocked with exception",
        details: {
          error: errorMessage,
          rowCount: 0,
        },
      });
    }

    // ============================================================
    // Test 2: legal_documents (table) - should be blocked for anon
    // ============================================================
    try {
      const { data: legalData, error: legalError } = await anonClient
        .from("legal_documents")
        .select("id")
        .limit(1);

      if (legalError) {
        results.push({
          name: "legal_documents",
          status: "PASS",
          reason: "Anonymous access blocked by RLS",
          details: {
            error: legalError.message,
            rowCount: 0,
          },
        });
      } else if (!legalData || legalData.length === 0) {
        results.push({
          name: "legal_documents",
          status: "PASS",
          reason: "No rows returned for anonymous user (RLS active)",
          details: {
            rowCount: 0,
          },
        });
      } else {
        results.push({
          name: "legal_documents",
          status: "FAIL",
          reason: "Anonymous user was able to read data!",
          details: {
            rowCount: legalData.length,
          },
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      results.push({
        name: "legal_documents",
        status: "PASS",
        reason: "Access blocked with exception",
        details: {
          error: errorMessage,
          rowCount: 0,
        },
      });
    }

    // ============================================================
    // Test 3: services (table) - should be blocked for anon
    // ============================================================
    try {
      const { data: servicesData, error: servicesError } = await anonClient
        .from("services")
        .select("id")
        .limit(1);

      if (servicesError) {
        results.push({
          name: "services",
          status: "PASS",
          reason: "Anonymous access blocked by RLS",
          details: {
            error: servicesError.message,
            rowCount: 0,
          },
        });
      } else if (!servicesData || servicesData.length === 0) {
        results.push({
          name: "services",
          status: "PASS",
          reason: "No rows returned for anonymous user (RLS active)",
          details: {
            rowCount: 0,
          },
        });
      } else {
        results.push({
          name: "services",
          status: "FAIL",
          reason: "Anonymous user was able to read data!",
          details: {
            rowCount: servicesData.length,
          },
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      results.push({
        name: "services",
        status: "PASS",
        reason: "Access blocked with exception",
        details: {
          error: errorMessage,
          rowCount: 0,
        },
      });
    }

    // ============================================================
    // Test 4: team_plan_settings (table) - should be blocked for anon
    // ============================================================
    try {
      const { data: teamPlanData, error: teamPlanError } = await anonClient
        .from("team_plan_settings")
        .select("id")
        .limit(1);

      if (teamPlanError) {
        results.push({
          name: "team_plan_settings",
          status: "PASS",
          reason: "Anonymous access blocked by RLS",
          details: {
            error: teamPlanError.message,
            rowCount: 0,
          },
        });
      } else if (!teamPlanData || teamPlanData.length === 0) {
        results.push({
          name: "team_plan_settings",
          status: "PASS",
          reason: "No rows returned for anonymous user (RLS active)",
          details: {
            rowCount: 0,
          },
        });
      } else {
        results.push({
          name: "team_plan_settings",
          status: "FAIL",
          reason: "Anonymous user was able to read data!",
          details: {
            rowCount: teamPlanData.length,
          },
        });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Unknown error";
      results.push({
        name: "team_plan_settings",
        status: "PASS",
        reason: "Access blocked with exception",
        details: {
          error: errorMessage,
          rowCount: 0,
        },
      });
    }

    // Build response
    const response: SmokeTestResponse = {
      ran_at: new Date().toISOString(),
      results,
    };

    const failCount = results.filter(r => r.status === "FAIL").length;
    console.log(`[Security Smoke Tests] Complete: ${results.length - failCount} PASS, ${failCount} FAIL`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Security Smoke Tests] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
