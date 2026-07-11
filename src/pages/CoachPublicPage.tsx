import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";
import { CoachPublicProfile, deriveCoachHeadline } from "@/components/coach/CoachPublicProfile";
import { SEOHead } from "@/components/SEOHead";
import { Button } from "@/components/ui/button";

/** Shape of the get_coach_public_profile_by_slug RPC jsonb payload. */
interface CoachProfilePayload {
  coach_user_id: string;
  first_name: string;
  last_name: string | null;
  nickname: string | null;
  display_name: string | null;
  profile_picture_url: string | null;
  location: string | null;
  bio: string | null;
  short_bio: string | null;
  qualifications: string[] | null;
  specializations: string[] | null;
  specialties: string[] | null;
  intro_video_url: string | null;
  years_experience: number | null;
  is_head_coach: boolean | null;
  head_coach_specialisation: string | null;
  coach_level: string | null;
  socials: { instagram: string | null; tiktok: string | null; youtube: string | null; snapchat: string | null } | null;
  gyms: { id: string; name: string }[] | null;
}

export default function CoachPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { getLabel } = useSpecializationTags();

  const [profile, setProfile] = useState<CoachProfilePayload | null>(null);
  const [clientBand, setClientBand] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    setProfile(null);
    setClientBand(null);

    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_coach_public_profile_by_slug", { p_slug: slug });
        if (cancelled) return;
        if (error || !data) {
          setNotFound(true);
          return;
        }
        const payload = data as unknown as CoachProfilePayload;
        setProfile(payload);

        // Clients band — fire-and-forget; NULL / error just hides the stat.
        const { data: band } = await supabase.rpc("get_coach_client_count_band", {
          p_coach_user_id: payload.coach_user_id,
        });
        if (!cancelled) setClientBand(band ?? null);
      } catch {
        if (!cancelled) setNotFound(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug]);

  if (loading) {
    return (
      <div className="mx-auto max-w-md px-4 py-8">
        <div className="overflow-hidden rounded-xl border border-border">
          <div className="h-52 animate-pulse bg-muted" />
          <div className="space-y-3 p-4">
            <div className="h-6 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-20 w-full animate-pulse rounded bg-muted" />
          </div>
        </div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
        <SEOHead title={`${t("coachNotFoundTitle", { defaultValue: "Coach not found" })} | IGU`} description={t("coachNotFoundBody", { defaultValue: "This coach profile doesn’t exist or is no longer active." })} />
        <h1 className="font-display text-4xl tracking-wide">{t("coachNotFoundTitle", { defaultValue: "Coach not found" })}</h1>
        <p className="text-sm text-muted-foreground">{t("coachNotFoundBody", { defaultValue: "This coach profile doesn’t exist or is no longer active." })}</p>
        <Button asChild variant="outline">
          <Link to="/meet-our-team">{t("coachBackToTeam", { defaultValue: "Meet our team" })}</Link>
        </Button>
      </div>
    );
  }

  const specializationLabels = (profile.specializations ?? []).map(getLabel);
  const fullName = [profile.first_name, profile.last_name].filter(Boolean).join(" ");
  const headline = deriveCoachHeadline({
    isHeadCoach: profile.is_head_coach,
    headCoachSpecialisation: profile.head_coach_specialisation,
    coachLevel: profile.coach_level,
    primarySpecialty: specializationLabels[0] ?? null,
  });

  const seoDescription = (profile.short_bio || profile.bio || "").trim() || `${fullName}${headline ? ` — ${headline}` : ""}`;

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <SEOHead
        title={`${fullName}${headline ? ` — ${headline}` : ""} | IGU`}
        description={seoDescription.slice(0, 200)}
        image={profile.profile_picture_url || undefined}
        type="profile"
      />
      <CoachPublicProfile
        variant="public"
        coach={{
          firstName: profile.first_name,
          lastName: profile.last_name,
          nickname: profile.nickname,
          headline,
          avatarUrl: profile.profile_picture_url,
          location: profile.location,
          bio: profile.bio,
          shortBio: profile.short_bio,
          specializations: specializationLabels,
          qualifications: profile.qualifications ?? [],
          gyms: profile.gyms ?? [],
          socials: profile.socials ?? undefined,
          introVideoUrl: profile.intro_video_url,
          yearsExperience: profile.years_experience,
          clientCount: clientBand,
        }}
        onPrimaryCta={() => navigate(`/onboarding?coach=${profile.coach_user_id}`)}
      />
    </div>
  );
}
