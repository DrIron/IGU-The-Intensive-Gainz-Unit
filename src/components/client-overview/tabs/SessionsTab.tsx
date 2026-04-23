import { CalendarClock } from "lucide-react";
import type { ClientOverviewTabProps } from "../types";
import { ComingSoonPanel } from "./_ComingSoon";

export function SessionsTab(_props: ClientOverviewTabProps) {
  return (
    <ComingSoonPanel
      icon={CalendarClock}
      title="Sessions"
      description="Ad-hoc calendar sessions and addon bookings live here. Complements the recurring programs in the Workouts tab."
    />
  );
}
