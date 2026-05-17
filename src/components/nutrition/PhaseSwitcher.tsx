import { format } from "date-fns";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface PhaseSwitcherProps {
  phases: any[];
  selectedPhaseId: string | null;
  onSelect: (id: string) => void;
}

/**
 * Dropdown for picking which phase the nutrition surface renders against.
 * Mounted above the hero `NutritionPhaseCard` by `NutritionTab`.
 *
 * Hides itself entirely when there's <= 1 phase -- no point showing chrome
 * for a switcher with one option. The active phase (if any) ships with an
 * "Active" badge using the same emerald palette as `NutritionPhaseCard`'s
 * on-track status, so the user has a clear visual anchor in the list.
 *
 * Phases arrive pre-sorted by the caller (active first, then start_date DESC).
 */
export function PhaseSwitcher({ phases, selectedPhaseId, onSelect }: PhaseSwitcherProps) {
  if (phases.length <= 1) return null;

  return (
    <Select value={selectedPhaseId ?? undefined} onValueChange={onSelect}>
      <SelectTrigger
        aria-label="Select nutrition phase"
        className="w-full md:w-[420px]"
      >
        <SelectValue placeholder="Select a phase" />
      </SelectTrigger>
      <SelectContent>
        {phases.map((phase) => {
          const isActive = !!phase.is_active;
          const start = safeFormat(phase.start_date);
          const label = isActive
            ? `${phase.phase_name} · ${start} → Present`
            : `${phase.phase_name} · ${start} → ${safeFormat(phase.end_date)}`;
          return (
            <SelectItem key={phase.id} value={phase.id}>
              <span className="flex items-center gap-2">
                <span>{label}</span>
                {isActive && (
                  <Badge
                    variant="outline"
                    className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-medium"
                  >
                    Active
                  </Badge>
                )}
              </span>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function safeFormat(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return format(new Date(iso), "MMM d, yyyy");
  } catch {
    return "—";
  }
}
