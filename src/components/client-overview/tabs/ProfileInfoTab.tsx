import { UserCircle } from "lucide-react";
import type { ClientOverviewTabProps } from "../types";
import { ComingSoonPanel } from "./_ComingSoon";

export function ProfileInfoTab(_props: ClientOverviewTabProps) {
  return (
    <ComingSoonPanel
      icon={UserCircle}
      title="Profile & Info"
      description="Demographics, goals, subscription status, onboarding submission, and PAR-Q link. Read-only first, coach-editable fields added where RLS already allows."
    />
  );
}
