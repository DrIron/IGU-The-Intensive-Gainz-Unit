// src/hooks/useMacrocycles.ts
// Fetch helpers for the macrocycles layer. Types are cast because the
// Supabase types.ts hasn't been regenerated for this migration yet —
// runtime shape matches the SQL.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { sanitizeErrorForUser } from "@/lib/errorSanitizer";
import type { Macrocycle, MacrocycleBlock, MacrocycleWithBlocks } from "@/types/macrocycle";

type MacrocycleRow = {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

type JunctionRow = {
  macrocycle_id: string;
  program_template_id: string;
  sequence: number;
};

function rowToMacrocycle(r: MacrocycleRow): Macrocycle {
  return {
    id: r.id,
    coachId: r.coach_id,
    name: r.name,
    description: r.description,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

/**
 * Week count per program_template — CANONICAL, with a legacy fallback.
 *
 * ── Why this was repointed ──────────────────────────────────────────────────
 * This used to derive weeks from `program_template_days` alone
 * (`ceil(max(day_index) / 7)`). That is the LEGACY tree the unification is
 * dropping. It agrees with canonical today, which is exactly the problem: when
 * `program_template_days` goes, every count would silently collapse to the `1`
 * default and the macrocycle list would report a 16-week arc as 2 weeks — wrong,
 * but not loud.
 *
 * So: count the canonical plan's `plan_weeks`, resolving the plan through the SAME
 * join `useProgramSummaries` uses (verified identical against prod 2026-07-14):
 *
 *   program_templates.id
 *     ← muscle_program_templates.converted_program_id
 *     → muscle_program_templates.id
 *     ← plan.source_muscle_template_id  (kind = 'template')
 *     → plan → COUNT(plan_weeks)
 *
 * ── The fallback ────────────────────────────────────────────────────────────
 * A program_template with NO canonical mirror (never compiled — prod has one: an
 * orphaned double-conversion) keeps the legacy `ceil(max(day_index)/7)`. Same
 * null-safe discipline as PR2's adapter: use canonical when it exists, never fake it
 * when it doesn't.
 *
 * When `program_template_days` is finally DROPPED, that legacy query returns nothing
 * and the fallback yields the known-safe minimum of 1 — a floor, not a crash, and
 * only for templates that have no canonical plan to measure anyway.
 *
 * NOTE: `assign_macrocycle_to_client_canonical` is already canonical — it staggers by
 * `COUNT(plan_weeks)` on the clone (`20260630140000…sql:104-106`) and never touches
 * `program_template_days`. This function is the LAST legacy consumer in the macrocycle
 * layer, and it only feeds display (the list's total-weeks) plus PR4's proportion bar.
 *
 * Signature and return shape are unchanged (Map<program_template_id, weeks>), so no
 * caller moves.
 */
/** Exported for unit tests — not part of the hook API. */
export async function computeProgramWeeks(programTemplateIds: string[]): Promise<Map<string, number>> {
  if (programTemplateIds.length === 0) return new Map();

  // 1. program_template -> its Planning Board plan (the reverse map).
  const { data: mpts, error: mptErr } = await supabase
    .from("muscle_program_templates")
    .select("id, converted_program_id")
    .in("converted_program_id", programTemplateIds);
  if (mptErr) throw mptErr;

  const mptByProgram = new Map<string, string>();
  for (const m of mpts ?? []) {
    if (m.converted_program_id) mptByProgram.set(m.converted_program_id, m.id);
  }
  const mptIds = [...mptByProgram.values()];

  // 2. Planning Board plan -> canonical template plan.
  const { data: plans, error: planErr } = mptIds.length
    ? await supabase
        .from("plan")
        .select("id, source_muscle_template_id")
        .eq("kind", "template")
        .in("source_muscle_template_id", mptIds)
    : { data: [], error: null };
  if (planErr) throw planErr;

  const planByMpt = new Map<string, string>();
  for (const p of plans ?? []) {
    if (p.source_muscle_template_id) planByMpt.set(p.source_muscle_template_id, p.id);
  }
  const planIds = [...planByMpt.values()];

  // 3. COUNT(plan_weeks) per plan — one batched read, no N+1.
  const { data: weekRows, error: weekErr } = planIds.length
    ? await supabase.from("plan_weeks").select("plan_id").in("plan_id", planIds)
    : { data: [], error: null };
  if (weekErr) throw weekErr;

  const weeksByPlan = new Map<string, number>();
  for (const w of weekRows ?? []) {
    if (w.plan_id) weeksByPlan.set(w.plan_id, (weeksByPlan.get(w.plan_id) ?? 0) + 1);
  }

  const canonicalWeeks = new Map<string, number>();
  for (const programId of programTemplateIds) {
    const mptId = mptByProgram.get(programId);
    const planId = mptId ? planByMpt.get(mptId) : undefined;
    const count = planId ? (weeksByPlan.get(planId) ?? 0) : 0;
    if (count > 0) canonicalWeeks.set(programId, count);
  }

  // 4. LEGACY FALLBACK — only for templates with no canonical plan to measure.
  //    Dies with program_template_days; see the note above.
  const needsLegacy = programTemplateIds.filter((id) => !canonicalWeeks.has(id));
  const legacyMaxDay = new Map<string, number>();
  if (needsLegacy.length > 0) {
    const { data: days, error: dayErr } = await supabase
      .from("program_template_days")
      .select("program_template_id, day_index")
      .in("program_template_id", needsLegacy);
    if (dayErr) throw dayErr;
    for (const d of days ?? []) {
      const current = legacyMaxDay.get(d.program_template_id) ?? 0;
      if (d.day_index > current) legacyMaxDay.set(d.program_template_id, d.day_index);
    }
  }

  const weekMap = new Map<string, number>();
  for (const id of programTemplateIds) {
    const canonical = canonicalWeeks.get(id);
    if (canonical != null) {
      weekMap.set(id, canonical);
      continue;
    }
    // Post-drop this is always 0 -> Math.max(1, 0) = 1, the known-safe floor.
    const maxIdx = legacyMaxDay.get(id) ?? 0;
    weekMap.set(id, Math.max(1, Math.ceil(maxIdx / 7)));
  }
  return weekMap;
}

/** Fetch all macrocycles owned by the coach, with denormalised block count + total weeks. */
export function useMacrocycleList(coachUserId: string) {
  const [macrocycles, setMacrocycles] = useState<
    Array<Macrocycle & { blockCount: number; weeksTotal: number; blockWeeks: number[] }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const hasFetched = useRef(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const { data: macros, error: macroErr } = await supabase
        .from("macrocycles")
        .select("*")
        .eq("coach_id", coachUserId)
        .order("updated_at", { ascending: false });
      if (macroErr) throw macroErr;

      const macroRows = (macros ?? []) as MacrocycleRow[];
      if (macroRows.length === 0) {
        setMacrocycles([]);
        return;
      }

      const ids = macroRows.map(m => m.id);
      const { data: junctions, error: jErr } = await supabase
        // @ts-expect-error macrocycle_mesocycles types not yet regenerated
        .from("macrocycle_mesocycles")
        .select("*")
        .in("macrocycle_id", ids);
      if (jErr) throw jErr;

      const jrows = (junctions ?? []) as JunctionRow[];
      const programIds = [...new Set(jrows.map(j => j.program_template_id))];
      const weekMap = await computeProgramWeeks(programIds);

      const byMacro = new Map<string, JunctionRow[]>();
      for (const j of jrows) {
        const arr = byMacro.get(j.macrocycle_id) ?? [];
        arr.push(j);
        byMacro.set(j.macrocycle_id, arr);
      }

      setMacrocycles(
        macroRows.map(m => {
          const js = byMacro.get(m.id) ?? [];
          // PR4: keep the PER-BLOCK week counts (already computed above, previously
          // summed away) so the library card can draw a proportion bar. Zero extra
          // queries. Sequence order is preserved by the junction `.order("sequence")`.
          const blockWeeks = js.map(j => weekMap.get(j.program_template_id) ?? 0);
          const totalWeeks = blockWeeks.reduce((sum, w) => sum + w, 0);
          return { ...rowToMacrocycle(m), blockCount: js.length, weeksTotal: totalWeeks, blockWeeks };
        }),
      );
      setError(null);
    } catch (e: unknown) {
      const msg = sanitizeErrorForUser(e);
      setError(msg);
      toast({ title: "Error loading macrocycles", description: msg, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [coachUserId, toast]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  return { macrocycles, loading, error, reload: load };
}

/** Fetch one macrocycle by id with its ordered blocks. */
export function useMacrocycle(macrocycleId: string | null) {
  const [macrocycle, setMacrocycle] = useState<MacrocycleWithBlocks | null>(null);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const hasFetched = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!macrocycleId) {
      setMacrocycle(null);
      return;
    }
    try {
      setLoading(true);
      const { data: macro, error: macroErr } = await supabase
        .from("macrocycles")
        .select("*")
        .eq("id", macrocycleId)
        .maybeSingle();
      if (macroErr) throw macroErr;
      if (!macro) {
        setMacrocycle(null);
        return;
      }

      const { data: junctions, error: jErr } = await supabase
        .from("macrocycle_mesocycles")
        .select("*")
        .eq("macrocycle_id", macrocycleId)
        .order("sequence", { ascending: true });
      if (jErr) throw jErr;

      const jrows = (junctions ?? []) as JunctionRow[];
      const programIds = jrows.map(j => j.program_template_id);
      const programMap = new Map<string, { title: string; description: string | null }>();
      if (programIds.length > 0) {
        const { data: programs, error: pErr } = await supabase
          .from("program_templates")
          .select("id, title, description")
          .in("id", programIds);
        if (pErr) throw pErr;
        for (const p of programs ?? []) {
          programMap.set(p.id, { title: p.title, description: p.description });
        }
      }
      const weekMap = await computeProgramWeeks(programIds);

      const blocks: MacrocycleBlock[] = jrows.map(j => ({
        macrocycleId: j.macrocycle_id,
        programTemplateId: j.program_template_id,
        sequence: j.sequence,
        title: programMap.get(j.program_template_id)?.title ?? "Unknown mesocycle",
        description: programMap.get(j.program_template_id)?.description ?? null,
        weeks: weekMap.get(j.program_template_id) ?? 1,
      }));

      setMacrocycle({
        id: macro.id,
        coachId: macro.coach_id,
        name: macro.name,
        description: macro.description,
        createdAt: macro.created_at,
        updatedAt: macro.updated_at,
        blocks,
      });
    } catch (e: unknown) {
      toast({
        title: "Error loading macrocycle",
        description: sanitizeErrorForUser(e),
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [macrocycleId, toast]);

  useEffect(() => {
    if (!macrocycleId) {
      setMacrocycle(null);
      return;
    }
    if (hasFetched.current === macrocycleId) return;
    hasFetched.current = macrocycleId;
    load();
  }, [macrocycleId, load]);

  return { macrocycle, loading, reload: load };
}
