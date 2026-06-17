import type { Tone } from "@/lib/interpret";

/**
 * Roster triage tone (RO1/CO5 §2c) — derives a single status Tone for a roster
 * row from the fields the row already carries: account/subscription status,
 * payment-failure flag, and check-in recency. NO workout-adherence fetch here:
 * adherence enrichment is deferred to the get_coach_roster_attention() RPC
 * (CO5) so dashboard + sidebar + roster share one batched source rather than a
 * fourth client-side fan-out (the drift CO1 is meant to kill).
 *
 * payment_failed_at staleness: SAFE to key risk on directly. Both recovery
 * paths (verify-payment + tap-webhook CAPTURED) and the admin PaymentOverride
 * set `payment_failed_at = null` in the SAME atomic update that sets
 * `status = 'active'`, so it can never be stale-while-active — a recovered
 * client never renders red. (Verified in verify-payment/index.ts:206-219 and
 * tap-webhook/index.ts:374-387.)
 */
export interface RosterToneInput {
  profileStatus: string | null;
  subscriptionStatus: string | null;
  paymentFailedAt: string | null;
  daysSinceCheckIn: number | null;
}

/** Severity rank for At-risk-first ordering (higher = more urgent). */
export const TONE_SEVERITY: Record<Tone, number> = {
  risk: 3,
  attention: 2,
  on_track: 1,
  neutral: 0,
};

export function rosterTone(row: RosterToneInput): Tone {
  const d = row.daysSinceCheckIn;

  // risk — needs the coach now: payment failed or churned.
  if (
    row.paymentFailedAt !== null ||
    row.subscriptionStatus === "inactive" ||
    row.profileStatus === "inactive"
  ) {
    return "risk";
  }

  // attention — awaiting a coach/client action (status-driven, before drift).
  if (row.profileStatus === "pending_coach_approval" || row.profileStatus === "pending_payment") {
    return "attention";
  }

  // drift — by check-in recency, once there's data to judge.
  if (d !== null && d >= 7) return "risk";
  if (d !== null && d >= 4) return "attention";
  if (d !== null && d <= 3) return "on_track";

  // neutral — no usable signal (active but never checked in, or unknown state).
  return "neutral";
}

/** Sort comparator: most-urgent tone first, then by display name. */
export function byRosterUrgency<T>(
  toneOf: (row: T) => Tone,
  nameOf: (row: T) => string,
) {
  return (a: T, b: T) =>
    TONE_SEVERITY[toneOf(b)] - TONE_SEVERITY[toneOf(a)] || nameOf(a).localeCompare(nameOf(b));
}
