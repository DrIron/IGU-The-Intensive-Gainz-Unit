import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface SiteContentRow {
  id: string;
  page: string;
  section: string;
  key: string;
  value: string;
  value_type: string;
  sort_order: number;
  is_active: boolean;
}

type GroupedContent = Record<string, Record<string, string>>;

/**
 * Parse a JSON field safely, returning the parsed value or the original string
 */
export function parseJsonField<T>(value: string): T | string {
  try {
    return JSON.parse(value) as T;
  } catch {
    return value;
  }
}

/**
 * Get a numeric value from site content
 */
export function getNumericValue(value: string): number {
  const parsed = parseFloat(value);
  return isNaN(parsed) ? 0 : parsed;
}

/**
 * Hook to fetch CMS content for a specific page
 * Returns grouped content by section: { hero: { title: '...', subtitle: '...' }, features: {...} }
 */
export function useSiteContent(page: string) {
  return useQuery({
    queryKey: ["site-content", page],
    queryFn: async (): Promise<GroupedContent> => {
      const { data, error } = await supabase
        .from("site_content")
        .select("*")
        .eq("page", page)
        .eq("is_active", true)
        .order("section")
        .order("sort_order");

      if (error) {
        console.error("Error fetching site content:", error);
        throw error;
      }

      // Group by section
      const grouped: GroupedContent = {};
      for (const row of (data as SiteContentRow[]) || []) {
        if (!grouped[row.section]) {
          grouped[row.section] = {};
        }
        grouped[row.section][row.key] = row.value;
      }

      return grouped;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 30 * 60 * 1000, // 30 minutes (formerly cacheTime)
  });
}

/**
 * Hook to fetch all site content for admin editing
 * Returns raw rows grouped by page and section
 */
export function useAllSiteContent() {
  return useQuery({
    queryKey: ["site-content", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("site_content")
        .select("*")
        .order("page")
        .order("section")
        .order("sort_order");

      if (error) {
        console.error("Error fetching all site content:", error);
        throw error;
      }

      return data as SiteContentRow[];
    },
    staleTime: 1 * 60 * 1000, // 1 minute for admin
  });
}

/**
 * Get unique pages from site content
 */
export function getUniquePages(content: SiteContentRow[]): string[] {
  return [...new Set(content.map((row) => row.page))];
}

/**
 * Get sections for a specific page
 */
export function getSectionsForPage(
  content: SiteContentRow[],
  page: string
): string[] {
  return [
    ...new Set(content.filter((row) => row.page === page).map((row) => row.section)),
  ];
}

/**
 * Get items for a specific page and section
 */
export function getItemsForSection(
  content: SiteContentRow[],
  page: string,
  section: string
): SiteContentRow[] {
  return content
    .filter((row) => row.page === page && row.section === section)
    .sort((a, b) => a.sort_order - b.sort_order);
}
