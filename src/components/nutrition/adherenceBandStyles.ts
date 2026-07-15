import type { AdherenceBand } from "@/lib/adherence";

/**
 * Band → dot classes, the one visual vocabulary for the adherence strips (P5a card + P5b
 * History). Shared here (not exported from a component) so both surfaces render a not_logged
 * day the same way — a hollow ring, never a red fill — and fast-refresh stays happy.
 */
export const STATUS_DOT: Record<AdherenceBand, string> = {
  adherent: "bg-status-ontrack",
  slightly_off: "bg-status-attention",
  off_track: "bg-status-risk",
  // A hollow ring, not a filled colour — "no data", visibly distinct from any verdict.
  not_logged: "border border-muted-foreground/30 bg-transparent",
};
