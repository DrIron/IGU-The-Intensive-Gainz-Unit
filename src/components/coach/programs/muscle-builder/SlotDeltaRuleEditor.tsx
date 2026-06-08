// src/components/coach/programs/muscle-builder/SlotDeltaRuleEditor.tsx
//
// Single rule row UI. Lives inside SlotDeltaRulesPanel (Phase 2) and the
// Across Weeks tab (Phase 3). Pure presentational — receives a rule + base
// value, calls back with edits.
//
// Plan: docs/PLANNING_BOARD_WEEKLY_DELTAS_PLAN.md §4.5

import { memo, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trash2, AlertTriangle, Snowflake } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  applyRule,
  type WeeklyDeltaRule,
  type DeltaTarget,
  type DeloadBehavior,
  type SetScope,
} from "./weeklyDeltaEngine";

interface SlotDeltaRuleEditorProps {
  rule: WeeklyDeltaRule;
  /** W1 base value for this field — drives the live preview. */
  baseValue: number | string | undefined;
  totalWeeks: number;
  /** Per-week deload flags (length === totalWeeks). */
  isDeloadByWeek: boolean[];
  onChange: (rule: WeeklyDeltaRule) => void;
  onRemove: () => void;
}

const TARGET_LABELS: Record<DeltaTarget, string> = {
  sets: "Sets",
  repMin: "Rep range — min",
  repMax: "Rep range — max",
  tempo: "Tempo",
  rir: "RIR",
  rpe: "RPE",
  instructions: "Instructions",
};

const TEMPO_POSITION_LABELS = ["Eccentric", "Pause (bottom)", "Concentric", "Pause (top)"];

const DELOAD_LABELS: Record<DeloadBehavior, string> = {
  skip: "Skip (keep prior value)",
  apply: "Apply rule normally",
  invert: "Invert (reverse direction)",
  fixed: "Use fixed value",
};

export const SlotDeltaRuleEditor = memo(function SlotDeltaRuleEditor({
  rule,
  baseValue,
  totalWeeks,
  isDeloadByWeek,
  onChange,
  onRemove,
}: SlotDeltaRuleEditorProps) {
  // Compute the resolved value per week. Used for the live preview strip
  // and inline warning when the rule skips literal tempo tokens.
  const preview = useMemo(() => {
    const cells: Array<{
      weekIndex: number;
      label: string;
      isDeload: boolean;
      value: string;
      skipped: boolean;
      skipReason?: string;
    }> = [];
    for (let i = 0; i < totalWeeks; i++) {
      const isDeload = !!isDeloadByWeek[i];
      const weekLabel = `W${i + 1}`;
      if (i === 0) {
        cells.push({
          weekIndex: i,
          label: weekLabel,
          isDeload,
          value: baseValue !== undefined && baseValue !== null ? String(baseValue) : "—",
          skipped: false,
        });
        continue;
      }
      const result = applyRule(rule, baseValue, i, isDeload);
      if (result.ok) {
        cells.push({
          weekIndex: i,
          label: weekLabel,
          isDeload,
          value: typeof result.value === "number"
            ? Number.isInteger(result.value)
              ? String(result.value)
              : result.value.toFixed(2)
            : String(result.value),
          skipped: false,
        });
      } else {
        cells.push({
          weekIndex: i,
          label: weekLabel,
          isDeload,
          value: "—",
          skipped: true,
          skipReason: result.reason,
        });
      }
    }
    return cells;
  }, [rule, baseValue, totalWeeks, isDeloadByWeek]);

  const anyLiteralTokenSkip = preview.some((c) => c.skipReason === "literal_token");

  // -- Field handlers (typed per target) --

  const setAmount = (value: number) => {
    if (rule.target === "sets" || rule.target === "repMin" || rule.target === "repMax") {
      onChange({ ...rule, amount: value });
    } else if (rule.target === "rir" || rule.target === "rpe") {
      onChange({ ...rule, amount: value });
    } else if (rule.target === "tempo") {
      onChange({ ...rule, amount: value });
    }
  };

  const setDeload = (value: DeloadBehavior) => {
    onChange({ ...rule, deload: value });
  };

  const setDeloadFixed = (value: number) => {
    onChange({ ...rule, deloadFixedValue: value });
  };

  // Amount input + direction is one combined number input. Coach types the
  // signed delta (e.g. `-1`, `+2.5`). Simpler than a separate +/- toggle.
  const amount = "amount" in rule ? rule.amount : 0;

  return (
    <div className="rounded-md border border-border/40 bg-muted/10 p-2.5 space-y-2">
      {/* Header row: target + remove */}
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium">{TARGET_LABELS[rule.target]}</div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          aria-label="Remove rule"
        >
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>

      {/* Per-target controls */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        {/* Amount per week — applies to all targets except instructions append-only */}
        {rule.target !== "instructions" && (
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Amount per week</label>
            <Input
              type="number"
              step={rule.target === "rpe" ? 0.5 : 1}
              value={amount}
              onChange={(e) => setAmount(parseFloat(e.target.value) || 0)}
              className="h-7 text-xs"
            />
          </div>
        )}

        {/* Tempo: position picker (0=Ecc, 1=Pause, 2=Con, 3=Pause) */}
        {rule.target === "tempo" && (
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Position</label>
            <Select
              value={String(rule.position)}
              onValueChange={(v) =>
                onChange({ ...rule, position: parseInt(v, 10) as 0 | 1 | 2 | 3 })
              }
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TEMPO_POSITION_LABELS.map((label, idx) => (
                  <SelectItem key={idx} value={String(idx)} className="text-xs">
                    {idx} — {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* RIR / RPE: set scope */}
        {(rule.target === "rir" || rule.target === "rpe") && (
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Apply to</label>
            <Select
              value={scopeToValue(rule.scope)}
              onValueChange={(v) => onChange({ ...rule, scope: valueToScope(v) })}
            >
              <SelectTrigger className="h-7 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All sets</SelectItem>
                <SelectItem value="first" className="text-xs">First set</SelectItem>
                <SelectItem value="last" className="text-xs">Last set</SelectItem>
                <SelectItem value="index:1" className="text-xs">Set #1</SelectItem>
                <SelectItem value="index:2" className="text-xs">Set #2</SelectItem>
                <SelectItem value="index:3" className="text-xs">Set #3</SelectItem>
                <SelectItem value="index:4" className="text-xs">Set #4</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Instructions: text to append each week */}
        {rule.target === "instructions" && rule.op === "append" && (
          <div className="col-span-2">
            <label className="text-[10px] text-muted-foreground block mb-0.5">Text to append each week</label>
            <Input
              value={rule.text}
              onChange={(e) => onChange({ ...rule, text: e.target.value })}
              className="h-7 text-xs"
              placeholder="e.g. Add 5 lb if RIR &gt; 2"
            />
          </div>
        )}
      </div>

      {/* Deload behavior */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div>
          <label className="text-[10px] text-muted-foreground block mb-0.5">On deload weeks</label>
          <Select value={rule.deload ?? "skip"} onValueChange={(v) => setDeload(v as DeloadBehavior)}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(DELOAD_LABELS) as DeloadBehavior[]).map((mode) => (
                <SelectItem key={mode} value={mode} className="text-xs">
                  {DELOAD_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {rule.deload === "fixed" && (
          <div>
            <label className="text-[10px] text-muted-foreground block mb-0.5">Fixed value on deload</label>
            <Input
              type="number"
              step={0.5}
              value={rule.deloadFixedValue ?? 0}
              onChange={(e) => setDeloadFixed(parseFloat(e.target.value) || 0)}
              className="h-7 text-xs"
            />
          </div>
        )}
      </div>

      {/* Live preview strip */}
      <div className="space-y-1 pt-1">
        <div className="text-[10px] text-muted-foreground">Preview</div>
        <div className="flex items-center gap-1 flex-wrap">
          {preview.map((cell) => (
            <div
              key={cell.weekIndex}
              className={cn(
                "inline-flex flex-col items-center justify-center min-w-[44px] px-1.5 py-1 rounded border text-[10px] font-mono",
                cell.weekIndex === 0 && "border-primary/40 bg-primary/5 text-primary",
                cell.weekIndex > 0 && !cell.skipped && "border-border/50 text-foreground",
                cell.skipped && "border-amber-500/40 bg-amber-500/5 text-amber-700 dark:text-amber-400",
                cell.isDeload && "border-blue-500/40 bg-blue-500/5",
              )}
              title={
                cell.skipped
                  ? `Skipped: ${humanReason(cell.skipReason)}${cell.isDeload ? " (deload week)" : ""}`
                  : cell.isDeload
                  ? "Deload week"
                  : undefined
              }
            >
              <span className="text-[9px] text-muted-foreground flex items-center gap-0.5">
                {cell.label}
                {cell.isDeload && <Snowflake className="h-2 w-2" />}
              </span>
              <span className="leading-tight">{cell.value}</span>
            </div>
          ))}
        </div>
        {anyLiteralTokenSkip && (
          <div className="flex items-start gap-1 text-[10px] text-amber-700 dark:text-amber-400">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>This tempo position holds a literal token (A / X). Rule skips it — edit the slot tempo to a digit first.</span>
          </div>
        )}
      </div>
    </div>
  );
});

// ----- Scope serialization helpers -----

function scopeToValue(scope: SetScope): string {
  if (scope.kind === "all" || scope.kind === "first" || scope.kind === "last") {
    return scope.kind;
  }
  return `index:${scope.setNumber}`;
}

function valueToScope(value: string): SetScope {
  if (value === "all") return { kind: "all" };
  if (value === "first") return { kind: "first" };
  if (value === "last") return { kind: "last" };
  if (value.startsWith("index:")) {
    const n = parseInt(value.slice("index:".length), 10);
    return { kind: "index", setNumber: Number.isFinite(n) ? n : 1 };
  }
  return { kind: "all" };
}

function humanReason(reason: string | undefined): string {
  switch (reason) {
    case "literal_token":
      return "tempo position is a literal token";
    case "deload_skip":
      return "deload week";
    case "out_of_range":
      return "value out of range";
    case "no_base":
      return "no base value on the W1 slot";
    case "out_of_active_range":
      return "outside the rule's active week range";
    case "missing_setsdetail":
      return "slot has no per-set detail";
    default:
      return "skipped";
  }
}
