import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogScrollArea,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerScrollArea,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { CoachPublicProfile, type CoachPublicProfileProps } from "@/components/coach/CoachPublicProfile";

/**
 * Coach "View profile" quick-look — mounted by onboarding coach selection
 * (`CoachPreferenceSection`) and the Meet-the-Team grid. Wraps the shared
 * `CoachPublicProfile` card (variant="preview"), which null-omits every section,
 * so a caller may pass a partially-filled coach without producing empty headers.
 *
 * Both callers now pass the FULL public profile. There is no pre-subscription
 * gate: onboarding reads `list_active_coaches_for_service`, a SECURITY DEFINER
 * RPC (RLS does not apply to it), and the same field set is served to
 * *anonymous* visitors by `get_coach_public_profile_by_slug` on /coaches/:slug.
 * An earlier comment here claimed these fields were "RLS-gated pre-subscription"
 * — that was false; ON2 enriched the RPC instead. Don't reintroduce the lite object.
 *
 * Mobile: vaul `Drawer` bottom sheet — onboarding runs mostly on phones
 * (CLAUDE.md § Mobile branching). Desktop stays on `Dialog`.
 *
 * `profileHref` adds a "View full profile" link to /coaches/:slug. Both callers
 * supply it now that the onboarding RPC returns `slug`.
 */
interface CoachDetailDialogProps {
  coach: CoachPublicProfileProps["coach"] | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileHref?: string;
}

export function CoachDetailDialog({ coach, open, onOpenChange, profileHref }: CoachDetailDialogProps) {
  const isMobile = useIsMobile();

  if (!coach) return null;

  const title = `${[coach.firstName, coach.lastName].filter(Boolean).join(" ")} — profile`;

  const body = (
    <>
      <CoachPublicProfile coach={coach} variant="preview" />
      {profileHref && (
        <Button asChild className="mt-3 w-full">
          <Link to={profileHref}>View full profile</Link>
        </Button>
      )}
    </>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="pb-0">
            <DrawerTitle className="sr-only">{title}</DrawerTitle>
          </DrawerHeader>
          <DrawerScrollArea className="max-h-[80vh] px-4 pb-6">{body}</DrawerScrollArea>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[85vh] p-4">
        <DialogHeader>
          <DialogTitle className="sr-only">{title}</DialogTitle>
        </DialogHeader>
        <DialogScrollArea className="max-h-[calc(85vh-80px)] pr-2">{body}</DialogScrollArea>
      </DialogContent>
    </Dialog>
  );
}
