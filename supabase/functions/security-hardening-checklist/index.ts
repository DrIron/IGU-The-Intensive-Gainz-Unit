import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get auth token from request
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[security-hardening-checklist] Missing authorization header");
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create client with user's token to verify identity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get the user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("[security-hardening-checklist] Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is admin using service role client
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: roleData, error: roleError } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();

    if (roleError || !roleData) {
      console.error("[security-hardening-checklist] Not admin:", user.id);
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("[security-hardening-checklist] Running checks for admin:", user.email);

    // Run security audit queries using service role
    const results: {
      tablesWithoutRLS: Array<{ table_name: string }>;
      viewsWithoutSecurityInvoker: Array<{ view_name: string; reloptions: string[] | null }>;
      policiesWithTrueQual: Array<{
        schemaname: string;
        tablename: string;
        policyname: string;
        cmd: string;
        roles: string[];
        qual: string;
      }>;
      timestamp: string;
    } = {
      tablesWithoutRLS: [],
      viewsWithoutSecurityInvoker: [],
      policiesWithTrueQual: [],
      timestamp: new Date().toISOString(),
    };

    // A) Tables without RLS enabled
    const { data: tablesData, error: tablesError } = await serviceClient.rpc(
      "get_tables_without_rls"
    );
    if (tablesError) {
      console.error("[security-hardening-checklist] Tables query error:", tablesError);
    } else {
      results.tablesWithoutRLS = tablesData || [];
    }

    // B) Views without security_invoker
    const { data: viewsData, error: viewsError } = await serviceClient.rpc(
      "get_views_without_security_invoker"
    );
    if (viewsError) {
      console.error("[security-hardening-checklist] Views query error:", viewsError);
    } else {
      results.viewsWithoutSecurityInvoker = viewsData || [];
    }

    // C) Policies with USING (true)
    const { data: policiesData, error: policiesError } = await serviceClient.rpc(
      "get_policies_with_true_qual"
    );
    if (policiesError) {
      console.error("[security-hardening-checklist] Policies query error:", policiesError);
    } else {
      results.policiesWithTrueQual = policiesData || [];
    }

    console.log("[security-hardening-checklist] Results:", {
      tablesWithoutRLS: results.tablesWithoutRLS.length,
      viewsWithoutSecurityInvoker: results.viewsWithoutSecurityInvoker.length,
      policiesWithTrueQual: results.policiesWithTrueQual.length,
    });

    return new Response(JSON.stringify(results), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[security-hardening-checklist] Error:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
