import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { ClientOverviewNav } from "./ClientOverviewNav";
import { SECTION_SLUGS, type SectionSlug } from "./sections";
<<<<<<< HEAD
import { useUnreadMessageCount } from "@/hooks/useUnreadMessageCount";
=======
>>>>>>> origin/main
import { OverviewTab } from "./tabs/OverviewTab";
import { ProgressTab } from "./tabs/ProgressTab";
import { NutritionTab } from "./tabs/NutritionTab";
import { WorkoutsTab } from "./tabs/WorkoutsTab";
import { SessionsTab } from "./tabs/SessionsTab";
import { MessagesTab } from "./tabs/MessagesTab";
import { CareTeamTab } from "./tabs/CareTeamTab";
import { ProfileInfoTab } from "./tabs/ProfileInfoTab";
import type { ClientContext } from "./types";

const DEFAULT_SLUG: SectionSlug = "overview";
const SLUG_SET = new Set<string>(SECTION_SLUGS);

interface ClientOverviewTabsProps {
  context: ClientContext;
}

/**
 * Orchestrates the Client Overview shell's secondary nav. Composes the
 * sidebar (left rail on desktop / horizontal scroller on mobile) with the
 * content panel for the active section. Deep-links via `?tab=<slug>` and
 * syncs the URL on selection so the coach can share a link that opens on
 * a specific section. Unknown slugs fall back to "overview".
 *
 * Backwards compat: the previous `?tab=overview|nutrition|workouts` URLs
 * still work -- those slugs remain in the registry.
 *
 * The shell (`CoachClientOverview.tsx`) owns all identity fetching
 * (profile / subscription / viewer role). This component is a layout-only
 * pass-through and does NOT refetch any of that data.
 */
export function ClientOverviewTabs({ context }: ClientOverviewTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { count: unreadMessages } = useUnreadMessageCount(context.clientUserId);

  const activeSlug = useMemo<SectionSlug>(() => {
    const raw = searchParams.get("tab");
    return raw && SLUG_SET.has(raw) ? (raw as SectionSlug) : DEFAULT_SLUG;
  }, [searchParams]);

  const handleSelect = useCallback(
    (next: SectionSlug) => {
      if (next === activeSlug) return;
      const nextParams = new URLSearchParams(searchParams);
      if (next === DEFAULT_SLUG) {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", next);
      }
      setSearchParams(nextParams, { replace: true });
    },
    [activeSlug, searchParams, setSearchParams],
  );

  return (
    <div className="md:flex md:gap-6 md:items-start">
<<<<<<< HEAD
      <ClientOverviewNav
        activeSlug={activeSlug}
        onSelect={handleSelect}
        badgeCounts={{ messages: unreadMessages }}
      />
=======
      <ClientOverviewNav activeSlug={activeSlug} onSelect={handleSelect} />
>>>>>>> origin/main
      <section className="flex-1 min-w-0 mt-4 md:mt-0">
        <SectionPanel slug={activeSlug} context={context} />
      </section>
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
    case "progress":
      return <ProgressTab context={context} />;
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
