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
import { Checkbox } from "@/components/ui/checkbox";
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

/** Targets that can carry a per-set scope (Phase 1d). `sets` cannot. */
const PER_SET_ABLE: DeltaTarget[] = ["repMin", "repMax", "tempo", "rir", "rpe", "instructions"];
/** rir/rpe are inherently per-set — their scope is required, not opt-in. */
const ALWAYS_SCOPED: DeltaTarget[] = ["rir", "rpe"];

type ScopeMode = "all" | "first" | "last" | "set_numbers";

interface SlotDeltaRuleEditorProps {
  rule: WeeklyDeltaRule;
  /** W1 base value for this field — drives the live preview. */
  baseValue: number | string | undefined;
  totalWeeks: number;
  /** Per-week deload flags (length === totalWeeks). */
  isDeloadByWeek: boolean[];
  /** Slot's prescribed set count — drives the set-number checkboxes (Phase 1c). */
  setCount?: number;
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
  setCount,
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

  // -- Week window (Phase 1a) --

  const isWindowed = rule.activeWeekStart !== undefined || rule.activeWeekEnd !== undefined;
  // Default the displayed window to W2..lastWeek when the coach switches to a
  // custom range without explicit bounds yet.
  const windowStart = rule.activeWeekStart ?? 2;
  const windowEnd = rule.activeWeekEnd ?? totalWeeks;

  const setWindowMode = (mode: "all" | "range") => {
    if (mode === "all") {
      const { activeWeekStart: _s, activeWeekEnd: _e, ...rest } = rule;
      onChange(rest as WeeklyDeltaRule);
    } else {
      onChange({ ...rule, activeWeekStart: windowStart, activeWeekEnd: windowEnd });
    }
  };
  const setWindowStart = (v: number) => {
    const start = Math.max(2, Math.min(v, totalWeeks));
    onChange({ ...rule, activeWeekStart: start, activeWeekEnd: Math.max(start, windowEnd) });
  };
  const setWindowEnd = (v: number) => {
    const end = Math.max(windowStart, Math.min(v, totalWeeks));
    onChange({ ...rule, activeWeekStart: windowStart, activeWeekEnd: end });
  };

  // -- Per-set scope (Phase 1c / 1d) --

  const isPerSetAble = PER_SET_ABLE.includes(rule.target);
  const alwaysScoped = ALWAYS_SCOPED.includes(rule.target);
  const currentScope: SetScope | undefined =
    "scope" in rule ? (rule.scope as SetScope | undefined) : undefined;
  const scopeOn = alwaysScoped || currentScope !== undefined;
  // N for the set-number checkboxes. Falls back to the numeric base (sets count)
  // then a sensible minimum so the row is never empty.
  const n = setCount && setCount > 0 ? setCount : 4;

  const setScope = (scope: SetScope | undefined) => {
    if (scope === undefined) {
      const { scope: _drop, ...rest } = rule as WeeklyDeltaRule & { scope?: SetScope };
      onChange(rest as WeeklyDeltaRule);
    } else {
      onChange({ ...rule, scope } as WeeklyDeltaRule);
    }
  };

  const togglePerSet = (on: boolean) => setScope(on ? { kind: "all" } : undefined);

  const setScopeMode = (mode: ScopeMode) => {
    if (mode === "set_numbers") {
      setScope({ kind: "set_numbers", setNumbers: scopeSelectedNumbers(currentScope) });
    } else {
      setScope({ kind: mode });
    }
  };

  const toggleSetNumber = (num: number, on: boolean) => {
    const current = scopeSelectedNumbers(currentScope);
    const next = on
      ? Array.from(new Set([...current, num])).sort((a, b) => a - b)
      : current.filter((x) => x !== num);
    setScope({ kind: "set_numbers", setNumbers: next });
  };

  const setLastN = (count: number) => {
    const nums: number[] = [];
    for (let i = Math.max(1, n - count + 1); i <= n; i++) nums.push(i);
    setScope({ kind: "set_numbers", setNumbers: nums });
  };

  const scopeMode: ScopeMode = scopeToMode(currentScope);
  const selectedNumbers = scopeSelectedNumbers(currentScope);

  // -- Added-set spec (Phase 1e) — only meaningful when adding sets --

  const addedSetSpec = rule.target === "sets" ? rule.addedSetSpec : undefined;
  const setAddedSetField = (
    field: "reps" | "rir" | "tempo" | "notes",
    value: number | string | undefined,
  ) => {
    if (rule.target !== "sets") return;
    const next = { ...(rule.addedSetSpec ?? {}) };
    if (value === undefined || value === "") delete next[field];
    else (next as Record<string, unknown>)[field] = value;
    onChange({ ...rule, addedSetSpec: Object.keys(next).length ? next : undefined });
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

      {/* Week window (Phase 1a) — when does this rule apply? */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className={isWindowed ? undefined : "col-span-2"}>
          <label className="text-[10px] text-muted-foreground block mb-0.5">Applies to weeks</label>
          <Select value={isWindowed ? "range" : "all"} onValueChange={(v) => setWindowMode(v as "all" | "range")}>
            <SelectTrigger className="h-7 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All weeks (W2 → end)</SelectItem>
              <SelectItem value="range" className="text-xs">From week … to …</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {isWindowed && (
          <div className="flex items-end gap-1.5">
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-0.5">From</label>
              <Input
                type="number"
                min={2}
                max={totalWeeks}
                value={windowStart}
                onChange={(e) => setWindowStart(parseInt(e.target.value, 10) || 2)}
                className="h-7 text-xs"
              />
            </div>
            <div className="flex-1">
              <label className="text-[10px] text-muted-foreground block mb-0.5">To</label>
              <Input
                type="number"
                min={windowStart}
                max={totalWeeks}
                value={windowEnd}
                onChange={(e) => setWindowEnd(parseInt(e.target.value, 10) || windowStart)}
                className="h-7 text-xs"
              />
            </div>
          </div>
        )}
      </div>
      {isWindowed && (
        <p className="text-[10px] text-muted-foreground -mt-1">
          Ramps W{windowStart}–{windowEnd}, then holds the W{windowEnd} value through the end.
        </p>
      )}

      {/* Per-set scope (Phase 1c / 1d) */}
      {isPerSetAble && (
        <div className="space-y-1.5">
          {!alwaysScoped && (
            <label className="flex items-center gap-1.5 text-[10px] text-muted-foreground cursor-pointer">
              <Checkbox
                checked={scopeOn}
                onCheckedChange={(c) => togglePerSet(c === true)}
                className="h-3.5 w-3.5"
              />
              Apply to specific sets
            </label>
          )}
          {scopeOn && (
            <>
              <div>
                <label className="text-[10px] text-muted-foreground block mb-0.5">Apply to</label>
                <Select value={scopeMode} onValueChange={(v) => setScopeMode(v as ScopeMode)}>
                  <SelectTrigger className="h-7 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all" className="text-xs">All sets</SelectItem>
                    <SelectItem value="first" className="text-xs">First set</SelectItem>
                    <SelectItem value="last" className="text-xs">Last set</SelectItem>
                    <SelectItem value="set_numbers" className="text-xs">Specific sets…</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {scopeMode === "set_numbers" && (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    {Array.from({ length: n }, (_, i) => i + 1).map((num) => (
                      <label
                        key={num}
                        className="inline-flex items-center gap-1 text-[10px] cursor-pointer rounded border border-border/50 px-1.5 py-1"
                      >
                        <Checkbox
                          checked={selectedNumbers.includes(num)}
                          onCheckedChange={(c) => toggleSetNumber(num, c === true)}
                          className="h-3.5 w-3.5"
                        />
                        #{num}
                      </label>
                    ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {n >= 2 && (
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setLastN(2)}>
                        Last 2
                      </Button>
                    )}
                    {n >= 3 && (
                      <Button type="button" variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setLastN(3)}>
                        Last 3
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Added-set spec (Phase 1e) — what a newly-added set looks like */}
      {rule.target === "sets" && amount > 0 && (
        <div className="space-y-1.5 rounded-md border border-border/40 bg-muted/10 p-2">
          <div className="text-[10px] text-muted-foreground">New set looks like… (optional)</div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Reps</label>
              <Input
                type="number"
                value={addedSetSpec?.reps ?? ""}
                onChange={(e) => setAddedSetField("reps", e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                className="h-7 text-xs"
                placeholder="clone last"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">RIR</label>
              <Input
                type="number"
                value={addedSetSpec?.rir ?? ""}
                onChange={(e) => setAddedSetField("rir", e.target.value === "" ? undefined : parseInt(e.target.value, 10))}
                className="h-7 text-xs"
                placeholder="clone last"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Tempo</label>
              <Input
                value={addedSetSpec?.tempo ?? ""}
                onChange={(e) => setAddedSetField("tempo", e.target.value || undefined)}
                className="h-7 text-xs"
                placeholder="e.g. 3010"
              />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground block mb-0.5">Notes</label>
              <Input
                value={addedSetSpec?.notes ?? ""}
                onChange={(e) => setAddedSetField("notes", e.target.value || undefined)}
                className="h-7 text-xs"
                placeholder="optional"
              />
            </div>
          </div>
        </div>
      )}

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

/** Map a scope to its Select mode. Legacy `index` scopes display as `set_numbers`. */
function scopeToMode(scope: SetScope | undefined): ScopeMode {
  if (!scope) return "all";
  if (scope.kind === "index") return "set_numbers";
  return scope.kind;
}

/** The 1-indexed set numbers a scope currently selects (for the checkbox row). */
function scopeSelectedNumbers(scope: SetScope | undefined): number[] {
  if (!scope) return [];
  if (scope.kind === "set_numbers") return scope.setNumbers;
  if (scope.kind === "index") return [scope.setNumber];
  return [];
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
