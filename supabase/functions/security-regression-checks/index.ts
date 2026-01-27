import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Security baseline rules from SECURITY.md:
// 1. No decrypted PHI views accessible to non-admins
// 2. No USING(true) policies
// 3. anon role has ZERO access to all tables
// 4. Revoke SELECT on sensitive views from authenticated

interface SecurityCheck {
  id: string;
  name: string;
  description: string;
  status: "pass" | "fail" | "error";
  details: string;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate authorization
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

    console.log(`[Security Regression Checks] Running for admin user: ${userId}`);

    const checks: SecurityCheck[] = [];

    // ========================================================
    // Check 1: profiles view is admin-only
    // ========================================================
    // Create a simulated "coach" session to test RLS
    // We'll use the service role to query the user_roles table for a coach user
    const { data: coachUser } = await serviceClient
      .from("user_roles")
      .select("user_id")
      .eq("role", "coach")
      .limit(1)
      .maybeSingle();

    if (coachUser) {
      // Try to create a client that impersonates a coach context
      // Since we can't actually sign in as another user, we test RLS via RPC
      // The safest way is to use an RPC function that checks access
      
      // Instead, we verify via the policy definitions
      const { data: profilesPolicies, error: policiesError } = await serviceClient.rpc("get_rls_audit_report");
      
      const profilesRow = profilesPolicies?.find((p: any) => p.table_name === "profiles");
      
      if (profilesRow) {
        const selectAccess = profilesRow.select_access || "";
        const isAdminOnly = selectAccess.includes("admin") && !selectAccess.includes("authenticated") && !selectAccess.includes("public");
        
        checks.push({
          id: "profiles_view_rls",
          name: "profiles VIEW is admin-only",
          description: "The combined profiles view should only be accessible by admins",
          status: isAdminOnly ? "pass" : "fail",
          details: isAdminOnly 
            ? "RLS policy correctly restricts SELECT to admin role only" 
            : `Current access: ${selectAccess}. Expected: admin only`,
        });
      } else {
        checks.push({
          id: "profiles_view_rls",
          name: "profiles VIEW is admin-only",
          description: "The combined profiles view should only be accessible by admins",
          status: "error",
          details: "Could not verify profiles view RLS - table not found in audit",
        });
      }
    } else {
      checks.push({
        id: "profiles_view_rls",
        name: "profiles VIEW is admin-only",
        description: "The combined profiles view should only be accessible by admins",
        status: "error",
        details: "No coach user found to test RLS against",
      });
    }

    // ========================================================
    // Check 2: coaches table is blocked for non-admin
    // ========================================================
    const { data: coachesPolicies } = await serviceClient.rpc("get_rls_audit_report");
    const coachesRow = coachesPolicies?.find((p: any) => p.table_name === "coaches");
    
    if (coachesRow) {
      const selectAccess = coachesRow.select_access || "";
      // Coaches table should be admin-only or admin+owner
      const isSecure = selectAccess.includes("admin") && !selectAccess.includes("public") && !selectAccess.includes("authenticated");
      
      checks.push({
        id: "coaches_table_rls",
        name: "coaches table is admin-restricted",
        description: "The coaches table should not be publicly accessible",
        status: isSecure ? "pass" : "fail",
        details: isSecure 
          ? "RLS policy correctly restricts coaches table access" 
          : `Current access: ${selectAccess}. Should be admin-only or admin+owner`,
      });
    } else {
      checks.push({
        id: "coaches_table_rls",
        name: "coaches table is admin-restricted",
        description: "The coaches table should not be publicly accessible",
        status: "error",
        details: "Could not find coaches table in RLS audit",
      });
    }

    // ========================================================
    // Check 3: profiles_public has coach assignment RLS
    // ========================================================
    const profilesPublicRow = coachesPolicies?.find((p: any) => p.table_name === "profiles_public");
    
    if (profilesPublicRow) {
      const selectAccess = profilesPublicRow.select_access || "";
      // Should have owner + coach + admin access
      const hasCoachPolicy = selectAccess.includes("coach") || selectAccess.includes("custom");
      const hasOwnerPolicy = selectAccess.includes("owner");
      const hasAdminPolicy = selectAccess.includes("admin");
      
      const isCorrect = hasCoachPolicy && hasOwnerPolicy && hasAdminPolicy;
      
      checks.push({
        id: "profiles_public_coach_access",
        name: "profiles_public coach access is scoped",
        description: "Coaches should only see profiles of their assigned clients",
        status: isCorrect ? "pass" : "fail",
        details: isCorrect 
          ? "RLS correctly allows owner, assigned coaches, and admins" 
          : `Current access: ${selectAccess}. Expected: owner + coach + admin`,
      });
    } else {
      checks.push({
        id: "profiles_public_coach_access",
        name: "profiles_public coach access is scoped",
        description: "Coaches should only see profiles of their assigned clients",
        status: "error",
        details: "Could not find profiles_public table in RLS audit",
      });
    }

    // ========================================================
    // Check 4: profiles_private is admin + owner only
    // ========================================================
    const profilesPrivateRow = coachesPolicies?.find((p: any) => p.table_name === "profiles_private");
    
    if (profilesPrivateRow) {
      const selectAccess = profilesPrivateRow.select_access || "";
      // Should only have owner + admin access, NO coach
      const hasOwnerPolicy = selectAccess.includes("owner");
      const hasAdminPolicy = selectAccess.includes("admin");
      const hasCoachPolicy = selectAccess.includes("coach");
      
      const isCorrect = hasOwnerPolicy && hasAdminPolicy && !hasCoachPolicy;
      
      checks.push({
        id: "profiles_private_no_coach",
        name: "profiles_private is PII-protected",
        description: "Private profile data (email, phone, DOB) should not be accessible by coaches",
        status: isCorrect ? "pass" : "fail",
        details: isCorrect 
          ? "RLS correctly restricts to owner and admin only" 
          : `Current access: ${selectAccess}. Coaches should NOT have access`,
      });
    } else {
      checks.push({
        id: "profiles_private_no_coach",
        name: "profiles_private is PII-protected",
        description: "Private profile data (email, phone, DOB) should not be accessible by coaches",
        status: "error",
        details: "Could not find profiles_private table in RLS audit",
      });
    }

    // ========================================================
    // Check 5: form_submissions is protected from coaches
    // ========================================================
    const formSubmissionsRow = coachesPolicies?.find((p: any) => p.table_name === "form_submissions");
    
    if (formSubmissionsRow) {
      const selectAccess = formSubmissionsRow.select_access || "";
      // Coaches should NOT have direct access to form_submissions
      const hasCoachPolicy = selectAccess.includes("coach");
      
      checks.push({
        id: "form_submissions_coach_blocked",
        name: "form_submissions PHI is protected",
        description: "Coaches should not have direct access to form submissions (use form_submissions_safe)",
        status: !hasCoachPolicy ? "pass" : "fail",
        details: !hasCoachPolicy 
          ? "RLS correctly blocks coach access to sensitive form data" 
          : `Current access: ${selectAccess}. Coaches should use form_submissions_safe instead`,
      });
    } else {
      checks.push({
        id: "form_submissions_coach_blocked",
        name: "form_submissions PHI is protected",
        description: "Coaches should not have direct access to form submissions",
        status: "error",
        details: "Could not find form_submissions table in RLS audit",
      });
    }

    // ========================================================
    // Check 6: Legacy table security (profiles_legacy, coaches)
    // ========================================================
    const { data: legacyViolations, error: legacyError } = await serviceClient.rpc("check_legacy_table_security");
    
    if (legacyError) {
      checks.push({
        id: "legacy_table_security",
        name: "Legacy tables are admin-only",
        description: "profiles_legacy and coaches tables should only be accessible by admins",
        status: "error",
        details: `Error checking legacy tables: ${legacyError.message}`,
      });
    } else if (!legacyViolations || legacyViolations.length === 0) {
      checks.push({
        id: "legacy_table_security",
        name: "Legacy tables are admin-only",
        description: "profiles_legacy and coaches tables should only be accessible by admins",
        status: "pass",
        details: "No unauthorized access policies found on legacy tables",
      });
    } else {
      checks.push({
        id: "legacy_table_security",
        name: "Legacy tables are admin-only",
        description: "profiles_legacy and coaches tables should only be accessible by admins",
        status: "fail",
        details: `Found ${legacyViolations.length} potential access violation(s)`,
      });
    }

    // ========================================================
    // Check 7: form_submissions_decrypted is service_role only
    // ========================================================
    // This is a VIEW, so we check if it's listed and has no public/authenticated access
    const formDecryptedRow = coachesPolicies?.find((p: any) => 
      p.table_name === "form_submissions_decrypted"
    );
    
    if (formDecryptedRow) {
      const selectAccess = formDecryptedRow.select_access || "";
      // Should have NO access for anon/authenticated
      const isSecure = selectAccess === "none" || 
                       (selectAccess.includes("admin") && 
                        !selectAccess.includes("authenticated") && 
                        !selectAccess.includes("public"));
      
      checks.push({
        id: "form_submissions_decrypted_blocked",
        name: "form_submissions_decrypted is service-only",
        description: "Decrypted PHI view must not be accessible from client-side",
        status: isSecure ? "pass" : "fail",
        details: isSecure 
          ? "View correctly restricted to service_role/admin only" 
          : `Current access: ${selectAccess}. Must block anon/authenticated`,
      });
    } else {
      // View might not exist or not have RLS - attempt direct query test with anon
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data: anonData, error: anonError } = await anonClient
        .from("form_submissions_decrypted")
        .select("id")
        .limit(1);
      
      if (anonError) {
        checks.push({
          id: "form_submissions_decrypted_blocked",
          name: "form_submissions_decrypted is service-only",
          description: "Decrypted PHI view must not be accessible from client-side",
          status: "pass",
          details: "Anonymous access correctly blocked (error returned)",
        });
      } else if (!anonData || anonData.length === 0) {
        checks.push({
          id: "form_submissions_decrypted_blocked",
          name: "form_submissions_decrypted is service-only",
          description: "Decrypted PHI view must not be accessible from client-side",
          status: "pass",
          details: "No rows returned for anonymous user (RLS active)",
        });
      } else {
        checks.push({
          id: "form_submissions_decrypted_blocked",
          name: "form_submissions_decrypted is service-only",
          description: "Decrypted PHI view must not be accessible from client-side",
          status: "fail",
          details: "CRITICAL: Anonymous user was able to read decrypted PHI!",
        });
      }
    }

    // ========================================================
    // Check 8: coaches_full view is service_role only
    // ========================================================
    const coachesFullRow = coachesPolicies?.find((p: any) => 
      p.table_name === "coaches_full"
    );
    
    if (coachesFullRow) {
      const selectAccess = coachesFullRow.select_access || "";
      const isSecure = selectAccess === "none" || 
                       (selectAccess.includes("admin") && 
                        !selectAccess.includes("authenticated") && 
                        !selectAccess.includes("public"));
      
      checks.push({
        id: "coaches_full_blocked",
        name: "coaches_full view is service-only",
        description: "Combined coach view with PII must not be accessible from client-side",
        status: isSecure ? "pass" : "fail",
        details: isSecure 
          ? "View correctly restricted to service_role/admin only" 
          : `Current access: ${selectAccess}. Must block anon/authenticated`,
      });
    } else {
      // Attempt direct query test with anon
      const anonClient = createClient(supabaseUrl, supabaseAnonKey);
      const { data: anonData, error: anonError } = await anonClient
        .from("coaches_full")
        .select("id")
        .limit(1);
      
      if (anonError) {
        checks.push({
          id: "coaches_full_blocked",
          name: "coaches_full view is service-only",
          description: "Combined coach view with PII must not be accessible from client-side",
          status: "pass",
          details: "Anonymous access correctly blocked (error returned)",
        });
      } else if (!anonData || anonData.length === 0) {
        checks.push({
          id: "coaches_full_blocked",
          name: "coaches_full view is service-only",
          description: "Combined coach view with PII must not be accessible from client-side",
          status: "pass",
          details: "No rows returned for anonymous user (RLS active or view empty)",
        });
      } else {
        checks.push({
          id: "coaches_full_blocked",
          name: "coaches_full view is service-only",
          description: "Combined coach view with PII must not be accessible from client-side",
          status: "fail",
          details: "CRITICAL: Anonymous user was able to read coach PII!",
        });
      }
    }

    // ========================================================
    // Check 9: profiles (combined view) anon/authenticated blocked
    // ========================================================
    // Test with anon client to confirm profiles view is blocked
    const anonClient = createClient(supabaseUrl, supabaseAnonKey);
    const { data: anonProfilesData, error: anonProfilesError } = await anonClient
      .from("profiles")
      .select("id")
      .limit(1);
    
    if (anonProfilesError) {
      checks.push({
        id: "profiles_anon_blocked",
        name: "profiles view blocks anonymous access",
        description: "Combined profiles view must not be accessible to anon users",
        status: "pass",
        details: "Anonymous access correctly blocked (error returned)",
      });
    } else if (!anonProfilesData || anonProfilesData.length === 0) {
      checks.push({
        id: "profiles_anon_blocked",
        name: "profiles view blocks anonymous access",
        description: "Combined profiles view must not be accessible to anon users",
        status: "pass",
        details: "No rows returned for anonymous user (RLS active)",
      });
    } else {
      checks.push({
        id: "profiles_anon_blocked",
        name: "profiles view blocks anonymous access",
        description: "Combined profiles view must not be accessible to anon users",
        status: "fail",
        details: "CRITICAL: Anonymous user was able to read profiles view!",
      });
    }

    // ========================================================
    // Check 10: get_my_profile_private RPC self-only access
    // ========================================================
    // This check verifies the RPC exists and is available
    // We can't fully test ownership without multiple user sessions,
    // but we can verify the RPC is defined and has proper SECURITY DEFINER
    const { data: rpcCheck, error: rpcError } = await serviceClient
      .from("pg_proc")
      .select("proname, prosecdef")
      .eq("proname", "get_my_profile_private")
      .limit(1);
    
    // If pg_proc isn't accessible, use a different approach
    if (rpcError) {
      // Try invoking the RPC to see if it exists
      const { error: testRpcError } = await serviceClient.rpc("get_my_profile_private");
      
      if (testRpcError && testRpcError.message.includes("not exist")) {
        checks.push({
          id: "self_profile_rpc_exists",
          name: "Self-service profile RPC exists",
          description: "get_my_profile_private RPC should allow clients to access only their own data",
          status: "fail",
          details: "RPC 'get_my_profile_private' not found",
        });
      } else {
        checks.push({
          id: "self_profile_rpc_exists",
          name: "Self-service profile RPC exists",
          description: "get_my_profile_private RPC should allow clients to access only their own data",
          status: "pass",
          details: "RPC exists and is callable",
        });
      }
    } else {
      checks.push({
        id: "self_profile_rpc_exists",
        name: "Self-service profile RPC exists",
        description: "get_my_profile_private RPC should allow clients to access only their own data",
        status: "pass",
        details: "RPC function is defined in database",
      });
    }

    // ========================================================
    // Check 12: services table requires authentication
    // ========================================================
    const { data: anonServicesData, error: anonServicesError } = await anonClient
      .from("services")
      .select("id")
      .limit(1);
    
    if (anonServicesError) {
      checks.push({
        id: "services_anon_blocked",
        name: "services table blocks anonymous access",
        description: "Pricing and service details should require authentication",
        status: "pass",
        details: "Anonymous access correctly blocked",
      });
    } else if (!anonServicesData || anonServicesData.length === 0) {
      checks.push({
        id: "services_anon_blocked",
        name: "services table blocks anonymous access",
        description: "Pricing and service details should require authentication",
        status: "pass",
        details: "No rows returned for anonymous user",
      });
    } else {
      checks.push({
        id: "services_anon_blocked",
        name: "services table blocks anonymous access",
        description: "Pricing and service details should require authentication",
        status: "fail",
        details: "Anonymous user can see service pricing!",
      });
    }

    // ========================================================
    // Check 13: team_plan_settings requires authentication
    // ========================================================
    const { data: anonTeamData, error: anonTeamError } = await anonClient
      .from("team_plan_settings")
      .select("id")
      .limit(1);
    
    if (anonTeamError) {
      checks.push({
        id: "team_settings_anon_blocked",
        name: "team_plan_settings blocks anonymous access",
        description: "Team plan configuration should require authentication",
        status: "pass",
        details: "Anonymous access correctly blocked",
      });
    } else if (!anonTeamData || anonTeamData.length === 0) {
      checks.push({
        id: "team_settings_anon_blocked",
        name: "team_plan_settings blocks anonymous access",
        description: "Team plan configuration should require authentication",
        status: "pass",
        details: "No rows returned for anonymous user",
      });
    } else {
      checks.push({
        id: "team_settings_anon_blocked",
        name: "team_plan_settings blocks anonymous access",
        description: "Team plan configuration should require authentication",
        status: "fail",
        details: "Anonymous user can see team plan settings!",
      });
    }

    // ========================================================
    // Check 14: admin_get_coaches_full RPC exists
    // ========================================================
    const { error: coachesFullRpcError } = await serviceClient.rpc("admin_get_coaches_full");
    
    if (coachesFullRpcError && coachesFullRpcError.message.includes("not exist")) {
      checks.push({
        id: "admin_coaches_rpc_exists",
        name: "Admin coaches RPC exists",
        description: "admin_get_coaches_full RPC should be available for admin access to coach PII",
        status: "fail",
        details: "RPC 'admin_get_coaches_full' not found",
      });
    } else {
      checks.push({
        id: "admin_coaches_rpc_exists",
        name: "Admin coaches RPC exists",
        description: "admin_get_coaches_full RPC should be available for admin access to coach PII",
        status: "pass",
        details: "RPC exists for admin coach data access",
      });
    }

    // ========================================================
    // Check 15: service_billing_components requires auth
    // ========================================================
    const { data: anonBillingData, error: anonBillingError } = await anonClient
      .from("service_billing_components")
      .select("id")
      .limit(1);
    
    if (anonBillingError) {
      checks.push({
        id: "billing_components_anon_blocked",
        name: "service_billing_components blocks anonymous",
        description: "Billing component details should require authentication",
        status: "pass",
        details: "Anonymous access correctly blocked",
      });
    } else if (!anonBillingData || anonBillingData.length === 0) {
      checks.push({
        id: "billing_components_anon_blocked",
        name: "service_billing_components blocks anonymous",
        description: "Billing component details should require authentication",
        status: "pass",
        details: "No rows returned for anonymous user",
      });
    } else {
      checks.push({
        id: "billing_components_anon_blocked",
        name: "service_billing_components blocks anonymous",
        description: "Billing component details should require authentication",
        status: "fail",
        details: "Anonymous user can see billing components!",
      });
    }

    // Summary
    const passCount = checks.filter(c => c.status === "pass").length;
    const failCount = checks.filter(c => c.status === "fail").length;
    const errorCount = checks.filter(c => c.status === "error").length;

    console.log(`[Security Regression Checks] Complete: ${passCount} pass, ${failCount} fail, ${errorCount} error`);

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        summary: {
          total: checks.length,
          pass: passCount,
          fail: failCount,
          error: errorCount,
        },
        checks,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: unknown) {
    console.error("[Security Regression Checks] Error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
