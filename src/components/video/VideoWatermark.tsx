import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

interface VideoWatermarkProps {
  className?: string;
}

/**
 * Subtle watermark overlay for video player
 * Displays user identifier to discourage unauthorized sharing
 */
export function VideoWatermark({ className = "" }: VideoWatermarkProps) {
  const [watermarkText, setWatermarkText] = useState<string>("");

  useEffect(() => {
    const fetchUserInfo = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Try to get display name from profiles_public
      const { data: profile } = await supabase
        .from("profiles_public")
        .select("display_name")
        .eq("id", user.id)
        .maybeSingle();

      // Use display name, email prefix, or truncated user ID
      const displayName = profile?.display_name;
      const emailPrefix = user.email?.split("@")[0];
      const shortId = user.id.slice(0, 8);

      setWatermarkText(displayName || emailPrefix || shortId);
    };

    fetchUserInfo();
  }, []);

  if (!watermarkText) return null;

  return (
    <div
      className={`absolute inset-0 pointer-events-none overflow-hidden ${className}`}
      aria-hidden="true"
    >
      {/* Multiple watermarks positioned across the video */}
      <div className="absolute top-4 right-4 text-white/20 text-xs font-mono select-none">
        {watermarkText}
      </div>
      <div className="absolute bottom-12 left-4 text-white/15 text-[10px] font-mono select-none rotate-[-5deg]">
        Licensed to: {watermarkText}
      </div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white/[0.08] text-2xl font-mono select-none rotate-[-15deg]">
        {watermarkText}
      </div>
    </div>
  );
}
