import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CoachPublicProfile, type CoachPublicProfileProps } from "@/components/coach/CoachPublicProfile";

/**
 * Onboarding coach-selection "View profile" dialog (CPR2b, spec §8) + the
 * Meet-the-Team quick-look. Reuses the shared `CoachPublicProfile` card
 * (variant="preview"). The onboarding RPC (`list_active_coaches_for_service`)
 * only exposes the RLS-safe subset pre-subscription, so the caller passes the
 * gated fields as undefined and the card gracefully omits those sections.
 *
 * `profileHref` (Meet-the-Team) adds a "View full profile" link to the public
 * /coaches/:slug page; onboarding omits it (no slug pre-subscription).
 */
interface CoachDetailDialogProps {
  coach: CoachPublicProfileProps["coach"] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileHref?: string;
}

export function CoachDetailDialog({ coach, open, onOpenChange, profileHref }: CoachDetailDialogProps) {
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
        {profileHref && (
          <Button asChild className="mt-3 w-full">
            <Link to={profileHref}>View full profile</Link>
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
}
