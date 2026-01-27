import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface VideoUrlResult {
  signed_url?: string;
  embed_url?: string;
  video_type: "storage" | "youtube" | "loom" | "external";
  expires_in?: number;
}

interface UseVideoSignedUrlReturn {
  getVideoUrl: (videoId: string) => Promise<VideoUrlResult | null>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch signed URLs for educational videos
 * Calls the get-video-signed-url edge function which:
 * - Validates user authentication
 * - Checks video entitlement via can_access_video()
 * - Returns signed URL for storage videos or embed URL for external videos
 * - Logs all access attempts (granted and denied)
 */
export function useVideoSignedUrl(): UseVideoSignedUrlReturn {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const getVideoUrl = useCallback(async (videoId: string): Promise<VideoUrlResult | null> => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: fnError } = await supabase.functions.invoke("get-video-signed-url", {
        body: { video_id: videoId },
      });

      if (fnError) {
        console.error("[useVideoSignedUrl] Function error:", fnError);
        setError(fnError.message || "Failed to get video URL");
        return null;
      }

      if (data.error) {
        console.error("[useVideoSignedUrl] Access denied:", data.error);
        setError(data.error);
        return null;
      }

      return {
        signed_url: data.signed_url,
        embed_url: data.embed_url,
        video_type: data.video_type,
        expires_in: data.expires_in,
      };
    } catch (err: any) {
      console.error("[useVideoSignedUrl] Unexpected error:", err);
      setError(err.message || "Unexpected error");
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  return { getVideoUrl, loading, error };
}
