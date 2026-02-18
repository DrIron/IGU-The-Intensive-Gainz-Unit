import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Instagram,
  Youtube,
  Music2,
  Ghost,
  Globe,
  type LucideIcon,
} from "lucide-react";

export interface SocialLink {
  key: string;
  url: string;
}

/** Icons for known social platforms (lucide-react has no brand icons for Twitter/FB/LinkedIn) */
export const SOCIAL_ICON_MAP: Record<string, LucideIcon> = {
  instagram: Instagram,
  tiktok: Music2,
  youtube: Youtube,
  snapchat: Ghost,
};

export const SOCIAL_LABEL_MAP: Record<string, string> = {
  instagram: "Instagram",
  tiktok: "TikTok",
  youtube: "YouTube",
  twitter: "Twitter / X",
  snapchat: "Snapchat",
  facebook: "Facebook",
  linkedin: "LinkedIn",
};

export function getSocialIcon(key: string): LucideIcon {
  return SOCIAL_ICON_MAP[key] || Globe;
}

export function getSocialLabel(key: string): string {
  return SOCIAL_LABEL_MAP[key] || key;
}

/**
 * Fetch active social links with non-empty URLs from site_content.
 * Used by Footer and Waitlist page.
 */
export function useSocialLinks() {
  return useQuery({
    queryKey: ["social-links"],
    queryFn: async (): Promise<SocialLink[]> => {
      const { data, error } = await supabase
        .from("site_content")
        .select("key, value")
        .eq("page", "global")
        .eq("section", "social_links")
        .eq("is_active", true)
        .order("sort_order");

      if (error) throw error;

      return (data || [])
        .filter((row) => row.value && row.value.trim() !== "")
        .map((row) => ({ key: row.key, url: row.value }));
    },
    staleTime: 5 * 60 * 1000,
  });
}
