import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClickableCard } from "@/components/ui/clickable-card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { AlertCircle, MessageSquare, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface CoachCardProps {
  coach: {
    id: string; // coach.user_id (used as identifier)
    first_name: string;
    last_name?: string;
    nickname?: string;
    profile_picture_url?: string;
    short_bio?: string;
    specializations?: string[];
    qualifications?: string[];
  };
  clientFirstName?: string;
  /**
   * If true, this was the client's preferred coach and they got them.
   * If false, the client was auto-assigned (or their preferred coach was full).
   * If undefined, we don't know (legacy/untracked).
   */
  wasPreferred?: boolean;
  /**
   * If set, this is the name of the coach the client originally requested
   * but couldn't be assigned to (because they were at capacity).
   */
  originalPreferredCoachName?: string;
}

export function CoachCard({ coach, clientFirstName, wasPreferred, originalPreferredCoachName }: CoachCardProps) {
  const navigate = useNavigate();
  const displayName = coach.nickname || `${coach.first_name} ${coach.last_name || ''}`.trim();
  const initials = coach.first_name?.[0] || 'C';

  // Coach WhatsApp (if they've set a number) -- read via the SECURITY DEFINER
  // RPC so the client can reach it without direct access to coaches_private.
  const [coachWhatsApp, setCoachWhatsApp] = useState<string | null>(null);
  const whatsappFetched = useRef(false);
  useEffect(() => {
    if (whatsappFetched.current || !coach.id) return;
    whatsappFetched.current = true;
    supabase
      .rpc("get_coach_whatsapp_for_client", { p_coach_user_id: coach.id })
      .then(({ data }) => {
        if (typeof data === "string" && data.trim()) setCoachWhatsApp(data);
      });
  }, [coach.id]);

  return (
    <ClickableCard
      ariaLabel={`View coach profile: ${displayName}`}
      className="border-border"
      onClick={() => navigate("/meet-our-team")}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">Your Coach</CardTitle>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12">
            <AvatarImage src={coach.profile_picture_url} alt={displayName} />
            <AvatarFallback className="bg-primary/10 text-primary font-semibold">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <h3 className="font-semibold">{displayName}</h3>
            {wasPreferred === true && (
              <p className="text-xs text-muted-foreground">Preferred coach</p>
            )}
          </div>
        </div>

        {/* Short bio */}
        {coach.short_bio && (
          <p className="text-sm text-muted-foreground">{coach.short_bio}</p>
        )}

        {/* Specializations */}
        {coach.specializations && coach.specializations.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {coach.specializations.slice(0, 4).map((spec, idx) => (
              <Badge key={idx} variant="secondary" className="text-xs">
                {spec}
              </Badge>
            ))}
            {coach.specializations.length > 4 && (
              <Badge variant="outline" className="text-xs">
                +{coach.specializations.length - 4} more
              </Badge>
            )}
          </div>
        )}

        {/* Qualifications summary */}
        {coach.qualifications && coach.qualifications.length > 0 && (
          <p className="text-xs text-muted-foreground">
            {coach.qualifications.slice(0, 2).join(" • ")}
            {coach.qualifications.length > 2 && ` • +${coach.qualifications.length - 2} more`}
          </p>
        )}

        {/* Show message if client was auto-assigned due to capacity */}
        {wasPreferred === false && originalPreferredCoachName && (
          <div className="flex items-start gap-2 p-3 rounded-md bg-muted/50 border border-muted">
            <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              Assigned to {displayName} (your requested coach, {originalPreferredCoachName}, is currently at capacity)
            </p>
          </div>
        )}

        {/* WhatsApp contact when the coach has a number set, else generic
            guidance. stopPropagation so the wa.me link opens without also
            firing the card's navigate-to-profile click. */}
        {coachWhatsApp ? (
          <a
            href={`https://wa.me/${coachWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(`Hi ${displayName}, `)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-md px-3 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
            style={{ backgroundColor: "#25D366" }}
            aria-label={`Message ${displayName} on WhatsApp`}
          >
            <WhatsappIcon className="h-4 w-4" />
            Message on WhatsApp
          </a>
        ) : (
          <div className="flex items-start gap-2 p-3 rounded-md bg-primary/5 border border-primary/10">
            <MessageSquare className="h-4 w-4 text-primary mt-0.5 shrink-0" aria-hidden="true" />
            <p className="text-xs text-muted-foreground">
              Your coach will reach out to you directly. Open to view their full profile.
            </p>
          </div>
        )}
      </CardContent>
    </ClickableCard>
  );
}

function WhatsappIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden="true">
      <path d="M.057 24l1.687-6.163a11.867 11.867 0 01-1.587-5.945C.16 5.335 5.495 0 12.05 0a11.817 11.817 0 018.413 3.488 11.824 11.824 0 013.48 8.414c-.003 6.557-5.338 11.892-11.893 11.892a11.9 11.9 0 01-5.688-1.448L.057 24zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884a9.86 9.86 0 001.512 5.26l-.999 3.648 3.736-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.612-.916-2.206-.242-.578-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.29.173-1.414z"/>
    </svg>
  );
}
