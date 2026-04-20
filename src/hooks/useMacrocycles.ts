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

/** Compute week count from program_template_days (MAX day_index / 7, ceil). */
async function computeProgramWeeks(programTemplateIds: string[]): Promise<Map<string, number>> {
  if (programTemplateIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from("program_template_days")
    .select("program_template_id, day_index")
    .in("program_template_id", programTemplateIds);
  if (error) throw error;
  const map = new Map<string, number>();
  for (const d of data ?? []) {
    const current = map.get(d.program_template_id) ?? 0;
    if (d.day_index > current) map.set(d.program_template_id, d.day_index);
  }
  const weekMap = new Map<string, number>();
  for (const id of programTemplateIds) {
    const maxIdx = map.get(id) ?? 0;
    weekMap.set(id, Math.max(1, Math.ceil(maxIdx / 7)));
  }
  return weekMap;
}

/** Fetch all macrocycles owned by the coach, with denormalised block count + total weeks. */
export function useMacrocycleList(coachUserId: string) {
  const [macrocycles, setMacrocycles] = useState<
    Array<Macrocycle & { blockCount: number; weeksTotal: number }>
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
          const totalWeeks = js.reduce((sum, j) => sum + (weekMap.get(j.program_template_id) ?? 0), 0);
          return { ...rowToMacrocycle(m), blockCount: js.length, weeksTotal: totalWeeks };
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
