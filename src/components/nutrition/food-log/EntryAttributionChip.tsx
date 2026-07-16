import type { FoodLogWriteRole } from "./useFoodLog";

/**
 * A small muted marker on any entry a coach/dietitian added, shown on BOTH the staff
 * surface and the client's OWN diary. Deliberate transparency: a client must never find
 * a staff-inserted entry indistinguishable from one they logged themselves. Attribution
 * is the CREATOR; editing an entry never changes it.
 *
 * `perspective` shapes the voice: the client sees "added by your coach"; staff see the
 * neutral "added by coach". A self-logged entry ('client') renders nothing.
 */
export function EntryAttributionChip({
  role,
  perspective,
}: {
  role: FoodLogWriteRole;
  perspective: "client" | "staff";
}) {
  if (role === "client") return null;

  const who =
    role === "dietitian" ? "dietitian" : role === "admin" ? "coaching team" : "coach";
  const label = perspective === "client" ? `Added by your ${who}` : `Added by ${who}`;

  return (
    <span
      data-entry-attribution={role}
      className="mt-0.5 inline-flex w-fit items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
    >
      {label}
    </span>
  );
}
