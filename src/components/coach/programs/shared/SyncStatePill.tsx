import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * SyncStatePill — whether an assigned client is still following the source program,
 * has detached (locally edited), or is on a team plan (§11.2).
 *
 * NEW in PR1 and deliberately UNCONSUMED: it lands here so the in-use client list
 * and the client/team skin banner can import it when Teams T2/T3 and Coach-Client
 * B4 land. Adding it changes no existing rendering — nothing imports it yet.
 */
export type SyncState = "following" | "detached" | "team";

const STATE_META: Record<SyncState, { label: string; className: string }> = {
  following: { label: "Following", className: "text-emerald-600 border-emerald-500/40 dark:text-emerald-400" },
  detached: { label: "Detached", className: "text-amber-600 border-amber-500/40 dark:text-amber-400" },
  team: { label: "Team", className: "text-primary border-primary/40" },
};

interface SyncStatePillProps {
  state: SyncState;
  className?: string;
}

export function SyncStatePill({ state, className }: SyncStatePillProps) {
  const meta = STATE_META[state];

  return (
    <Badge
      variant="outline"
      className={cn(
        "text-[10px] font-mono uppercase tracking-wider shrink-0",
        meta.className,
        className,
      )}
    >
      {meta.label}
    </Badge>
  );
}
