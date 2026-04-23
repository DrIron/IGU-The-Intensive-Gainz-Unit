import { useCallback, type KeyboardEvent } from "react";
import {
  LayoutGrid,
  TrendingUp,
  Apple,
  Dumbbell,
  CalendarClock,
  MessageSquare,
  Users,
  UserCircle,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionSlug } from "./sections";

interface SectionDef {
  slug: SectionSlug;
  label: string;
  icon: LucideIcon;
}

const SECTIONS: readonly SectionDef[] = [
  { slug: "overview", label: "Overview", icon: LayoutGrid },
  { slug: "progress", label: "Progress", icon: TrendingUp },
  { slug: "nutrition", label: "Nutrition", icon: Apple },
  { slug: "workouts", label: "Workouts", icon: Dumbbell },
  { slug: "sessions", label: "Sessions", icon: CalendarClock },
  { slug: "messages", label: "Messages", icon: MessageSquare },
  { slug: "care-team", label: "Care Team", icon: Users },
  { slug: "profile", label: "Profile & Info", icon: UserCircle },
];

interface ClientOverviewNavProps {
  activeSlug: SectionSlug;
  onSelect: (slug: SectionSlug) => void;
<<<<<<< HEAD
  /**
   * Optional per-slug counter badges (e.g. unread messages). Zero / nullish
   * entries render nothing. Values >= 100 render as "99+".
   */
  badgeCounts?: Partial<Record<SectionSlug, number>>;
=======
>>>>>>> origin/main
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
 */
<<<<<<< HEAD
export function ClientOverviewNav({
  activeSlug,
  onSelect,
  badgeCounts,
}: ClientOverviewNavProps) {
=======
export function ClientOverviewNav({ activeSlug, onSelect }: ClientOverviewNavProps) {
>>>>>>> origin/main
  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLButtonElement>, idx: number) => {
      const horizontal = e.key === "ArrowRight" || e.key === "ArrowLeft";
      const vertical = e.key === "ArrowDown" || e.key === "ArrowUp";
      if (!horizontal && !vertical) return;
      e.preventDefault();
      const delta = e.key === "ArrowDown" || e.key === "ArrowRight" ? 1 : -1;
      const next = (idx + delta + SECTIONS.length) % SECTIONS.length;
      onSelect(SECTIONS[next].slug);
      const root = e.currentTarget.closest("[data-overview-nav]");
      const buttons = root?.querySelectorAll<HTMLButtonElement>("button[data-nav-item]");
      buttons?.[next]?.focus();
    },
    [onSelect],
  );

  return (
    <nav
      aria-label="Client sections"
      data-overview-nav
      className="md:w-56 lg:w-64 md:shrink-0 md:sticky md:top-20 md:self-start z-10"
    >
      {/* Mobile: horizontal scroller under the top nav. */}
      <div className="md:hidden -mx-4 px-4 pb-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <ul className="flex gap-2 min-w-max">
          {SECTIONS.map((section, idx) => {
            const isActive = section.slug === activeSlug;
            const Icon = section.icon;
<<<<<<< HEAD
            const badge = formatBadge(badgeCounts?.[section.slug]);
=======
>>>>>>> origin/main
            return (
              <li key={section.slug}>
                <button
                  type="button"
                  data-nav-item
                  onClick={() => onSelect(section.slug)}
                  onKeyDown={(e) => handleKeyDown(e, idx)}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
<<<<<<< HEAD
                    "relative flex flex-col items-center justify-center gap-1 px-3 rounded-lg border text-xs min-w-[84px] min-h-[56px] touch-manipulation active:scale-[0.98] transition-colors",
=======
                    "flex flex-col items-center justify-center gap-1 px-3 rounded-lg border text-xs min-w-[84px] min-h-[56px] touch-manipulation active:scale-[0.98] transition-colors",
>>>>>>> origin/main
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                    isActive
                      ? "border-emerald-500/50 bg-emerald-500/10 text-foreground"
                      : "border-border bg-card text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" aria-hidden="true" />
                  <span className="leading-none whitespace-nowrap">{section.label}</span>
<<<<<<< HEAD
                  {badge && (
                    <span
                      className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums"
                      aria-label={`${badge} unread`}
                    >
                      {badge}
                    </span>
                  )}
=======
>>>>>>> origin/main
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Desktop: sticky left rail. */}
      <ul className="hidden md:flex md:flex-col md:gap-1">
        {SECTIONS.map((section, idx) => {
          const isActive = section.slug === activeSlug;
          const Icon = section.icon;
<<<<<<< HEAD
          const badge = formatBadge(badgeCounts?.[section.slug]);
=======
>>>>>>> origin/main
          return (
            <li key={section.slug}>
              <button
                type="button"
                data-nav-item
                onClick={() => onSelect(section.slug)}
                onKeyDown={(e) => handleKeyDown(e, idx)}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "w-full flex items-stretch rounded-md overflow-hidden text-left transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                  isActive ? "bg-muted/50" : "hover:bg-muted/30",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn("w-1 shrink-0", isActive ? "bg-emerald-500" : "bg-transparent")}
                />
                <span className="flex-1 flex items-center gap-3 px-3 py-2">
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                    aria-hidden="true"
                  />
                  <span
                    className={cn(
<<<<<<< HEAD
                      "text-sm flex-1",
=======
                      "text-sm",
>>>>>>> origin/main
                      isActive ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {section.label}
                  </span>
<<<<<<< HEAD
                  {badge && (
                    <span
                      className="ml-auto shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold leading-none flex items-center justify-center tabular-nums"
                      aria-label={`${badge} unread`}
                    >
                      {badge}
                    </span>
                  )}
=======
>>>>>>> origin/main
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
<<<<<<< HEAD

function formatBadge(count: number | undefined): string | null {
  if (!count || count <= 0) return null;
  return count >= 100 ? "99+" : String(count);
}
=======
>>>>>>> origin/main
