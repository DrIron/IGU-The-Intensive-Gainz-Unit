/**
 * P4 — typed "+ Special Sets" authoring menu for a slot's per-set techniques
 * (Weight back-off / Drop set / AMRAP). Writes via SET_SET_INSTRUCTION (onSetInstruction),
 * which seeds setsDetail if needed; fields round-trip through prescription_json.setsDetail and
 * resolve in the canonical logger (see setInstructions.ts). Rest & Repeat is a later slice.
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Sparkles, X } from "lucide-react";
import type { SetPrescription, SetInstructionPatch, SetBranch } from "@/types/workout-builder";

interface SetInstructionMenuProps {
  setCount: number;
  setsDetail?: SetPrescription[];
  onSetInstruction: (setIndex: number, patch: SetInstructionPatch) => void;
}

export function SetInstructionMenu({ setCount, setsDetail, onSetInstruction }: SetInstructionMenuProps) {
  const [open, setOpen] = useState(false);
  const [setIdx, setSetIdx] = useState(0); // 0-indexed target set
  const [boBasis, setBoBasis] = useState<"percent" | "drop">("percent");
  const [boValue, setBoValue] = useState("90");
  const [boRef, setBoRef] = useState(0);
  const [dropBasis, setDropBasis] = useState<"percent" | "drop">("percent");
  const [dropValue, setDropValue] = useState("80");
  const [rrRest, setRrRest] = useState("20");
  const [rrMax, setRrMax] = useState(""); // blank = to failure (open-ended)

  const sets = Math.max(1, setCount);
  const cur: SetPrescription | undefined = setsDetail?.[setIdx];
  const curAmrap = cur?.amrap === true;
  const curBranches: SetBranch[] = cur?.branches ?? [];
  const curDrops = curBranches.filter((b) => b.type === "drop");
  const curRestRepeat = curBranches.find((b) => b.type === "rest_repeat");

  const setOpt = (i: number) => `Set ${i + 1}`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 text-xs">
          <Sparkles className="h-3 w-3 mr-1" />
          Special Sets
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-3 space-y-3" align="start">
        {/* Target set */}
        <div className="space-y-1">
          <Label className="text-[10px] text-muted-foreground">Apply to</Label>
          <select
            className="w-full h-8 text-xs rounded-md border border-border bg-background px-2"
            value={setIdx}
            onChange={(e) => setSetIdx(Number(e.target.value))}
          >
            {Array.from({ length: sets }, (_, i) => (
              <option key={i} value={i}>{setOpt(i)}</option>
            ))}
          </select>
        </div>

        {/* AMRAP */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium">AMRAP</p>
            <p className="text-[10px] text-muted-foreground">Drop the rep target; client logs reps</p>
          </div>
          <Switch
            checked={curAmrap}
            onCheckedChange={(v) => onSetInstruction(setIdx, { amrap: v })}
          />
        </div>

        {/* Weight back-off */}
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs font-medium">Weight back-off</p>
          <div className="flex items-center gap-1.5">
            <select
              className="h-8 text-xs rounded-md border border-border bg-background px-1.5"
              value={boRef}
              onChange={(e) => setBoRef(Number(e.target.value))}
              title="Reference set"
            >
              {Array.from({ length: sets }, (_, i) => (
                <option key={i} value={i}>from S{i + 1}</option>
              ))}
            </select>
            <select
              className="h-8 text-xs rounded-md border border-border bg-background px-1.5"
              value={boBasis}
              onChange={(e) => setBoBasis(e.target.value as "percent" | "drop")}
            >
              <option value="percent">%</option>
              <option value="drop">−kg</option>
            </select>
            <Input
              type="number"
              value={boValue}
              onChange={(e) => setBoValue(e.target.value)}
              className="h-8 text-xs w-16"
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="h-7 text-xs w-full"
            onClick={() =>
              onSetInstruction(setIdx, {
                weight_mode: "backoff",
                backoff: { ref_set_index: boRef, basis: boBasis, value: Number(boValue) || 0, rounding: 2.5 },
              })
            }
          >
            Set back-off on {setOpt(setIdx)}
          </Button>
          {cur?.weight_mode === "backoff" && cur.backoff && (
            <button
              className="text-[10px] text-amber-600 dark:text-amber-400 hover:underline"
              onClick={() => onSetInstruction(setIdx, { weight_mode: "absolute", backoff: undefined })}
            >
              Clear back-off
            </button>
          )}
        </div>

        {/* Drop set */}
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs font-medium">Drop set</p>
          <div className="flex items-center gap-1.5">
            <select
              className="h-8 text-xs rounded-md border border-border bg-background px-1.5"
              value={dropBasis}
              onChange={(e) => setDropBasis(e.target.value as "percent" | "drop")}
            >
              <option value="percent">%</option>
              <option value="drop">−kg</option>
            </select>
            <Input
              type="number"
              value={dropValue}
              onChange={(e) => setDropValue(e.target.value)}
              className="h-8 text-xs w-16"
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                onSetInstruction(setIdx, {
                  branches: [
                    ...curBranches,
                    { type: "drop", basis: dropBasis, value: Number(dropValue) || 0 },
                  ],
                })
              }
            >
              Add drop
            </Button>
          </div>
          {curDrops.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {curDrops.map((d, i) => (
                <span key={i} className="inline-flex items-center gap-1 text-[10px] rounded-full border border-amber-500/40 px-1.5 py-0.5">
                  {d.type === "drop" && (d.basis === "percent" ? `${d.value}%` : `−${d.value}kg`)}
                  <button
                    onClick={() =>
                      onSetInstruction(setIdx, { branches: curBranches.filter((b) => b !== d) })
                    }
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Rest & Repeat (rest-pause) — at most one per set. */}
        <div className="space-y-1.5 border-t pt-2">
          <p className="text-xs font-medium">Rest &amp; Repeat (rest-pause)</p>
          <div className="flex items-center gap-1.5">
            <Input
              type="number"
              value={rrRest}
              onChange={(e) => setRrRest(e.target.value)}
              className="h-8 text-xs w-16"
              title="Rest seconds between rounds"
              placeholder="rest s"
            />
            <span className="text-[10px] text-muted-foreground">s rest ·</span>
            <Input
              type="number"
              value={rrMax}
              onChange={(e) => setRrMax(e.target.value)}
              className="h-8 text-xs w-16"
              title="Max rounds (blank = to failure)"
              placeholder="rounds"
            />
            <Button
              variant="secondary"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                const maxRounds = rrMax.trim() === "" ? undefined : Number(rrMax) || undefined;
                const branch: SetBranch = {
                  type: "rest_repeat",
                  rest_seconds: Number(rrRest) || 20,
                  to_failure: true,
                  ...(maxRounds != null ? { max_rounds: maxRounds } : {}),
                };
                // Keep at most one rest_repeat per set.
                onSetInstruction(setIdx, {
                  branches: [...curBranches.filter((b) => b.type !== "rest_repeat"), branch],
                });
              }}
            >
              Set rest-pause
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">Blank rounds = to failure (open-ended)</p>
          {curRestRepeat && curRestRepeat.type === "rest_repeat" && (
            <span className="inline-flex items-center gap-1 text-[10px] rounded-full border border-amber-500/40 px-1.5 py-0.5">
              rest-pause {curRestRepeat.rest_seconds}s{curRestRepeat.max_rounds ? ` · ×${curRestRepeat.max_rounds}` : ""}
              <button
                onClick={() =>
                  onSetInstruction(setIdx, { branches: curBranches.filter((b) => b.type !== "rest_repeat") })
                }
              >
                <X className="h-2.5 w-2.5" />
              </button>
            </span>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
