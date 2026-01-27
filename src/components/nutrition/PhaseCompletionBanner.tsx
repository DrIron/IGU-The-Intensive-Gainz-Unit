import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle } from "lucide-react";

interface PhaseCompletionBannerProps {
  phase: any;
  onCreateNewPhase?: () => void;
}

export function PhaseCompletionBanner({ phase, onCreateNewPhase }: PhaseCompletionBannerProps) {
  if (!phase || !phase.estimated_end_date) return null;

  const weeksSinceStart = Math.floor(
    (new Date().getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
  ) + 1;

  const estimatedWeeks = Math.floor(
    (new Date(phase.estimated_end_date).getTime() - new Date(phase.start_date).getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  if (weeksSinceStart < estimatedWeeks) return null;

  return (
    <Alert className="mb-6 border-primary bg-primary/10">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Phase Complete</AlertTitle>
      <AlertDescription className="flex items-center justify-between">
        <span>
          Your current nutrition phase is complete. Set a new goal to continue tracking your progress.
        </span>
        {onCreateNewPhase && (
          <Button onClick={onCreateNewPhase} size="sm" className="ml-4">
            Create New Phase
          </Button>
        )}
      </AlertDescription>
    </Alert>
  );
}
