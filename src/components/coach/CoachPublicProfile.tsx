import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Play, MapPin, Instagram, Youtube, Music2, Ghost, Dumbbell, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { toEmbed } from "@/lib/videoUrl";

/**
 * CoachPublicProfile — presentational client-facing coach card (CPR2, spec §6).
 *
 * Pure props in: NO data fetching, NO Supabase calls, NO hooks that touch the
 * network. Both the editor Preview (`CoachProfile.tsx`, live form state) and the
 * public `/coaches/:slug` page (`CoachPublicPage.tsx`) mount it. T1 later injects
 * the reputation block via `reputationSlot` and supplies `rating` / `reviewCount`.
 *
 * i18n: localized via react-i18next (`common` ns, `coach*` keys) with Arabic +
 * RTL dir-flip (T2, spec §7) — required before shipping public.
 */
export interface CoachPublicProfileProps {
  coach: {
    firstName: string;
    lastName?: string | null;
    nickname?: string | null;
    /** e.g. "Head Coach · Strength & Physique". Derive via deriveCoachHeadline. */
    headline?: string | null;
    avatarUrl?: string | null;
    location?: string | null;
    bio?: string | null;
    shortBio?: string | null;
    /** Pre-resolved display labels (resolve values via useSpecializationTags getLabel). */
    specializations?: string[];
    qualifications?: string[];
    gyms?: { id: string; name: string }[];
    socials?: { instagram?: string | null; tiktok?: string | null; youtube?: string | null; snapchat?: string | null };
    introVideoUrl?: string | null;
    yearsExperience?: number | null;
    /** Pre-rounded "N+" band or null (§3.2); supplied by T2/CPR3, not computed here. */
    clientCount?: number | null;
  };
  /** From the testimonials aggregate (T2); undefined in Preview → "New coach" state. */
  rating?: number | null;
  reviewCount?: number | null;
  /** T2 injects the curated-testimonials block here. */
  reputationSlot?: React.ReactNode;
  onPrimaryCta?: () => void;
  variant?: "preview" | "public";
}

/**
 * Derive the hero headline from the coach's role fields.
 * Head coach → "Head Coach · <spec>"; else the level; else the primary specialty.
 * Exported so every caller builds the headline the same way.
 */
export function deriveCoachHeadline(input: {
  isHeadCoach?: boolean | null;
  headCoachSpecialisation?: string | null;
  coachLevel?: string | null;
  primarySpecialty?: string | null;
}): string | null {
  if (input.isHeadCoach) {
    return input.headCoachSpecialisation ? `Head Coach · ${input.headCoachSpecialisation}` : "Head Coach";
  }
  if (input.coachLevel) {
    const level = input.coachLevel.charAt(0).toUpperCase() + input.coachLevel.slice(1);
    return input.primarySpecialty ? `${level} Coach · ${input.primarySpecialty}` : `${level} Coach`;
  }
  return input.primarySpecialty || null;
}

/** Section wrapper — editorial block with a bottom divider (mockup .psec). */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-3.5 border-b border-border last:border-b-0">
      <h3 className="font-mono text-[11px] uppercase tracking-[0.1em] text-muted-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function initials(firstName: string, lastName?: string | null): string {
  return `${firstName.charAt(0)}${lastName?.charAt(0) ?? ""}`.toUpperCase();
}

/** Only allow http(s) hrefs for social links (guards junk stored in the form). */
function safeHref(url?: string | null): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  return /^https?:\/\//i.test(trimmed) ? trimmed : null;
}

const SOCIAL_ICONS = { instagram: Instagram, youtube: Youtube, tiktok: Music2, snapchat: Ghost } as const;

export function CoachPublicProfile({
  coach,
  rating,
  reviewCount,
  reputationSlot,
  onPrimaryCta,
  variant = "public",
}: CoachPublicProfileProps) {
  const { t } = useTranslation("common");
  const [videoOpen, setVideoOpen] = useState(false);

  const fullName = [coach.firstName, coach.lastName].filter(Boolean).join(" ");
  const specialties = (coach.specializations ?? []).filter(Boolean);
  const quals = (coach.qualifications ?? []).filter(Boolean);
  const gyms = coach.gyms ?? [];
  const about = coach.bio?.trim() || coach.shortBio?.trim() || null;

  const embed = coach.introVideoUrl ? toEmbed(coach.introVideoUrl) : null;

  const hasRating = rating != null;
  const socialEntries = (Object.keys(SOCIAL_ICONS) as (keyof typeof SOCIAL_ICONS)[])
    .map((key) => ({ key, href: safeHref(coach.socials?.[key]) }))
    .filter((s): s is { key: keyof typeof SOCIAL_ICONS; href: string } => s.href != null);

  // Stats row — render only stats that have a value; hide the row if all null (§6.2).
  const stats: { label: string; value: string }[] = [];
  if (coach.yearsExperience != null) stats.push({ label: "Years", value: `${coach.yearsExperience}+` });
  if (coach.clientCount != null) stats.push({ label: "Clients", value: `${coach.clientCount}+` });
  if (hasRating) stats.push({ label: "Rating", value: rating!.toFixed(1) });

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card text-card-foreground">
      {/* Hero — photo or gradient + shade + Bebas name + headline (§6.2). */}
      <div className="relative flex h-52 items-end overflow-hidden">
        {coach.avatarUrl ? (
          <img src={coach.avatarUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-br from-primary/25 via-muted to-background">
            <span className="font-display text-6xl text-muted-foreground/60">{initials(coach.firstName, coach.lastName)}</span>
            <Dumbbell className="absolute bottom-2 right-3 h-28 w-28 text-foreground/5" aria-hidden />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" aria-hidden />
        <div className="relative z-[1] p-4">
          <div className="font-display text-4xl leading-none tracking-wide text-white">{fullName}</div>
          {coach.headline && <div className="mt-1 text-xs font-medium text-white/85">{coach.headline}</div>}
        </div>
      </div>

      {/* Stats row */}
      {stats.length > 0 && (
        <div className="flex gap-1.5 border-b border-border px-4 py-3.5">
          {stats.map((s) => (
            <div key={s.label} className="flex-1 text-center">
              <div className="font-mono text-lg font-semibold text-foreground">{s.value}</div>
              <div className="mt-0.5 text-[10px] uppercase tracking-[0.06em] text-muted-foreground">{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* New-coach state — graceful, no 0.0 rating (§3.2). */}
      {!hasRating && (
        <div className="flex items-center gap-2 border-b border-border px-4 py-2.5 text-xs text-muted-foreground">
          <Star className="h-3.5 w-3.5 text-primary" aria-hidden />
          <span>{t("coachNewCoach", { defaultValue: "New coach — building their reputation" })}</span>
        </div>
      )}

      <div className="px-4">
        {/* Specialties */}
        {specialties.length > 0 && (
          <Section title={t("coachSpecialties", { defaultValue: "Specialties" })}>
            <div className="flex flex-wrap gap-2">
              {specialties.map((label) => (
                <span
                  key={label}
                  className="inline-flex items-center rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
                >
                  {label}
                </span>
              ))}
            </div>
          </Section>
        )}

        {/* About + intro video */}
        {(about || embed) && (
          <Section title={t("coachAbout", { defaultValue: "About" })}>
            {about && <p className="text-sm leading-relaxed text-foreground">{about}</p>}
            {embed && (
              <div className={cn(about && "mt-2.5")}>
                {!videoOpen ? (
                  <button
                    type="button"
                    onClick={() => setVideoOpen(true)}
                    aria-label={t("coachWatchIntro", { name: coach.firstName, defaultValue: "Watch a 30-sec intro from {{name}}" })}
                    className="flex w-full items-center gap-2.5 rounded-[10px] bg-muted px-3 py-2.5 text-left text-xs text-foreground transition-colors hover:bg-muted/80"
                  >
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Play className="h-3.5 w-3.5 fill-current" aria-hidden />
                    </span>
                    {t("coachWatchIntro", { name: coach.firstName, defaultValue: "Watch a 30-sec intro from {{name}}" })}
                  </button>
                ) : (
                  <div className="overflow-hidden rounded-[10px] bg-black">
                    {embed.provider === "mp4" ? (
                      <video src={embed.embedUrl} controls autoPlay className="aspect-video w-full" />
                    ) : (
                      <iframe
                        src={embed.embedUrl}
                        title={`Intro from ${coach.firstName}`}
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowFullScreen
                        className="aspect-video w-full"
                      />
                    )}
                  </div>
                )}
              </div>
            )}
          </Section>
        )}

        {/* Certified */}
        {quals.length > 0 && (
          <Section title={t("coachCertified", { defaultValue: "Certified" })}>
            <div className="space-y-1">
              {quals.map((q, i) => (
                <div key={i} className="text-sm text-foreground">{q}</div>
              ))}
            </div>
          </Section>
        )}

        {/* Trains at */}
        {gyms.length > 0 && (
          <Section title={t("coachTrainsAt", { defaultValue: "Trains at" })}>
            <div className="space-y-1">
              {gyms.map((gym) => (
                <div key={gym.id} className="flex items-center gap-2 text-sm text-foreground">
                  <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
                  {gym.name}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Located */}
        {coach.location && (
          <Section title={t("coachLocated", { defaultValue: "Located" })}>
            <div className="text-sm text-foreground">{coach.location}</div>
          </Section>
        )}

        {/* What clients say — T2's reputation block */}
        {reputationSlot && <Section title={t("coachWhatClientsSay", { defaultValue: "What clients say" })}>{reputationSlot}</Section>}

        {/* Follow */}
        {socialEntries.length > 0 && (
          <Section title={t("coachFollow", { defaultValue: "Follow" })}>
            <div className="flex gap-2.5">
              {socialEntries.map(({ key, href }) => {
                const Icon = SOCIAL_ICONS[key];
                return (
                  <a
                    key={key}
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={key}
                    className="flex h-9 w-9 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-foreground"
                  >
                    <Icon className="h-4 w-4" aria-hidden />
                  </a>
                );
              })}
            </div>
          </Section>
        )}
      </div>

      {/* CTA — public variant only; preview hides the route wiring (§6.2). */}
      {variant === "public" && (
        <div className="flex flex-col gap-2 border-t border-border p-4">
          <Button type="button" onClick={onPrimaryCta} className="w-full">
            {t("coachChoose", { name: coach.firstName, defaultValue: "Choose {{name}}" })}
          </Button>
        </div>
      )}

      {reviewCount != null && reviewCount > 0 && (
        <p className="px-4 pb-3 text-[11px] text-muted-foreground">
          {t("coachBasedOnReviews", { count: reviewCount, defaultValue: "Based on {{count}} reviews" })}
        </p>
      )}
    </div>
  );
}

export default CoachPublicProfile;
