import { MessageSquare } from "lucide-react";
import type { ClientOverviewTabProps } from "../types";
import { ComingSoonPanel } from "./_ComingSoon";

export function MessagesTab(_props: ClientOverviewTabProps) {
  return (
    <ComingSoonPanel
      icon={MessageSquare}
      title="Messages"
      description="Direct thread with this client -- composer, history, and unread counts. Lands after a quick schema check so we re-use the existing messaging table rather than invent a new one."
    />
  );
}
