import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OverviewTab } from "./tabs/OverviewTab";
import { NutritionTab } from "./tabs/NutritionTab";
import { WorkoutsTab } from "./tabs/WorkoutsTab";
import type { ClientContext } from "./types";

const TAB_VALUES = ["overview", "nutrition", "workouts"] as const;
type TabValue = (typeof TAB_VALUES)[number];

const DEFAULT_TAB: TabValue = "overview";

interface ClientOverviewTabsProps {
  context: ClientContext;
}

/**
 * Tab strip for the Client Overview page. Deep-links via `?tab=...` and
 * syncs the URL on selection so a coach can share a link that opens on
 * a specific tab. Unknown values fall back to "overview".
 */
export function ClientOverviewTabs({ context }: ClientOverviewTabsProps) {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo<TabValue>(() => {
    const raw = searchParams.get("tab");
    return TAB_VALUES.includes(raw as TabValue) ? (raw as TabValue) : DEFAULT_TAB;
  }, [searchParams]);

  const handleChange = useCallback(
    (next: string) => {
      const nextParams = new URLSearchParams(searchParams);
      if (next === DEFAULT_TAB) {
        nextParams.delete("tab");
      } else {
        nextParams.set("tab", next);
      }
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  return (
    <Tabs value={activeTab} onValueChange={handleChange} className="w-full">
      <TabsList className="grid w-full grid-cols-3 sticky top-16 z-10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
        <TabsTrigger value="workouts">Workouts</TabsTrigger>
      </TabsList>

      <TabsContent value="overview" className="mt-6">
        <OverviewTab context={context} />
      </TabsContent>
      <TabsContent value="nutrition" className="mt-6">
        <NutritionTab context={context} />
      </TabsContent>
      <TabsContent value="workouts" className="mt-6">
        <WorkoutsTab context={context} />
      </TabsContent>
    </Tabs>
  );
}
