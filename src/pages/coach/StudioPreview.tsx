import { useState } from "react";
import { DragDropContext } from "@hello-pangea/dnd";
import { Link } from "react-router-dom";
import { ChevronLeft } from "lucide-react";
import {
  StudioDayColumn,
  StudioSaveStatus,
  StudioAnalyticsRail,
  type SaveState,
} from "@/components/coach/programs/muscle-builder/studio";
import type { MuscleSlotData } from "@/types/muscle-builder";

/**
 * Visual preview of the Studio-edition Planning Board components.
 *
 * Hand-rolled sample data — no reducer wiring, no Supabase. The drag
 * handlers are no-ops. This exists only so the aesthetic can be evaluated
 * side-by-side with the live Planning Board at /coach/programs.
 *
 * Delete this file (and the /coach/studio-preview route in App.tsx) if
 * the design direction is rejected.
 */
export default function StudioPreview() {
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(Date.now() - 3000);

  // Cycle through save states so you can see all four variants without
  // triggering a real save
  const cycleSaveState = () => {
    const order: SaveState[] = ["saved", "dirty", "saving", "error"];
    setSaveState((curr) => {
      const next = order[(order.indexOf(curr) + 1) % order.length];
      if (next === "saved") setLastSavedAt(Date.now());
      return next;
    });
  };

  return (
    <DragDropContext onDragEnd={() => {}}>
      <div className="min-h-screen bg-[hsl(220_20%_4%)] text-white">
        {/* Back link */}
        <div className="max-w-[1440px] mx-auto px-6 pt-6">
          <Link
            to="/coach/programs"
            className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-white/50 hover:text-white transition-colors"
          >
            <ChevronLeft className="h-3 w-3" />
            Back to live Planning Board
          </Link>
        </div>

        {/* Header row */}
        <header className="max-w-[1440px] mx-auto px-6 py-4 flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="font-display text-3xl leading-none tracking-wide">CLASSIC SERIES PPPPL</h1>
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40 mt-1.5">
              5 training days · 21 muscles · 116 sets / week
            </p>
          </div>
          <button
            onClick={cycleSaveState}
            className="text-[10px] font-mono text-white/30 uppercase tracking-widest hover:text-white/60 transition-colors"
            title="Click to cycle save states"
          >
            cycle state ↻
          </button>
          <StudioSaveStatus
            state={saveState}
            lastSavedAt={lastSavedAt}
            errorMessage="RLS rejected"
            onSave={saveState === "dirty" || saveState === "error" ? () => setSaveState("saving") : undefined}
          />
          <button className="px-4 h-9 rounded-md bg-[#f43f5e] hover:bg-[#e11d48] transition-colors text-sm font-medium">
            Convert to Program
          </button>
        </header>

        {/* Week strip */}
        <div className="max-w-[1440px] mx-auto px-6 pb-2 flex items-center gap-3">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-white/40">Week</span>
          <div className="flex items-center gap-1">
            <button className="h-7 px-3 rounded-sm bg-white/10 text-white font-mono text-[11px] tabular-nums">
              1
            </button>
            <button className="h-7 px-3 rounded-sm hover:bg-white/5 text-white/40 font-mono text-[11px] tabular-nums">
              +
            </button>
          </div>
          <div className="flex-1" />
        </div>

        {/* Calendar + analytics rail */}
        <div className="flex max-w-[1440px] mx-auto">
          <div className="flex-1 min-w-0 px-6 pb-16">
            <div className="grid grid-cols-7 gap-0">
              <StudioDayColumn
                dayIndex={1}
                slots={sampleMonday}
                isSelected
                onSelectDay={() => {}}
                onOpenSlot={() => {}}
                onAddMuscle={() => {}}
              />
              <StudioDayColumn
                dayIndex={2}
                slots={sampleTuesday}
                isSelected={false}
                onSelectDay={() => {}}
                onOpenSlot={() => {}}
                onAddMuscle={() => {}}
              />
              <StudioDayColumn
                dayIndex={3}
                slots={[]}
                isSelected={false}
                onSelectDay={() => {}}
                onOpenSlot={() => {}}
                onAddMuscle={() => {}}
              />
              <StudioDayColumn
                dayIndex={4}
                slots={sampleThursday}
                isSelected={false}
                onSelectDay={() => {}}
                onOpenSlot={() => {}}
                onAddMuscle={() => {}}
              />
              <StudioDayColumn
                dayIndex={5}
                slots={sampleFriday}
                isSelected={false}
                onSelectDay={() => {}}
                onOpenSlot={() => {}}
                onAddMuscle={() => {}}
              />
              <StudioDayColumn
                dayIndex={6}
                slots={sampleSaturday}
                isSelected={false}
                onSelectDay={() => {}}
                onOpenSlot={() => {}}
                onAddMuscle={() => {}}
              />
              <StudioDayColumn
                dayIndex={7}
                slots={[]}
                isSelected={false}
                onSelectDay={() => {}}
                onOpenSlot={() => {}}
                onAddMuscle={() => {}}
              />
            </div>

            {/* Explanatory footer — only here on preview */}
            <p className="mt-6 text-[11px] text-white/30 font-mono uppercase tracking-widest">
              preview · sample data · drag is a no-op
            </p>
          </div>
          <StudioAnalyticsRail
            renderVolume={() => (
              <div className="space-y-3">
                <p className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                  per-muscle weekly sets
                </p>
                <VolumeBarMock />
              </div>
            )}
            renderFrequency={() => (
              <div className="space-y-3">
                <p className="text-[11px] font-mono uppercase tracking-widest text-white/40">
                  frequency · muscle × day
                </p>
                <p className="text-xs text-white/40">
                  The existing FrequencyHeatmap component would live here.
                </p>
              </div>
            )}
          />
        </div>
      </div>
    </DragDropContext>
  );
}

/** Mock of the volume analytics panel — sparkline-style horizontal bars */
function VolumeBarMock() {
  const rows: Array<{ muscle: string; sets: number; color: string; pct: number; zone: string }> = [
    { muscle: "Shoulders", sets: 19, color: "#f97316", pct: 85, zone: "productive" },
    { muscle: "Pecs", sets: 17, color: "#f43f5e", pct: 75, zone: "productive" },
    { muscle: "Elbow Flex", sets: 15, color: "#6366f1", pct: 68, zone: "productive" },
    { muscle: "Triceps", sets: 10, color: "#f59e0b", pct: 55, zone: "maintenance" },
    { muscle: "Lats", sets: 18, color: "#3b82f6", pct: 72, zone: "productive" },
    { muscle: "Upper/Mid Back", sets: 7, color: "#0ea5e9", pct: 35, zone: "below MV" },
    { muscle: "Quads", sets: 7, color: "#10b981", pct: 32, zone: "maintenance" },
    { muscle: "Hamstrings", sets: 7, color: "#22c55e", pct: 30, zone: "productive" },
    { muscle: "Glutes", sets: 7, color: "#84cc16", pct: 30, zone: "productive" },
    { muscle: "Calves", sets: 7, color: "#14b8a6", pct: 35, zone: "productive" },
  ];

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.muscle} className="flex items-center gap-2 text-[11px]">
          <span
            className="h-2 w-2 rounded-full shrink-0"
            style={{ backgroundColor: r.color }}
          />
          <span className="w-24 truncate text-white/70">{r.muscle}</span>
          <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full"
              style={{ width: `${r.pct}%`, backgroundColor: r.color }}
            />
          </div>
          <span className="font-mono tabular-nums text-white/80 w-6 text-right">
            {r.sets}
          </span>
          <span
            className="font-mono text-[9px] uppercase tracking-wider w-16 text-right"
            style={{ color: r.zone === "below MV" ? "#9ca3af" : r.zone === "maintenance" ? "#fbbf24" : "#10b981" }}
          >
            {r.zone}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Sample data ────────────────────────────────────────────────────

function slot(id: string, muscleId: string, dayIndex: number, overrides: Partial<MuscleSlotData> = {}): MuscleSlotData {
  return {
    id,
    muscleId,
    dayIndex,
    sets: 4,
    repMin: 8,
    repMax: 12,
    sortOrder: 0,
    ...overrides,
  } as MuscleSlotData;
}

const sampleMonday: MuscleSlotData[] = [
  slot("mon-1", "pecs_sternal", 1, { sets: 4, repMin: 6, repMax: 8, tempo: "2010", rir: 2 }),
  slot("mon-2", "quads_rectus_femoris", 1, { sets: 4, repMin: 6, repMax: 8, tempo: "2010", rir: 2 }),
  slot("mon-3", "shoulders_anterior", 1, { sets: 3, repMin: 6, repMax: 8, tempo: "2010", rir: 2 }),
  slot("mon-4", "pecs_clavicular", 1, { sets: 4, repMin: 8, repMax: 12, tempo: "2010", rir: 2 }),
  slot("mon-5", "triceps_long", 1, { sets: 4, repMin: 8, repMax: 10, tempo: "3010" }),
  slot("mon-6", "shoulders_lateral", 1, { sets: 4, repMin: 8, repMax: 10, tempo: "3010" }),
  slot("mon-7", "calves_gastrocnemius", 1, { sets: 4, repMin: 8, repMax: 10, tempo: "3010" }),
];

const sampleTuesday: MuscleSlotData[] = [
  slot("tue-1", "upper_back_upper_traps", 2, { sets: 4, repMin: 6, repMax: 8, tempo: "2010" }),
  slot("tue-2", "glutes_max", 2, { sets: 4, repMin: 6, repMax: 8 }),
  slot("tue-3", "shoulders_posterior", 2, { sets: 4, repMin: 6, repMax: 8 }),
  slot("tue-4", "lats_iliac", 2, { sets: 4, repMin: 6, repMax: 8 }),
  slot("tue-5", "hamstrings", 2, { sets: 3, repMin: 8, repMax: 10 }),
  slot("tue-6", "elbow_flexors_biceps_short", 2, { sets: 3, repMin: 8, repMax: 10, tempo: "3010" }),
  slot("tue-7", "tibialis_anterior", 2, { sets: 4, repMin: 8, repMax: 10 }),
];

const sampleThursday: MuscleSlotData[] = [
  slot("thu-1", "pecs_sternal", 4, { sets: 3, repMin: 8, repMax: 12 }),
  slot("thu-2", "shoulders_anterior", 4, { sets: 3, repMin: 8, repMax: 12 }),
  slot("thu-3", "pecs_clavicular", 4, { sets: 3, repMin: 8, repMax: 12 }),
  slot("thu-4", "triceps_lat_med", 4, { sets: 3, repMin: 8, repMax: 12 }),
  slot("thu-5", "shoulders_lateral", 4, { sets: 3, repMin: 8, repMax: 12 }),
  slot("thu-6", "pecs_costal", 4, { sets: 3, repMin: 8, repMax: 12 }),
  slot("thu-7", "triceps_long", 4, { sets: 3, repMin: 8, repMax: 12 }),
  slot("thu-8", "shoulders_posterior", 4, { sets: 3, repMin: 8, repMax: 12 }),
];

const sampleFriday: MuscleSlotData[] = [
  slot("fri-1", "upper_back_upper_traps", 5, { sets: 3, repMin: 8, repMax: 12 }),
  slot("fri-2", "lats_thoracic", 5, { sets: 3, repMin: 8, repMax: 12 }),
  slot("fri-3", "lats_iliac", 5, { sets: 3, repMin: 8, repMax: 12 }),
  slot("fri-4", "elbow_flexors_brachialis", 5, { sets: 3, repMin: 8, repMax: 12 }),
  slot("fri-5", "elbow_flexors_biceps_long", 5, { sets: 3, repMin: 8, repMax: 12 }),
  slot("fri-6", "elbow_flexors_biceps_short", 5, { sets: 3, repMin: 8, repMax: 12 }),
];

const sampleSaturday: MuscleSlotData[] = [
  slot("sat-1", "hamstrings", 6, { sets: 3, repMin: 8, repMax: 12 }),
  slot("sat-2", "quads_vastus_lateralis", 6, { sets: 3, repMin: 8, repMax: 12 }),
  slot("sat-3", "glutes_med", 6, { sets: 3, repMin: 8, repMax: 12 }),
  slot("sat-4", "adductors", 6, { sets: 3, repMin: 8, repMax: 12 }),
  slot("sat-5", "calves_soleus", 6, { sets: 3, repMin: 8, repMax: 12 }),
  slot("sat-6", "core_rectus_abdominis", 6, { sets: 3, repMin: 8, repMax: 12 }),
];
