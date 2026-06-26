import { useCallback, useMemo, type KeyboardEvent } from "react";
import {
  LayoutGrid,
  Apple,
  Dumbbell,
  CalendarClock,
  MessageSquare,
  Users,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { visibleSectionsForRole, type SectionSlug } from "./sections";
import type { ViewerRole } from "./types";

interface SectionDef {
  slug: SectionSlug;
  label: string;
  icon: LucideIcon;
}

/**
 * Label + icon for every slug in the registry. Module-scoped because it
 * never changes -- the per-role *visible subset* is derived inside the
 * component from this map.
 */
const SECTION_DEFS: Record<SectionSlug, { label: string; icon: LucideIcon }> = {
  overview: { label: "Overview", icon: LayoutGrid },
  nutrition: { label: "Nutrition", icon: Apple },
  workouts: { label: "Workouts", icon: Dumbbell },
  sessions: { label: "Sessions", icon: CalendarClock },
  messages: { label: "Messages", icon: MessageSquare },
  "care-team": { label: "Care Team", icon: Users },
  profile: { label: "Profile & Info", icon: UserCircle },
};

interface ClientOverviewNavProps {
  activeSlug: SectionSlug;
  onSelect: (slug: SectionSlug) => void;
  /** Resolved viewer role -- controls which sections are visible. */
  viewerRole: ViewerRole;
  /**
   * Optional per-slug counter badges (e.g. unread messages). Zero / nullish
   * entries render nothing. Values >= 100 render as "99+".
   */
  badgeCounts?: Partial<Record<SectionSlug, number>>;
}

/**
 * Secondary navigation for the coach-facing Client Overview shell.
 *
 * Desktop: sticky left rail -- each row is icon + label with an emerald
 * status rail on the left edge of the active row, echoing the
 * NutritionPhaseCard vocabulary.
 *
 * Mobile: horizontal scroller that hugs below the top nav, same sections
 * in icon-over-label pills. Arrow keys cycle through rows on both layouts.
 *
 * The visible section list is filtered by `viewerRole` -- a dietitian sees
 * a 6-tab subset (no Workouts / Sessions). Arrow-key cycling iterates the
 * filtered list, so a hidden slug can never be focused.
 */
export function ClientOverviewNav({
  activeSlug,
  onSelect,
  viewerRole,
  badgeCounts,
}: ClientOverviewNavProps) {
  const sections = useMemo<readonly SectionDef[]>(
    () =>
      visibleSectionsForRole(viewerRole).map((slug) => ({
        slug,
        ...SECTION_DEFS[slug],
      })),
    [viewerRole],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
      const horizontal = e.key === "ArrowRight" || e.key === "ArrowLeft";
      const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
      if (!horizontal && !vertical) return;
      e.preventDefault();
      const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + delta + sections.length) % sections.length;
      onSelect(sections[next].slug);
      const root = e.currentTarget.closest("[data-overview-nav]");
      const buttons = root?.querySelectorAll<HTMLButtonElement>("button[data-nav-item]");
      buttons?.[next]?.focus();
    },
    [onSelect, sections],
  );

  // Horizontal, scrollable tab bar (underline-active). Replaces the old left
  // rail -- the rail + the master strip + the vitals rail were three vertical
  // columns squeezing the main content; moving sections to top tabs reclaims
  // ~224px of width.
  return (
    <nav
      aria-label="Client sections"
      data-overview-nav
      className="border-b border-border -mx-1 sticky top-16 z-10 bg-background/95 backdrop-blur"
    >
      <ul className="flex gap-1 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {sections.map((section, idx) => {
          const isActive = section.slug === activeSlug;
          const Icon = section.icon;
          const badge = formatBadge(badgeCounts?.[section.slug]);
          return (
            <li key={section.slug} className="shrink-0">
              <button
                type="button"
                data-nav-item
                onClick={() => onSelect(section.slug)}
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
                <span>{section.label}</span>
                {badge && (
                  <span
                    className="ml-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums"
                    aria-label={`${badge} unread`}
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
