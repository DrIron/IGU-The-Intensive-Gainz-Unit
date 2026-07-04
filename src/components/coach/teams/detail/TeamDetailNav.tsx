import { useCallback, useMemo, type KeyboardEvent } from "react";
import { Activity, Apple, BookOpen, Users, UserPlus, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { TEAM_SECTION_SLUGS, type TeamSectionSlug } from "./team-sections";

/**
 * Secondary nav for the Team Detail shell — a horizontal, scrollable tab bar
 * with an emerald underline on the active tab. Copied from ClientOverviewNav
 * (same vocabulary) minus the per-role filtering: team sections are always
 * coach/admin, so the full set always renders. Arrow keys cycle tabs.
 */
const SECTION_DEFS: Record<TeamSectionSlug, { label: string; icon: LucideIcon }> = {
  pulse: { label: "Pulse", icon: Activity },
  nutrition: { label: "Nutrition", icon: Apple },
  program: { label: "Program", icon: BookOpen },
  roster: { label: "Roster", icon: Users },
  waitlist: { label: "Waitlist", icon: UserPlus },
};

interface TeamDetailNavProps {
  activeSlug: TeamSectionSlug;
  onSelect: (slug: TeamSectionSlug) => void;
  /** Optional per-slug counter badges. Zero/nullish render nothing; >= 100 -> "99+". */
  badgeCounts?: Partial<Record<TeamSectionSlug, number>>;
  /** Visible slugs (owner gets all incl. waitlist; non-owner gets the filtered set). */
  slugs?: readonly TeamSectionSlug[];
}

export function TeamDetailNav({ activeSlug, onSelect, badgeCounts, slugs }: TeamDetailNavProps) {
  const visibleSlugs = useMemo<readonly TeamSectionSlug[]>(
    () => slugs ?? TEAM_SECTION_SLUGS,
    [slugs],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
      const horizontal = e.key === "ArrowRight" || e.key === "ArrowLeft";
      const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
      if (!horizontal && !vertical) return;
      e.preventDefault();
      const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + delta + visibleSlugs.length) % visibleSlugs.length;
      onSelect(visibleSlugs[next]);
      const root = e.currentTarget.closest("[data-team-nav]");
      const buttons = root?.querySelectorAll<HTMLButtonElement>("button[data-nav-item]");
      buttons?.[next]?.focus();
    },
    [onSelect, visibleSlugs],
  );

  return (
    <nav
      aria-label="Team sections"
      data-team-nav
      className="border-b border-border -mx-1 sticky top-16 z-10 bg-background/95 backdrop-blur"
    >
      <ul className="flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {visibleSlugs.map((slug, idx) => {
          const isActive = slug === activeSlug;
          const { label, icon: Icon } = SECTION_DEFS[slug];
          const badge = formatBadge(badgeCounts?.[slug]);
          return (
            <li key={slug} className="shrink-0">
              <button
                type="button"
                data-nav-item
                onClick={() => onSelect(slug)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap border-b-2 -mb-px px-3 py-2.5 text-sm transition-colors touch-manipulation",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                  isActive
                    ? "border-emerald-500 text-foreground font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{label}</span>
                {badge && (
                  <span
                    className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums"
                    aria-label={`${badge} flagged`}
                  >
                    {badge}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function formatBadge(count: number | undefined): string | null {
  if (!count || count <= 0) return null;
  return count >= 100 ? "99+" : String(count);
}
