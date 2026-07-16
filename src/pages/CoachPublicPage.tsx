import { useEffect, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Star } from "lucide-react";
import { useSpecializationTags } from "@/hooks/useSpecializationTags";
import { CoachPublicProfile, deriveCoachHeadline } from "@/components/coach/CoachPublicProfile";
import { WeightChangeProof } from "@/components/testimonials/WeightChangeProof";
import { type WeightChangeShape } from "@/lib/weightChangeFormat";
import { SEOHead } from "@/components/SEOHead";
import { LoadError } from "@/components/ui/load-error";
import { captureException } from "@/lib/errorLogging";
import { Button } from "@/components/ui/button";
import { buildCoachJsonLd } from "@/lib/coachJsonLd";

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

/** One publicly-visible review from get_coach_public_testimonials. */
interface ReputationItem {
  id: string;
  rating: number;
  feedback: string;
  created_at: string;
  display_name: string;
  attachment_type: string;
  attachment: WeightChangeShape | null;
  attachment_note: string | null;
}

export default function CoachPublicPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("common");
  const { getLabel } = useSpecializationTags();

  const [profile, setProfile] = useState<CoachProfilePayload | null>(null);
  const [clientBand, setClientBand] = useState<number | null>(null);
  const [reputation, setReputation] = useState<ReputationItem[]>([]);
  const [aggregate, setAggregate] = useState<{ count: number; avg: number | null }>({ count: 0, avg: null });
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<Error | null>(null);
  /** Bumped by LoadError\'s Retry to re-run the fetch effect. */
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!slug) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setLoading(true);
    setNotFound(false);
    setLoadError(null);
    setProfile(null);
    setClientBand(null);
    setReputation([]);
    setAggregate({ count: 0, avg: null });

    (async () => {
      try {
        const { data, error } = await supabase.rpc("get_coach_public_profile_by_slug", { p_slug: slug });
        if (cancelled) return;
        // CC10: an RPC/network FAILURE is not a 404. Collapsing them told a visitor the
        // coach doesn't exist whenever the request merely failed — and gave them no retry.
        // `!data` (the RPC returned null) IS the genuine not-found case; `error` is not.
        if (error) {
          captureException(error, { source: "CoachPublicPage.getProfile" });
          setLoadError(error instanceof Error ? error : new Error(String(error)));
          return;
        }
        if (!data) {
          setNotFound(true);
          return;
        }
        const payload = data as unknown as CoachProfilePayload;
        setProfile(payload);

        // Secondary anon reads in parallel — each is best-effort; a null/error
        // result just omits its surface (stat / reputation block).
        const [bandRes, repRes, aggRes] = await Promise.all([
          supabase.rpc("get_coach_client_count_band", { p_coach_user_id: payload.coach_user_id }),
          supabase.rpc("get_coach_public_testimonials", { p_coach_user_id: payload.coach_user_id }),
          supabase.rpc("get_coach_rating_aggregate", { p_coach_user_id: payload.coach_user_id }),
        ]);
        if (cancelled) return;
        setClientBand(bandRes.data ?? null);
        setReputation((repRes.data as unknown as ReputationItem[]) ?? []);
        const agg = aggRes.data as unknown as { count: number; avg: number | null } | null;
        setAggregate(agg ?? { count: 0, avg: null });
      } catch (err) {
        if (!cancelled) {
          captureException(err, { source: "CoachPublicPage.load" });
          setLoadError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, reloadKey]);

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

  if (loadError) {
    return (
      <div className="mx-auto max-w-md px-4 py-20">
        <LoadError
          message="We couldn't load this coach profile. Check your connection and try again."
          onRetry={() => setReloadKey((k) => k + 1)}
        />
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

  // PUB11 — Schema.org JSON-LD from the SAME already-public data the page renders. The builder
  // enforces the honesty rule: no aggregateRating / review[] when there are no real reviews.
  const jsonLd = buildCoachJsonLd({
    name: fullName || profile.display_name || "IGU Coach",
    url: typeof window !== "undefined" ? window.location.href : `https://theigu.com/coaches/${slug ?? ""}`,
    description: seoDescription || null,
    image: profile.profile_picture_url,
    aggregate,
    reviews: reputation.map((r) => ({
      author: r.display_name, // the public display name only — no PII beyond the page
      rating: r.rating,
      body: r.feedback,
      datePublished: (r.created_at || "").slice(0, 10),
    })),
  });

  // Curated reviews (show_on_coach_page) → the card's reputationSlot. Undefined
  // when empty so the card omits the "What clients say" section.
  const reputationSlot = reputation.length > 0 ? (
    <div className="space-y-3">
      {reputation.map((r) => (
        <figure key={r.id} className="rounded-[10px] bg-muted p-3">
          <div className="mb-1.5 flex gap-0.5" aria-label={`${r.rating} / 5`}>
            {[1, 2, 3, 4, 5].map((s) => (
              <Star
                key={s}
                className={`h-3.5 w-3.5 ${s <= r.rating ? "fill-primary text-primary" : "text-muted-foreground/40"}`}
                aria-hidden
              />
            ))}
          </div>
          <blockquote className="text-[13px] leading-relaxed text-foreground">“{r.feedback}”</blockquote>
          {r.attachment_type === "weight_change" && r.attachment && (
            <WeightChangeProof attachment={r.attachment} note={r.attachment_note} className="mt-2" />
          )}
          <figcaption className="mt-1.5 text-[11.5px] text-muted-foreground">— {r.display_name}</figcaption>
        </figure>
      ))}
    </div>
  ) : undefined;

  return (
    <div className="mx-auto max-w-md px-4 py-8">
      <SEOHead
        title={`${fullName}${headline ? ` — ${headline}` : ""} | IGU`}
        description={seoDescription.slice(0, 200)}
        image={profile.profile_picture_url || undefined}
        type="profile"
      />
      {/* PUB11 — structured data. Google reads JSON-LD anywhere in the DOM; an inline script body
          is set via dangerouslySetInnerHTML (that IS the correct way to write a script body). */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
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
        rating={aggregate.avg ?? undefined}
        reviewCount={aggregate.count}
        reputationSlot={reputationSlot}
        onPrimaryCta={() => navigate(`/onboarding?coach=${profile.coach_user_id}`)}
      />
    </div>
  );
}
