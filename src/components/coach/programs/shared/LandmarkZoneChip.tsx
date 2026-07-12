import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getLandmarkColor, getLandmarkLabel, type LandmarkZone } from "@/types/muscle-builder";

/**
 * LandmarkZoneChip — the MEV/MAV/MRV volume-landmark badge (Below MV, Maintenance,
 * Productive, Near MRV, Over MRV).
 *
 * Lifted from the inline chip in `muscle-builder/VolumeOverview.tsx` (§11.2).
 * Presentational only — label and colour both come from `types/muscle-builder`.
 *
 * Consumers (§11.2): builder volume rail, detail distribution view.
 */
interface LandmarkZoneChipProps {
  zone: LandmarkZone;
  className?: string;
}

export function LandmarkZoneChip({ zone, className }: LandmarkZoneChipProps) {
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] shrink-0 w-16 justify-center", getLandmarkColor(zone), className)}
    >
      {getLandmarkLabel(zone)}
    </Badge>
  );
}
