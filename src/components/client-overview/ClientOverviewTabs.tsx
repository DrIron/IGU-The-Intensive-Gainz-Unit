import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ClientOverviewNav } from "./ClientOverviewNav";
import { ClientVitalsRail } from "./ClientVitalsRail";
import {
  defaultSectionForRole,
  visibleSectionsForRole,
  type SectionSlug,
} from "./sections";
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
import { OverviewTab } from "./tabs/OverviewTab";
import { NutritionTab } from "./tabs/NutritionTab";
import { WorkoutsTab } from "./tabs/WorkoutsTab";
import { SessionsTab } from "./tabs/SessionsTab";
import { MessagesTab } from "./tabs/MessagesTab";
import { CareTeamTab } from "./tabs/CareTeamTab";
import { ProfileInfoTab } from "./tabs/ProfileInfoTab";
import type { ClientContext } from "./types";

interface ClientOverviewTabsProps {
  context: ClientContext;
}

/**
 * Orchestrates the Client Overview shell's secondary nav. Composes the
 * sidebar (left rail on desktop / horizontal scroller on mobile) with the
 * content panel for the active section. Deep-links via `?tab=<slug>` and
 * syncs the URL on selection so the coach can share a link that opens on
 * a specific section.
 *
 * Per-role visibility: the visible tab set + default slug are derived from
 * `context.viewerRole` (see `sections.ts`). A dietitian sees a 6-tab subset
 * defaulting to Nutrition; coach/admin keep all 8 defaulting to Overview.
 *
 * Deep-link degradation: a `?tab=<slug>` pointing at a tab the current role
 * can't see (e.g. a coach shares `?tab=workouts` with a dietitian) is
 * stripped from the URL via a `replace` navigation, so the viewer lands on
 * their default tab with a clean URL and the back button doesn't bounce
 * them back to the hidden tab. Unknown slugs degrade the same way.
 *
 * The shell (`CoachClientOverview.tsx`) owns all identity fetching
 * (profile / subscription / viewer role). This component is a layout-only
 * pass-through and does NOT refetch any of that data.
 */
export function ClientOverviewTabs({ context }: ClientOverviewTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { count: unreadMessages } = useUnreadMessageCount(context.clientUserId);

  const defaultSlug = defaultSectionForRole(context.viewerRole);

  // Memoised on role so the useEffect below has a stable dependency -- a
  // fresh Set every render would re-fire the URL-rewrite effect needlessly.
  const visibleSet = useMemo(
    () => new Set<string>(visibleSectionsForRole(context.viewerRole)),
    [context.viewerRole],
  );

  const activeSlug = useMemo<SectionSlug>(() => {
    const raw = searchParams.get("tab");
    // Membership in visibleSet guarantees `raw` is a SectionSlug the role
    // can see; the cast just narrows the validated string.
    return raw && visibleSet.has(raw) ? (raw as SectionSlug) : defaultSlug;
  }, [searchParams, visibleSet, defaultSlug]);

  // Strip a `?tab` param that points at a slug the current role can't see
  // (or an unknown slug). `replace: true` keeps it out of history so the
  // back button can't return to the hidden tab. A `?tab=<defaultSlug>` is
  // left alone -- it's valid, and clearing it here would diverge from the
  // existing coach/admin behaviour where the param only clears on select.
  useEffect(() => {
    const raw = searchParams.get("tab");
    if (raw && !visibleSet.has(raw)) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete("tab");
      setSearchParams(nextParams, { replace: true });
    }
  }, [searchParams, visibleSet, setSearchParams]);

  const handleSelect = useCallback(
    (next: SectionSlug) => {
      if (next === activeSlug) return;
      const nextParams = new URLSearchParams(searchParams);
      if (next === defaultSlug) {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", next);
      }
      setSearchParams(nextParams, { replace: true });
    },
    [activeSlug, defaultSlug, searchParams, setSearchParams],
  );

  return (
    <div className="md:flex md:gap-6 md:items-start">
      <ClientOverviewNav
        activeSlug={activeSlug}
        onSelect={handleSelect}
        viewerRole={context.viewerRole}
        badgeCounts={{ messages: unreadMessages }}
      />
      {/* Main + persistent vitals rail. Below xl the rail pins to the top
          (order-first) as a compact summary; at xl+ it becomes a sticky right
          column (order-last). One mount -- layouts are CSS-gated inside the
          rail (see ClientVitalsRail). */}
      <div className="flex-1 min-w-0 mt-4 md:mt-0 flex flex-col xl:flex-row xl:gap-6 xl:items-start">
        <ClientVitalsRail
          context={context}
          className="order-first xl:order-last xl:w-72 xl:shrink-0 xl:sticky xl:top-20 mb-4 xl:mb-0"
        />
        <section className="flex-1 min-w-0">
          <SectionPanel slug={activeSlug} context={context} />
        </section>
      </div>
    </div>
  );
}

function SectionPanel({
  slug,
  context,
}: {
  slug: SectionSlug;
  context: ClientContext;
}) {
  switch (slug) {
    case "overview":
      return <OverviewTab context={context} />;
    case "nutrition":
      return <NutritionTab context={context} />;
    case "workouts":
      return <WorkoutsTab context={context} />;
    case "sessions":
      return <SessionsTab context={context} />;
    case "messages":
      return <MessagesTab context={context} />;
    case "care-team":
      return <CareTeamTab context={context} />;
    case "profile":
      return <ProfileInfoTab context={context} />;
  }
}
