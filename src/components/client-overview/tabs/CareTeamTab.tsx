import { Users } from "lucide-react";
import type { ClientOverviewTabProps } from "../types";
import { ComingSoonPanel } from "./_ComingSoon";

export function CareTeamTab(_props: ClientOverviewTabProps) {
  return (
    <ComingSoonPanel
      icon={Users}
      title="Care Team"
      description="Roster of every professional working with this client -- coach, dietitian, physio, and more -- plus a threaded conversation shared across the whole team."
    />
  );
}
