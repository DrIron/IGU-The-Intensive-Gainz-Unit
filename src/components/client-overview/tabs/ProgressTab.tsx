import { TrendingUp } from "lucide-react";
import type { ClientOverviewTabProps } from "../types";
import { ComingSoonPanel } from "./_ComingSoon";

export function ProgressTab(_props: ClientOverviewTabProps) {
  return (
    <ComingSoonPanel
      icon={TrendingUp}
      title="Progress"
      description="Weight, body-fat, circumference, adherence, and workout-volume trends over time. Ships in a follow-up PR -- the data already exists and is plotted elsewhere, this is a reorganisation."
    />
  );
}
