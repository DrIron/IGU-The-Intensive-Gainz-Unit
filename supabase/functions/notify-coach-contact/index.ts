import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { EMAIL_FROM } from '../_shared/config.ts';
import { checkRateLimit, getClientIp, rateLimitResponse } from '../_shared/rateLimit.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface NotifyRequest {
  coach_id?: string; // Legacy: coaches.id (deprecated)
  coach_user_id?: string; // Preferred: coaches.user_id (from coaches_directory)
  message_type: "whatsapp" | "email";
  client_message?: string; // Optional message from client
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = getClientIp(req);
    const rateCheck = checkRateLimit(clientIp, 5, 60_000);
    if (!rateCheck.allowed) {
      return rateLimitResponse(corsHeaders, rateCheck.retryAfterMs);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { coach_id, coach_user_id, message_type, client_message } = await req.json() as NotifyRequest;

    if ((!coach_id && !coach_user_id) || !message_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: coach_id or coach_user_id, and message_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Look up coach - support both legacy coach_id and new coach_user_id
    let coachQuery = supabaseClient
      .from("coaches")
      .select("id, user_id, first_name, last_name");
    
    if (coach_user_id) {
      coachQuery = coachQuery.eq("user_id", coach_user_id);
    } else if (coach_id) {
      coachQuery = coachQuery.eq("id", coach_id);
    }
    
    const { data: coach, error: coachError } = await coachQuery.single();

    if (coachError || !coach) {
      return new Response(
        JSON.stringify({ error: "Coach not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if user is an active client of this coach
    const { data: subscription, error: subError } = await supabaseClient
      .from("subscriptions")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("coach_id", coach.user_id)
      .eq("status", "active")
      .maybeSingle();

    if (subError || !subscription) {
      return new Response(
        JSON.stringify({ error: "You are not an active client of this coach" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get client profile from profiles_public and profiles_private
    const [{ data: publicProfile }, { data: privateProfile }] = await Promise.all([
      supabaseClient.from("profiles_public").select("first_name").eq("id", user.id).single(),
      supabaseClient.from("profiles_private").select("last_name, email, phone").eq("profile_id", user.id).single()
    ]);
    const clientProfile = { ...publicProfile, ...privateProfile };

    // Get coach contact info from coaches_private (server-side access)
    const { data: contactInfo, error: contactError } = await supabaseClient
      .from("coaches_private")
      .select("email, whatsapp_number")
      .eq("coach_public_id", coach_id)
      .single();

    if (contactError || !contactInfo) {
      return new Response(
        JSON.stringify({ error: "Coach contact information not available" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const clientName = `${clientProfile?.first_name || "Client"} ${clientProfile?.last_name || ""}`.trim();

    if (message_type === "whatsapp") {
      // Return WhatsApp link without exposing the number directly
      // The number is used server-side to construct the link
      if (!contactInfo.whatsapp_number) {
        return new Response(
          JSON.stringify({ error: "Coach WhatsApp not available" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const cleanNumber = contactInfo.whatsapp_number.replace(/\s+/g, "").replace(/^\+/, "");
      const coachName = coach.first_name;
      const defaultMessage = client_message || `Hi Coach ${coachName}, this is ${clientName} from IGU.`;
      const whatsappLink = `https://wa.me/${cleanNumber}?text=${encodeURIComponent(defaultMessage)}`;

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "redirect",
          url: whatsappLink
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (message_type === "email") {
      // Send email notification to coach via Resend
      const resendApiKey = Deno.env.get("RESEND_API_KEY");
      if (!resendApiKey) {
        console.error("RESEND_API_KEY not configured");
        return new Response(
          JSON.stringify({ error: "Email service not configured" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const emailResponse = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify({
          from: EMAIL_FROM,
          to: [contactInfo.email],
          subject: `Message from your IGU client: ${clientName}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2>Client Message</h2>
              <p><strong>From:</strong> ${clientName}</p>
              <p><strong>Client Email:</strong> ${clientProfile?.email || "Not provided"}</p>
              <p><strong>Client Phone:</strong> ${clientProfile?.phone || "Not provided"}</p>
              ${client_message ? `<p><strong>Message:</strong></p><p>${client_message}</p>` : "<p>Your client would like to get in touch with you.</p>"}
              <hr style="margin: 20px 0;">
              <p style="color: #666; font-size: 12px;">This message was sent via the IGU platform.</p>
            </div>
          `,
        }),
      });

      if (!emailResponse.ok) {
        const errorText = await emailResponse.text();
        console.error("Resend error:", errorText);
        return new Response(
          JSON.stringify({ error: "Failed to send email notification" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ 
          success: true, 
          action: "email_sent",
          message: "Your coach has been notified"
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Invalid message_type. Use 'whatsapp' or 'email'" }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in notify-coach-contact:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
