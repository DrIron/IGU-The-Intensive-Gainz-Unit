import { sanitizeErrorForUser } from "@/lib/errorSanitizer";

/**
 * Maps errors raised by the `join_team` SECURITY DEFINER RPC (migration
 * 20260531140000) to user-friendly copy. The RPC raises P0001 for business-rule
 * rejections (full / cycle-gap / inactive / unavailable) and 42501 for
 * authorization failures. Anything unrecognised falls back to the generic
 * sanitizer so internal schema details never leak.
 */
export function describeJoinTeamError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code?: unknown }).code ?? "")
      : "";

  if (message.includes("Team is full")) {
    return "This team is full. Please choose another team.";
  }
  if (message.includes("too soon")) {
    return "You can only change teams once per billing cycle. Please try again later.";
  }
  if (message.includes("Team not available")) {
    return "That team isn't available right now. Please choose another.";
  }
  if (message.includes("not active") || message.includes("Subscription not found")) {
    return "Your subscription isn't active. Please contact support.";
  }
  if (code === "42501" || message.includes("Not authorised")) {
    return "You're not authorised to make this change.";
  }

  return sanitizeErrorForUser(error);
}
