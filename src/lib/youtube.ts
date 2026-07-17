// Shared YouTube URL helpers. Extracted from WorkoutSessionV2 so the in-session logger and the
// shared ExerciseDemoCard resolve demo videos identically (one regex, one source of truth).

const YOUTUBE_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([^&?/]+)/;

/** The 11-char video id from any youtu.be / watch / embed / shorts url, or null. */
export function getYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url.match(YOUTUBE_RE);
  return match ? match[1] : null;
}

/** The mqdefault still for a YouTube url, or null when it isn't a YouTube link. */
export function getYouTubeThumbnail(url: string | null | undefined): string | null {
  const id = getYouTubeId(url);
  return id ? `https://img.youtube.com/vi/${id}/mqdefault.jpg` : null;
}
