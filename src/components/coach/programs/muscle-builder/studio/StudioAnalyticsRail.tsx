import { memo, useState } from "react";
import { Activity, BarChart3, ChevronRight, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = "volume" | "frequency" | "progression";

export interface StudioAnalyticsRailProps {
  /** Render the volume panel (usually VolumeOverview) */
  renderVolume: () => React.ReactNode;
  /** Render the frequency heatmap */
  renderFrequency: () => React.ReactNode;
  /** Render the progression overview — null if only one week exists */
  renderProgression?: () => React.ReactNode;
}

/**
 * Right-edge collapsible rail. Collapsed state is a 40px vertical strip
 * of icons — calendar takes the full width. Click any icon to expand
 * the panel to 340px with that view selected. Click the already-selected
 * icon (or the ✕) to collapse back.
 *
 * Separation of concerns: this component owns only the shell + tab state.
 * The analytics content stays in its existing components (VolumeOverview,
 * FrequencyHeatmap, ProgressionOverview) — we just switch them in.
 *
 * Keyboard: `[` / `]` cycle tabs, `Escape` collapses.
 */
export const StudioAnalyticsRail = memo(function StudioAnalyticsRail({
  renderVolume,
  renderFrequency,
  renderProgression,
}: StudioAnalyticsRailProps) {
  const [activeTab, setActiveTab] = useState<Tab | null>(null);

  const tabs: { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; render?: () => React.ReactNode }[] = [
    { id: "volume", label: "Volume", icon: BarChart3, render: renderVolume },
    { id: "frequency", label: "Frequency", icon: Activity, render: renderFrequency },
    { id: "progression", label: "Progression", icon: TrendingUp, render: renderProgression },
  ];

  const toggle = (tab: Tab) => setActiveTab((curr) => (curr === tab ? null : tab));
  const active = activeTab != null ? tabs.find((t) => t.id === activeTab) : null;

  return (
    <aside
      className={cn(
        "relative flex self-stretch bg-[hsl(220_14%_5%)] border-l border-white/[0.06]",
        "transition-[width] duration-200 ease-out",
        active ? "w-[340px]" : "w-10",
      )}
      onKeyDown={(e) => {
        if (e.key === "Escape") setActiveTab(null);
      }}
    >
      {/* Icon rail — always 40px */}
      <nav
        className="w-10 shrink-0 flex flex-col items-center py-3 gap-1 border-r border-white/[0.04]"
        aria-label="Analytics"
      >
        {tabs.map(({ id, label, icon: Icon, render }) => {
          const disabled = !render;
          const isActive = activeTab === id;
          return (
            <button
              key={id}
              type="button"
              disabled={disabled}
              onClick={() => toggle(id)}
              className={cn(
                "h-8 w-8 rounded-sm flex items-center justify-center transition-colors",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-white/40 hover:text-white/80 hover:bg-white/5",
                disabled && "opacity-30 cursor-not-allowed hover:bg-transparent hover:text-white/40",
              )}
              title={label}
              aria-label={label}
              aria-pressed={isActive}
            >
              <Icon className="h-4 w-4" />
            </button>
          );
        })}
      </nav>

      {/* Panel */}
      {active && (
        <div
          className="flex-1 min-w-0 flex flex-col overflow-hidden animate-in fade-in slide-in-from-right-2 duration-200"
          role="region"
          aria-label={`${active.label} analytics`}
        >
          <header className="flex items-center gap-2 px-3 h-10 border-b border-white/[0.06]">
            <active.icon className="h-3.5 w-3.5 text-white/50" aria-hidden />
            <h3 className="font-mono text-[11px] uppercase tracking-[0.18em] text-white/60">
              {active.label}
            </h3>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setActiveTab(null)}
              className="h-6 w-6 rounded-sm flex items-center justify-center text-white/40 hover:text-white hover:bg-white/5"
              aria-label="Collapse analytics"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </header>
          <div className="flex-1 overflow-y-auto p-3">{active.render?.()}</div>
        </div>
      )}
    </aside>
  );
});
