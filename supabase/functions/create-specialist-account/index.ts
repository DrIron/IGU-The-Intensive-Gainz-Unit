import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { checkRateLimit, getClientIp, rateLimitResponse } from "../_shared/rateLimit.ts";
import { EMAIL_FROM_IGU, SUPPORT_EMAIL, APP_BASE_URL } from "../_shared/config.ts";
import { wrapInLayout } from "../_shared/emailTemplate.ts";
import { greeting, paragraph, alertBox, ctaButton, signOff } from "../_shared/emailComponents.ts";
import { sendEmail } from "../_shared/sendEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Specialist parity (S3) — provision a non-coach specialist end-to-end, parameterized by
// subrole_slug. Model A: the specialist's professional profile lives in its per-role table
// (dietitians), NOT coaches. Route access to their surfaces (which live under /coach) is granted
// via the 'coach' app_role; we deliberately do NOT create a coaches row, so the specialist never
// appears on Meet Our Team / coaches_directory / coach matching (all keyed on coaches[_public]).

const requestSchema = z.object({
  email: z.string().email().max(255).trim().toLowerCase(),
  first_name: z.string().min(1).max(50).trim(),
  last_name: z.string().min(1).max(50).trim(),
  subroleSlug: z.string().min(1).max(50),
  applicationId: z.string().uuid().optional(),
  date_of_birth: z.string().nullable().optional(),
  phoneNumber: z.string().max(20).trim().nullable().optional(),
  certifications: z.array(z.string().min(1).max(200)).max(20).optional(),
  specializations: z.array(z.string().min(1).max(100)).max(15).optional(),
  bio: z.string().max(2000).trim().optional(),
  level: z.enum(["junior", "senior", "lead"]).optional(),
});

// Which per-role profile table + staff role a specialist slug maps to. Dietitian-first; other
// specialists (physiotherapist, ...) have no analog profile table yet and staff_professional_info.role
// only carries {coach, dietitian} — those are provisioned with subrole + coach role only until S6.
const SPECIALIST_ROLE_META: Record<string, { roleLabel: string; staffRole: "dietitian" | null; profileTable: "dietitians" | null }> = {
  dietitian: { roleLabel: "Dietitian", staffRole: "dietitian", profileTable: "dietitians" },
  physiotherapist: { roleLabel: "Physiotherapist", staffRole: null, profileTable: null },
  sports_psychologist: { roleLabel: "Sports Psychologist", staffRole: null, profileTable: null },
  mobility_coach: { roleLabel: "Mobility Coach", staffRole: null, profileTable: null },
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, 5, 60_000);
    if (!rateCheck.allowed) return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ success: false, error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAdmin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } });

    // Verify the caller JWT resolves to a real admin.
    const userClient = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } });
    const { data: { user: caller }, error: authError } = await userClient.auth.getUser();
    if (authError || !caller) {
      return new Response(JSON.stringify({ success: false, error: "Invalid authentication" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: callerRoles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", caller.id);
    if (!callerRoles?.some((r) => r.role === "admin")) {
      return new Response(JSON.stringify({ success: false, error: "Admin access required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const body = await req.json();
    const validated = requestSchema.parse(body);
    const {
      email, first_name, last_name, subroleSlug, date_of_birth,
      phoneNumber, certifications, specializations, bio, level,
    } = validated;

    const meta = SPECIALIST_ROLE_META[subroleSlug];
    if (!meta) {
      return new Response(JSON.stringify({ success: false, error: `Unsupported specialist subrole: ${subroleSlug}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Resolve the subrole definition (must exist and not be the base coach track).
    const { data: subroleDef, error: subroleDefError } = await supabaseAdmin
      .from("subrole_definitions").select("id, slug").eq("slug", subroleSlug).maybeSingle();
    if (subroleDefError) throw subroleDefError;
    if (!subroleDef || subroleDef.slug === "coach") {
      return new Response(JSON.stringify({ success: false, error: `Not a specialist subrole: ${subroleSlug}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Create or attach the auth user. New users fire handle_new_user (profiles_public/private) +
    // assign_member_role. The metadata feeds profiles_public.first_name/display_name, which is what
    // the client-safe dietitians view reads for the name.
    const { data: existingUsers } = await supabaseAdmin.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find((u) => u.email === email);

    let userId: string;
    let isNewUser = false;
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email,
        email_confirm: true,
        user_metadata: { first_name, last_name },
      });
      if (createError) throw createError;
      if (!newUser.user) throw new Error("Failed to create user");
      userId = newUser.user.id;
      isNewUser = true;
    }

    // Route access: specialist surfaces live under /coach (RoleProtectedRoute requiredRole="coach"),
    // so the specialist needs the 'coach' app_role. The approved subrole below swaps their dock to the
    // specialist variant. We do NOT create a coaches row (keeps them off the public coach shopfront).
    const { error: roleError } = await supabaseAdmin
      .from("user_roles").upsert({ user_id: userId, role: "coach" }, { onConflict: "user_id,role" });
    if (roleError) throw roleError;

    // Approved subrole (mirrors SubroleApprovalQueue's approve: reviewer + timestamp).
    const { error: subroleError } = await supabaseAdmin.from("user_subroles").upsert(
      {
        user_id: userId,
        subrole_id: subroleDef.id,
        status: "approved",
        reviewed_by: caller.id,
        reviewed_at: new Date().toISOString(),
        admin_notes: "Provisioned via specialist application approval",
      },
      { onConflict: "user_id,subrole_id" },
    );
    if (subroleError) throw subroleError;

    // Per-role profile table (dietitian). Seed the S1 coach-parity fields from the application.
    if (meta.profileTable === "dietitians") {
      const dietPayload: Record<string, unknown> = { user_id: userId, accepting_clients: true };
      if (bio) dietPayload.bio = bio;
      if (certifications && certifications.length) dietPayload.qualifications = certifications;
      if (specializations && specializations.length) dietPayload.specializations = specializations;
      const { error: dietError } = await supabaseAdmin
        .from("dietitians").upsert(dietPayload, { onConflict: "user_id" });
      if (dietError) throw dietError;
    }

    // Professional level (admin-set; default junior). staff_professional_info.role carries the
    // profession; only {coach, dietitian} exist in the enum today.
    if (meta.staffRole) {
      const { error: staffError } = await supabaseAdmin.from("staff_professional_info").upsert(
        { user_id: userId, role: meta.staffRole, level: level ?? "junior" },
        { onConflict: "user_id" },
      );
      if (staffError) throw staffError;
    }

    // Setup / invite email — reuse the shared coach email system (layout + components +
    // @mail.theigu.com sender). A recovery link lets a brand-new user set their password.
    let setupLink: string | null = null;
    try {
      const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${APP_BASE_URL}/reset-password` },
      });
      if (linkError) throw linkError;
      setupLink = linkData?.properties?.action_link ?? null;
    } catch (linkErr) {
      console.error("Error generating setup link:", linkErr);
    }

    try {
      const content = [
        greeting(`${first_name} ${last_name}`),
        alertBox(`<strong>Welcome to IGU!</strong><br>Your ${meta.roleLabel} account has been created.`, "success"),
        paragraph(`We are excited to have you on the IGU team. To get started, set your password and sign in to complete your profile.`),
        ...(setupLink ? [ctaButton("Set Your Password", setupLink)] : []),
        paragraph(`If you have any questions, reach us at <a href="mailto:${SUPPORT_EMAIL}" style="color: #d91449;">${SUPPORT_EMAIL}</a>.`),
        signOff(),
      ].join("");
      const html = wrapInLayout({ content, preheader: `Your IGU ${meta.roleLabel} account is ready -- set your password to get started.` });
      const result = await sendEmail({
        from: EMAIL_FROM_IGU,
        to: email,
        subject: `Welcome to IGU -- Set Up Your ${meta.roleLabel} Account`,
        html,
      });
      if (!result.success) console.error("Specialist invite email failed:", result.error);
    } catch (emailErr) {
      console.error("Exception sending specialist invite email:", emailErr);
      // Don't fail provisioning if the email fails.
    }

    return new Response(
      JSON.stringify({
        success: true,
        userId,
        subroleSlug,
        isNewUser,
        message: `${meta.roleLabel} account ${existingUser ? "updated" : "created"} with ${subroleSlug} subrole approved`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("Error creating specialist:", error);
    return new Response(
      JSON.stringify({ success: false, error: (error as Error).message || "Failed to create specialist account" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
