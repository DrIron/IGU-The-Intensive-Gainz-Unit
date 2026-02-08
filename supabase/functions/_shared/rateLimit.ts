/**
 * In-memory rate limiter for edge functions.
 * Tracks request count per IP within a sliding window.
 *
 * Note: Supabase edge functions run on Deno Deploy isolates.
 * The Map resets when the isolate is recycled, which is acceptable —
 * it provides best-effort protection, not a hard guarantee.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const ipMap = new Map<string, RateLimitEntry>();

// Clean up stale entries every 5 minutes to prevent memory leaks
const CLEANUP_INTERVAL_MS = 300_000;
let lastCleanup = Date.now();

function cleanup(windowMs: number) {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL_MS) return;
  lastCleanup = now;
  for (const [key, entry] of ipMap) {
    if (now - entry.windowStart > windowMs * 2) {
      ipMap.delete(key);
    }
  }
}

/**
 * Check and increment the rate limit for a given IP.
 *
 * @param ip - Client IP address (from x-forwarded-for or similar)
 * @param maxRequests - Maximum requests allowed per window (default: 10)
 * @param windowMs - Window size in milliseconds (default: 60000 = 1 minute)
 * @returns `{ allowed: true }` or `{ allowed: false, retryAfterMs }`.
 */
export function checkRateLimit(
  ip: string,
  maxRequests = 10,
  windowMs = 60_000,
): { allowed: boolean; retryAfterMs?: number } {
  cleanup(windowMs);

  const now = Date.now();
  const entry = ipMap.get(ip);

  if (!entry || now - entry.windowStart >= windowMs) {
    ipMap.set(ip, { count: 1, windowStart: now });
    return { allowed: true };
  }

  if (entry.count >= maxRequests) {
    const retryAfterMs = windowMs - (now - entry.windowStart);
    return { allowed: false, retryAfterMs };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Extracts the client IP from a Deno Request object.
 * Checks x-forwarded-for first (set by reverse proxies / Supabase gateway),
 * then falls back to x-real-ip.
 */
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) {
    // x-forwarded-for can be comma-separated; first IP is the client
    return forwarded.split(',')[0].trim();
  }
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * Returns a 429 Too Many Requests response with appropriate headers.
 */
export function rateLimitResponse(
  corsHeaders: Record<string, string>,
  retryAfterMs = 60_000,
): Response {
  return new Response(
    JSON.stringify({ error: 'Too many requests. Please try again later.' }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        'Content-Type': 'application/json',
        'Retry-After': String(Math.ceil(retryAfterMs / 1000)),
      },
    },
  );
}
