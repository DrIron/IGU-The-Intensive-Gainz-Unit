import { Card, CardContent } from "@/components/ui/card";
import { Dumbbell } from "lucide-react";
import type { ClientOverviewTabProps } from "../types";

/**
 * Placeholder for PR A. PR C replaces this with the full client_programs
 * list + drill-down. Uses `context` only to remain type-aligned with the
 * ClientOverviewTabProps contract -- no fetches here yet.
 */
export function WorkoutsTab(_props: ClientOverviewTabProps) {
  return (
    <Card>
      <CardContent className="py-12">
        <div className="flex flex-col items-center text-center gap-3 text-muted-foreground">
          <div className="p-3 rounded-full bg-muted">
            <Dumbbell className="h-6 w-6" aria-hidden="true" />
          </div>
          <div>
            <p className="font-medium text-foreground">Workouts tab coming soon</p>
            <p className="text-sm mt-1 max-w-xs">
              Program list, session adherence, and drill-down land in the next PR.
            </p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
