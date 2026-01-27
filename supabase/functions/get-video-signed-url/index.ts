import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Signed URL TTL: 10 minutes
const SIGNED_URL_TTL_SECONDS = 600;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      console.log("[get-video-signed-url] No auth header");
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create Supabase client with user's auth
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Validate JWT and get user
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims) {
      console.log("[get-video-signed-url] Invalid token:", claimsError?.message);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = claimsData.claims.sub as string;
    const userEmail = claimsData.claims.email as string;

    // Parse request body
    const { video_id } = await req.json();
    
    if (!video_id) {
      console.log("[get-video-signed-url] Missing video_id");
      return new Response(
        JSON.stringify({ error: "video_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for admin operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get request metadata for logging
    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("cf-connecting-ip") || "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Check access using the can_access_video function
    const { data: accessCheck, error: accessError } = await userClient.rpc("can_access_video", {
      p_video_id: video_id,
    });

    if (accessError) {
      console.error("[get-video-signed-url] Access check error:", accessError);
      
      // Log denied access
      await serviceClient.from("video_access_log").insert({
        user_id: userId,
        video_id: video_id,
        access_granted: false,
        denial_reason: `Access check error: ${accessError.message}`,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return new Response(
        JSON.stringify({ error: "Access check failed" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!accessCheck) {
      console.log(`[get-video-signed-url] ACCESS DENIED: user=${userEmail} video=${video_id}`);
      
      // Log denied access
      await serviceClient.from("video_access_log").insert({
        user_id: userId,
        video_id: video_id,
        access_granted: false,
        denial_reason: "User does not have entitlement to this video",
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch video storage info (using service client to bypass RLS for storage info)
    const { data: videoData, error: videoError } = await serviceClient
      .from("educational_videos")
      .select("id, title, storage_bucket, storage_path, video_url, video_type")
      .eq("id", video_id)
      .eq("is_active", true)
      .single();

    if (videoError || !videoData) {
      console.error("[get-video-signed-url] Video not found:", videoError);
      
      await serviceClient.from("video_access_log").insert({
        user_id: userId,
        video_id: video_id,
        access_granted: false,
        denial_reason: "Video not found or inactive",
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return new Response(
        JSON.stringify({ error: "Video not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if video uses storage (storage_path) or external URL (video_url)
    if (videoData.storage_path) {
      // Video is stored in Supabase Storage - generate signed URL
      const bucket = videoData.storage_bucket || "educational-videos";
      
      const { data: signedUrlData, error: signedUrlError } = await serviceClient.storage
        .from(bucket)
        .createSignedUrl(videoData.storage_path, SIGNED_URL_TTL_SECONDS);

      if (signedUrlError || !signedUrlData?.signedUrl) {
        console.error("[get-video-signed-url] Failed to create signed URL:", signedUrlError);
        
        await serviceClient.from("video_access_log").insert({
          user_id: userId,
          video_id: video_id,
          access_granted: false,
          denial_reason: `Signed URL generation failed: ${signedUrlError?.message}`,
          ip_address: ipAddress,
          user_agent: userAgent,
        });

        return new Response(
          JSON.stringify({ error: "Failed to generate video URL" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Log successful access
      await serviceClient.from("video_access_log").insert({
        user_id: userId,
        video_id: video_id,
        access_granted: true,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      console.log(`[get-video-signed-url] ACCESS GRANTED: user=${userEmail} video=${videoData.title}`);

      return new Response(
        JSON.stringify({
          signed_url: signedUrlData.signedUrl,
          expires_in: SIGNED_URL_TTL_SECONDS,
          video_type: "storage",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else if (videoData.video_url) {
      // Video uses external URL (YouTube/Loom) - return embed URL
      // These are already public embeds, but we still gate access through this function
      
      await serviceClient.from("video_access_log").insert({
        user_id: userId,
        video_id: video_id,
        access_granted: true,
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      console.log(`[get-video-signed-url] ACCESS GRANTED (external): user=${userEmail} video=${videoData.title}`);

      return new Response(
        JSON.stringify({
          embed_url: videoData.video_url,
          video_type: videoData.video_type || "external",
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    } else {
      // No video source configured
      await serviceClient.from("video_access_log").insert({
        user_id: userId,
        video_id: video_id,
        access_granted: false,
        denial_reason: "No video source configured",
        ip_address: ipAddress,
        user_agent: userAgent,
      });

      return new Response(
        JSON.stringify({ error: "Video source not configured" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
  } catch (error) {
    console.error("[get-video-signed-url] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
