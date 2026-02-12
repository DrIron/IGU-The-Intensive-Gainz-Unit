import { memo, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import {
  MUSCLE_GROUPS,
  MUSCLE_MAP,
  DAYS_OF_WEEK,
  type MuscleSlotData,
} from "@/types/muscle-builder";

interface FrequencyHeatmapProps {
  slots: MuscleSlotData[];
  frequencyMatrix: Map<string, Map<number, number>>;
  consecutiveDayWarnings: Set<string>;
}

export const FrequencyHeatmap = memo(function FrequencyHeatmap({
  slots,
  frequencyMatrix,
  consecutiveDayWarnings,
}: FrequencyHeatmapProps) {
  // Only show muscles that are used
  const activeMuscles = useMemo(
    () => MUSCLE_GROUPS.filter(m => frequencyMatrix.has(m.id)),
    [frequencyMatrix]
  );

  if (activeMuscles.length === 0) {
    return (
      <div className="text-center py-8 text-sm text-muted-foreground">
        Add muscles to see frequency heatmap
      </div>
    );
  }

  // Check consecutive days for a specific muscle/day combo
  const isConsecutive = (muscleId: string, dayIndex: number): boolean => {
    const row = frequencyMatrix.get(muscleId);
    if (!row) return false;
    const prevDay = dayIndex > 1 ? dayIndex - 1 : null;
    const nextDay = dayIndex < 7 ? dayIndex + 1 : null;
    return (prevDay !== null && row.has(prevDay)) || (nextDay !== null && row.has(nextDay));
  };

  return (
    <div className="space-y-3">
      {consecutiveDayWarnings.size > 0 && (
        <div className="flex items-start gap-2 text-xs text-amber-400 bg-amber-500/5 rounded-md p-2 border border-amber-500/20">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
          <div>
            {Array.from(consecutiveDayWarnings).map(w => (
              <p key={w}>{w}</p>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr>
              <th className="text-left py-1 pr-3 font-medium text-muted-foreground w-28">Muscle</th>
              {DAYS_OF_WEEK.map((day, i) => (
                <th key={day} className="text-center py-1 px-1 font-medium text-muted-foreground w-10">
                  {day}
                </th>
              ))}
              <th className="text-center py-1 pl-2 font-medium text-muted-foreground w-10">Freq</th>
            </tr>
          </thead>
          <tbody>
            {activeMuscles.map(muscle => {
              const row = frequencyMatrix.get(muscle.id);
              const frequency = row?.size || 0;

              return (
                <tr key={muscle.id} className="border-t border-border/20">
                  <td className="py-1 pr-3">
                    <div className="flex items-center gap-1.5">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${muscle.colorClass}`} />
                      <span className="font-medium truncate">{muscle.label}</span>
                    </div>
                  </td>
                  {[1, 2, 3, 4, 5, 6, 7].map(dayIndex => {
                    const sets = row?.get(dayIndex);
                    const hasConsecutive = sets != null && isConsecutive(muscle.id, dayIndex);
                    return (
                      <td key={dayIndex} className="py-1 px-1 text-center">
                        {sets != null ? (
                          <div
                            className={`inline-flex items-center justify-center w-7 h-6 rounded text-[10px] font-mono font-medium ${
                              hasConsecutive
                                ? 'ring-1 ring-amber-500/50'
                                : ''
                            }`}
                            style={{
                              backgroundColor: `${muscle.colorHex}25`,
                              color: muscle.colorHex,
                            }}
                          >
                            {sets}
                          </div>
                        ) : (
                          <span className="text-muted-foreground/20">-</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="py-1 pl-2 text-center">
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${
                        frequency >= 3
                          ? 'text-emerald-400 border-emerald-500/30'
                          : frequency === 2
                          ? 'text-blue-400 border-blue-500/30'
                          : 'text-muted-foreground'
                      }`}
                    >
                      {frequency}×
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
});
