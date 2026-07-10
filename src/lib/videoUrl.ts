/**
 * Shared intro-video URL whitelist + embed builder (CPR2).
 *
 * One source of truth for the coach intro-video feature: the editor's Zod
 * refine (`CoachProfile.tsx`) validates with `isAllowedVideoUrl`, and the
 * public card (`CoachPublicProfile.tsx`) builds a safe embed with `toEmbed`.
 * Only YouTube, Vimeo, and direct .mp4 hosts are ever embedded — a
 * non-whitelisted host returns `null` from `toEmbed` and never renders.
 */

const YOUTUBE_HOSTS = ["youtube.com", "m.youtube.com", "youtu.be"];
const VIMEO_HOSTS = ["vimeo.com", "player.vimeo.com"];

function parse(raw: string): URL | null {
  try {
    const u = new URL(raw.trim());
    if (!/^https?:$/.test(u.protocol)) return null;
    return u;
  } catch {
    return null;
  }
}

function host(u: URL): string {
  return u.hostname.replace(/^www\./, "").toLowerCase();
}

/** True when the URL points at a whitelisted YouTube / Vimeo / .mp4 source. */
export function isAllowedVideoUrl(raw: string): boolean {
  const u = parse(raw);
  if (!u) return false;
  const h = host(u);
  if (YOUTUBE_HOSTS.includes(h) || VIMEO_HOSTS.includes(h)) return true;
  return u.pathname.toLowerCase().endsWith(".mp4");
}

export type VideoProvider = "youtube" | "vimeo" | "mp4";

export interface VideoEmbed {
  provider: VideoProvider;
  /** For youtube/vimeo: an iframe src. For mp4: the direct file URL. */
  embedUrl: string;
}

/**
 * Resolve a whitelisted URL to a safe embed. Returns `null` for any
 * non-whitelisted host or an unparseable/ID-less URL — callers must treat
 * `null` as "do not embed".
 */
export function toEmbed(raw: string): VideoEmbed | null {
  const u = parse(raw);
  if (!u) return null;
  const h = host(u);

  if (YOUTUBE_HOSTS.includes(h)) {
    const id = youtubeId(u);
    return id ? { provider: "youtube", embedUrl: `https://www.youtube.com/embed/${id}` } : null;
  }

  if (VIMEO_HOSTS.includes(h)) {
    const id = vimeoId(u);
    return id ? { provider: "vimeo", embedUrl: `https://player.vimeo.com/video/${id}` } : null;
  }

  if (u.pathname.toLowerCase().endsWith(".mp4")) {
    return { provider: "mp4", embedUrl: u.href };
  }

  return null;
}

function youtubeId(u: URL): string | null {
  const h = host(u);
  const segments = u.pathname.split("/").filter(Boolean);
  if (h === "youtu.be") return segments[0] || null;
  if (segments[0] === "embed" || segments[0] === "shorts") return segments[1] || null;
  if (u.pathname === "/watch") return u.searchParams.get("v");
  return null;
}

function vimeoId(u: URL): string | null {
  const segments = u.pathname.split("/").filter(Boolean);
  // vimeo.com/123456789  or  player.vimeo.com/video/123456789
  const candidate = segments[0] === "video" ? segments[1] : segments[0];
  return candidate && /^\d+$/.test(candidate) ? candidate : null;
}
