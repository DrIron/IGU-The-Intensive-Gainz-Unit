import { memo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { SetPrescription } from "@/types/workout-builder";

export type MobileSetFieldType =
  | "rep_range"
  | "reps"
  | "weight"
  | "tempo"
  | "rir"
  | "rpe"
  | "percent_1rm"
  | "rest_seconds"
  | "time_seconds"
  | "distance_meters"
  | "notes";

export interface MobileSetField {
  type: MobileSetFieldType;
  label: string;
}

export interface MobileSetCardProps {
  set: SetPrescription;
  index: number;
  total: number;
  fields: MobileSetField[];
  onUpdate: (field: keyof SetPrescription, value: number | string | undefined) => void;
}

/**
 * One-set card. Renders only the fields the coach enabled via Choose columns.
 * Full-width inputs with numeric inputmode so iOS/Android pop the 10-key keypad.
 */
export const MobileSetCard = memo(function MobileSetCard({
  set,
  index,
  total,
  fields,
  onUpdate,
}: MobileSetCardProps) {
  return (
    <section
      role="tabpanel"
      aria-label={`Set ${index + 1} of ${total}`}
      className="rounded-lg border border-border/60 bg-card/50 p-4 space-y-4"
    >
      <header className="flex items-baseline justify-between">
        <h3 className="text-lg font-semibold tracking-tight">Set {index + 1}</h3>
        <span className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground">
          of {total}
        </span>
      </header>

      <div className="space-y-3">
        {fields.map((field) => (
          <SetFieldRow key={field.type} field={field} set={set} onUpdate={onUpdate} />
        ))}
        {fields.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-4">
            No columns selected. Tap &ldquo;Choose columns&rdquo; above.
          </p>
        )}
      </div>
    </section>
  );
});

/** Per-field renderer — controlled, numeric-first, keyboard-friendly. */
function SetFieldRow({
  field,
  set,
  onUpdate,
}: {
  field: MobileSetField;
  set: SetPrescription;
  onUpdate: (field: keyof SetPrescription, value: number | string | undefined) => void;
}) {
  switch (field.type) {
    case "rep_range":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{field.label}</Label>
          <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
            <Input
              type="number"
              inputMode="numeric"
              placeholder="min"
              className="h-11 text-base tabular-nums"
              value={set.rep_range_min ?? ""}
              onChange={(e) =>
                onUpdate("rep_range_min", e.target.value === "" ? undefined : parseInt(e.target.value, 10))
              }
            />
            <span className="text-muted-foreground text-sm select-none">to</span>
            <Input
              type="number"
              inputMode="numeric"
              placeholder="max"
              className="h-11 text-base tabular-nums"
              value={set.rep_range_max ?? ""}
              onChange={(e) =>
                onUpdate("rep_range_max", e.target.value === "" ? undefined : parseInt(e.target.value, 10))
              }
            />
          </div>
        </div>
      );

    case "reps":
      return (
        <NumericRow
          label={field.label}
          value={set.reps}
          onChange={(v) => onUpdate("reps", v)}
          placeholder="e.g. 8"
          min={0}
          max={999}
        />
      );

    case "weight":
      return (
        <NumericRow
          label={field.label}
          value={set.weight}
          onChange={(v) => onUpdate("weight", v)}
          placeholder="kg"
          step={0.5}
          allowDecimals
        />
      );

    case "tempo":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{field.label} (ecc/pause/con/stop, e.g. 3010)</Label>
          <Input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={4}
            placeholder="3010"
            className="h-11 text-base font-mono tracking-[0.3em]"
            value={set.tempo ?? ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 4);
              onUpdate("tempo", digits.length > 0 ? digits : undefined);
            }}
          />
        </div>
      );

    case "rir":
      return (
        <NumericRow
          label={field.label}
          value={set.rir}
          onChange={(v) => onUpdate("rir", v)}
          placeholder="0-10"
          min={0}
          max={10}
        />
      );

    case "rpe":
      return (
        <NumericRow
          label={field.label}
          value={set.rpe}
          onChange={(v) => onUpdate("rpe", v)}
          placeholder="1-10"
          min={1}
          max={10}
          allowDecimals
        />
      );

    case "percent_1rm":
      return (
        <NumericRow
          label={field.label}
          value={set.percent_1rm}
          onChange={(v) => onUpdate("percent_1rm", v)}
          placeholder="e.g. 75"
          min={0}
          max={120}
          suffix="%"
        />
      );

    case "rest_seconds":
      return (
        <NumericRow
          label={field.label}
          value={set.rest_seconds}
          onChange={(v) => onUpdate("rest_seconds", v)}
          placeholder="e.g. 90"
          min={0}
          max={3600}
          suffix="s"
        />
      );

    case "time_seconds":
      return (
        <NumericRow
          label={field.label}
          value={set.time_seconds}
          onChange={(v) => onUpdate("time_seconds", v)}
          placeholder="seconds"
          min={0}
          max={36000}
          suffix="s"
        />
      );

    case "distance_meters":
      return (
        <NumericRow
          label={field.label}
          value={set.distance_meters}
          onChange={(v) => onUpdate("distance_meters", v)}
          placeholder="meters"
          min={0}
          max={100000}
          suffix="m"
        />
      );

    case "notes":
      return (
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">{field.label}</Label>
          <Textarea
            placeholder="Notes for this set..."
            className="min-h-[72px] text-base"
            value={set.notes ?? ""}
            onChange={(e) => onUpdate("notes", e.target.value || undefined)}
          />
        </div>
      );

    default:
      return null;
  }
}

interface NumericRowProps {
  label: string;
  value?: number;
  onChange: (value: number | undefined) => void;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  allowDecimals?: boolean;
  suffix?: string;
}

/** Consistent numeric input row — big, 11u tall, tabular-nums, keypad-friendly. */
function NumericRow({ label, value, onChange, placeholder, min, max, step, allowDecimals, suffix }: NumericRowProps) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
        <Input
          type="number"
          inputMode={allowDecimals ? "decimal" : "numeric"}
          placeholder={placeholder}
          min={min}
          max={max}
          step={step ?? (allowDecimals ? 0.1 : 1)}
          className="h-11 text-base tabular-nums pr-8"
          value={value ?? ""}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === "") return onChange(undefined);
            const parsed = allowDecimals ? parseFloat(raw) : parseInt(raw, 10);
            if (Number.isNaN(parsed)) return onChange(undefined);
            onChange(parsed);
          }}
        />
        {suffix && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
            {suffix}
          </span>
        )}
      </div>
    </div>
  );
}
