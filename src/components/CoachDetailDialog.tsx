import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CoachPublicProfile, type CoachPublicProfileProps } from "@/components/coach/CoachPublicProfile";

/**
 * Onboarding coach-selection "View profile" dialog (CPR2b, spec §8).
 *
 * Reskinned to reuse the shared `CoachPublicProfile` card (variant="preview").
 * The feeding RPC (`list_active_coaches_for_service`) only exposes the RLS-safe
 * subset pre-subscription (name / avatar / short_bio / specializations), so the
 * caller passes qualifications / location / socials / intro-video / gyms as
 * undefined and the card gracefully omits those sections.
 */
interface CoachDetailDialogProps {
  coach: CoachPublicProfileProps["coach"] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoachDetailDialog({ coach, open, onOpenChange }: CoachDetailDialogProps) {
  if (!coach) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto p-4">
        <DialogHeader>
          <DialogTitle className="sr-only">
            {[coach.firstName, coach.lastName].filter(Boolean).join(" ")} — profile
          </DialogTitle>
        </DialogHeader>
        <CoachPublicProfile coach={coach} variant="preview" />
      </DialogContent>
    </Dialog>
  );
}
