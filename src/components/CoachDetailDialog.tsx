import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { MapPin, Award } from "lucide-react";

// Public coach profile - no sensitive contact info exposed to clients
interface Coach {
  id: string;
  first_name: string;
  last_name: string;
  bio: string | null;
  location: string | null;
  profile_picture_url: string | null;
  qualifications: string[] | null;
  specializations: string[] | null;
  nickname: string | null;
}

interface CoachDetailDialogProps {
  coach: Coach | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoachDetailDialog({ coach, open, onOpenChange }: CoachDetailDialogProps) {
  if (!coach) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="sr-only">{coach.first_name} {coach.last_name} - Full Profile</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-6">
          <div className="flex items-start gap-6">
            <Avatar className="h-24 w-24 border-2 border-primary">
              <AvatarImage src={coach.profile_picture_url || undefined} />
              <AvatarFallback className="text-2xl">
                {coach.first_name.slice(0, 1).toUpperCase()}{coach.last_name.slice(0, 1).toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1">
              <h2 className="text-3xl font-bold mb-2">{coach.first_name} {coach.last_name}</h2>
              {coach.nickname && (
                <p className="text-muted-foreground text-sm mb-2">{coach.nickname}</p>
              )}
              {coach.location && (
                <div className="flex items-center text-muted-foreground mb-4">
                  <MapPin className="h-4 w-4 mr-2" />
                  {coach.location}
                </div>
              )}
            </div>
          </div>

          {coach.bio && (
            <div>
              <h3 className="text-xl font-semibold mb-3">About</h3>
              <p className="text-muted-foreground leading-relaxed">{coach.bio}</p>
            </div>
          )}

          {coach.qualifications && coach.qualifications.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Award className="h-5 w-5 text-primary" />
                <h3 className="text-xl font-semibold">Qualifications & Certifications</h3>
              </div>
              <ul className="space-y-2">
                {coach.qualifications.map((qual, idx) => (
                  <li key={idx} className="flex items-start">
                    <span className="text-primary mr-2">•</span>
                    <span className="text-muted-foreground">{qual}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {coach.specializations && coach.specializations.length > 0 && (
            <div>
              <h3 className="text-xl font-semibold mb-3">Specializations</h3>
              <div className="flex flex-wrap gap-2">
                {coach.specializations.map((spec, idx) => (
                  <Badge key={idx} variant="secondary" className="text-sm px-3 py-1">
                    {spec}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
