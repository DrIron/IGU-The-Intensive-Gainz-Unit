import { z } from "zod";

/**
 * UN1 — username rules shared by the account-settings form. This MIRRORS the
 * server-side rules in migration `..._usernames.sql` (the SQL RPC is
 * authoritative; this is UX-only instant feedback). Keep the two in sync:
 *   - format: ^[A-Za-z0-9_]{3,20}$
 *   - no leading/trailing underscore, no consecutive "__"
 *   - reserved blocklist (case-insensitive) — mirror of public.username_is_reserved
 */
export const RESERVED_USERNAMES = [
  "admin", "administrator", "root", "superuser", "igu", "official", "staff",
  "support", "help", "system", "api", "mod", "moderator", "team", "coach",
  "dietitian", "null", "undefined", "me", "you", "everyone", "here", "deleted",
] as const;

const RESERVED_SET = new Set<string>(RESERVED_USERNAMES.map((w) => w.toLowerCase()));

export function isReservedUsername(value: string): boolean {
  return RESERVED_SET.has(value.trim().toLowerCase());
}

export const usernameSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9_]{3,20}$/, "Username must be 3-20 characters: letters, numbers, or underscore.")
  .refine((v) => !v.startsWith("_") && !v.endsWith("_"), "Username cannot start or end with an underscore.")
  .refine((v) => !v.includes("__"), "Username cannot contain two underscores in a row.")
  .refine((v) => !isReservedUsername(v), "That username is reserved. Please pick another.");

/** First failing rule's message, or null when the username is client-side valid. */
export function getUsernameError(value: string): string | null {
  const result = usernameSchema.safeParse(value);
  return result.success ? null : (result.error.issues[0]?.message ?? "Invalid username.");
}
