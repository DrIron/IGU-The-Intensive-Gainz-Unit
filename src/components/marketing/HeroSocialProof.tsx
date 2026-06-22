import { Star } from "lucide-react";

interface HeroSocialProofProps {
  /** cmsContent?.social_proof — the homepage "social_proof" section map (may be undefined pre-CMS). */
  content?: Record<string, string>;
}

const FOUNDING_DEFAULT =
  "Founding cohort now open — onboarding our first members ahead of launch";

export function HeroSocialProof({ content }: HeroSocialProofProps) {
  // Founding line: shown by default; hidden only when admin sets founding_enabled = "false".
  const foundingEnabled = content?.founding_enabled !== "false";
  const foundingLine = (content?.founding_line ?? FOUNDING_DEFAULT).trim();
  const showFounding = foundingEnabled && foundingLine.length > 0;

  // Stat slots: each renders only if its *_value is a non-empty string.
  const stats = [1, 2, 3]
    .map((n) => ({
      value: (content?.[`stat${n}_value`] ?? "").trim(),
      label: (content?.[`stat${n}_label`] ?? "").trim(),
    }))
    .filter((s) => s.value.length > 0);

  if (!showFounding && stats.length === 0) return null;

  return (
    <div className="mt-8 flex flex-col items-center gap-3">
      {showFounding && (
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 border border-primary/20">
          <Star className="h-3.5 w-3.5 text-primary fill-current" aria-hidden />
          <span className="text-sm font-medium text-primary">{foundingLine}</span>
        </div>
      )}
      {stats.length > 0 && (
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          {stats.map((s, i) => (
            <div key={i} className="flex items-baseline gap-1.5">
              <span className="text-2xl font-bold text-foreground tabular-nums">{s.value}</span>
              {s.label && <span className="text-sm text-muted-foreground">{s.label}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
