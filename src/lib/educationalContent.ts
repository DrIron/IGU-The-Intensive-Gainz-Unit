import { supabase } from "@/integrations/supabase/client";

export const CATEGORIES = [
  "Nutrition Basics",
  "Training Fundamentals",
  "Recovery & Rest",
  "Goal Setting",
  "Meal Prep",
  "Exercise Form",
  "Mindset & Motivation",
  "Supplement Guide",
  "Other",
] as const;

export type VideoCategory = typeof CATEGORIES[number];

const ALLOWED_HOSTS = [
  "youtube.com", "www.youtube.com", "m.youtube.com",
  "youtu.be",
  "loom.com", "www.loom.com",
];

export function validateVideoUrl(
  url: string
): { valid: true; videoType: "youtube" | "loom" } | { valid: false; error: string } {
  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return { valid: false, error: "Enter a valid URL (e.g. https://youtube.com/watch?v=...)" };
  }
  if (parsed.protocol !== "https:") {
    return { valid: false, error: "URL must use https://" };
  }
  const host = parsed.hostname.toLowerCase();
  if (!ALLOWED_HOSTS.includes(host)) {
    return { valid: false, error: `Host "${host}" is not allowed. Use YouTube or Loom.` };
  }
  const videoType = host.includes("loom") ? "loom" : "youtube";
  return { valid: true, videoType };
}

export function detectVideoTypeFromUrl(url: string): "youtube" | "loom" | null {
  const result = validateVideoUrl(url);
  return result.valid ? result.videoType : null;
}

export interface ServiceOption {
  id: string;
  name: string;
  type: string;
  price_kwd: number;
}

export async function fetchActiveServices(): Promise<ServiceOption[]> {
  const { data, error } = await supabase
    .from("services")
    .select("id, name, type, price_kwd")
    .order("price_kwd", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ServiceOption[];
}

export function formatDuration(seconds: number | null | undefined): string | null {
  if (!seconds || seconds <= 0) return null;
  const totalMin = Math.floor(seconds / 60);
  const remSec = seconds % 60;
  if (totalMin === 0) return `${remSec}s`;
  const hr = Math.floor(totalMin / 60);
  const min = totalMin % 60;
  if (hr > 0) return min > 0 ? `${hr}h ${min}m` : `${hr}h`;
  return remSec >= 30 ? `${totalMin + 1}m` : `${totalMin}m`;
}

const FILTER_KEY = "igu_eduvideos_filter";

export interface EduVideosFilterState {
  q: string;
  category: string;
  tab: "videos" | "paths";
}

export function loadFilterState(): EduVideosFilterState {
  if (typeof window === "undefined") return { q: "", category: "All Categories", tab: "videos" };
  try {
    const raw = localStorage.getItem(FILTER_KEY);
    if (!raw) return { q: "", category: "All Categories", tab: "videos" };
    const parsed = JSON.parse(raw);
    return {
      q: typeof parsed.q === "string" ? parsed.q : "",
      category: typeof parsed.category === "string" ? parsed.category : "All Categories",
      tab: parsed.tab === "paths" ? "paths" : "videos",
    };
  } catch {
    return { q: "", category: "All Categories", tab: "videos" };
  }
}

export function saveFilterState(state: EduVideosFilterState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(FILTER_KEY, JSON.stringify(state));
  } catch { /* quota exceeded -- ignore */ }
}

const ADMIN_FILTER_KEY = "igu_eduvideos_admin_filter";

export type AdminStatusFilter = "all" | "active" | "inactive" | "pinned" | "free_preview" | "required";
export type AdminTypeFilter = "all" | "youtube" | "loom";
export type AdminSortKey = "order" | "created_desc" | "created_asc" | "title_asc" | "title_desc";

export interface AdminEduFilterState {
  q: string;
  category: string;
  status: AdminStatusFilter;
  type: AdminTypeFilter;
  sort: AdminSortKey;
}

const DEFAULT_ADMIN_FILTER: AdminEduFilterState = {
  q: "",
  category: "all",
  status: "all",
  type: "all",
  sort: "order",
};

export function loadAdminFilterState(): AdminEduFilterState {
  if (typeof window === "undefined") return { ...DEFAULT_ADMIN_FILTER };
  try {
    const raw = localStorage.getItem(ADMIN_FILTER_KEY);
    if (!raw) return { ...DEFAULT_ADMIN_FILTER };
    const parsed = JSON.parse(raw);
    return {
      q: typeof parsed.q === "string" ? parsed.q : "",
      category: typeof parsed.category === "string" ? parsed.category : "all",
      status: (["all", "active", "inactive", "pinned", "free_preview", "required"] as const).includes(parsed.status) ? parsed.status : "all",
      type: (["all", "youtube", "loom"] as const).includes(parsed.type) ? parsed.type : "all",
      sort: (["order", "created_desc", "created_asc", "title_asc", "title_desc"] as const).includes(parsed.sort) ? parsed.sort : "order",
    };
  } catch {
    return { ...DEFAULT_ADMIN_FILTER };
  }
}

export function saveAdminFilterState(state: AdminEduFilterState): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ADMIN_FILTER_KEY, JSON.stringify(state));
  } catch { /* quota exceeded -- ignore */ }
}

export function normalizeVideoUrl(url: string): string {
  try {
    const u = new URL(url.trim());
    const allowedParams = new Set<string>(["v"]); // YouTube watch?v=...
    const cleaned = new URLSearchParams();
    u.searchParams.forEach((value, key) => {
      if (allowedParams.has(key)) cleaned.set(key, value);
    });
    u.search = cleaned.toString();
    u.hostname = u.hostname.replace(/^www\./, "");
    u.hash = "";
    return u.toString();
  } catch {
    return url.trim();
  }
}
