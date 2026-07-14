import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { captureException } from "@/lib/errorLogging";
import type { FoodPortion } from "@/lib/foodLog";

/**
 * The food catalog side of the add-food sheet: search, browse-by-category, and the
 * Recent / Frequent rows.
 *
 * Search reads the `foods_search` VIEW, which pivots the four macro nutrients out of the
 * normalized `food_nutrients` table — so a result row arrives with its per-100g macros in
 * ONE query instead of one query per food. The view is `security_invoker`, so RLS does the
 * scoping for us: a client sees approved global foods plus their OWN custom foods, and
 * nobody else's.
 *
 * Matching is `ilike` — exact and instant across the seeded catalog. `foods.search_tsv` and
 * its GIN index already exist, so the deferred USDA ingest can switch this to ranked
 * full-text over ~2M rows without a schema change or a new component.
 */

export interface FoodRow {
  id: string;
  name: string;
  brand: string | null;
  source: string;
  owner_user_id: string | null;
  category_id: string | null;
  serving_default_g: number | null;
  is_verified: boolean;
  kcal_100g: number;
  protein_100g: number;
  fat_100g: number;
  carb_100g: number;
}

export interface FoodCategory {
  id: string;
  name: string;
  parent_id: string | null;
  sort_order: number;
}

const SELECT =
  "id, name, brand, source, owner_user_id, category_id, serving_default_g, is_verified, kcal_100g, protein_100g, fat_100g, carb_100g";

const toRow = (r: Record<string, unknown>): FoodRow => ({
  id: r.id as string,
  name: r.name as string,
  brand: (r.brand as string | null) ?? null,
  source: r.source as string,
  owner_user_id: (r.owner_user_id as string | null) ?? null,
  category_id: (r.category_id as string | null) ?? null,
  serving_default_g: r.serving_default_g == null ? null : Number(r.serving_default_g),
  is_verified: Boolean(r.is_verified),
  kcal_100g: Number(r.kcal_100g ?? 0),
  protein_100g: Number(r.protein_100g ?? 0),
  fat_100g: Number(r.fat_100g ?? 0),
  carb_100g: Number(r.carb_100g ?? 0),
});

/** Search + browse. `query` empty => no search rows (the sheet shows Recent / browse instead). */
export function useFoodSearch(query: string, categoryId: string | null) {
  const [results, setResults] = useState<FoodRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (!q && !categoryId) {
      setResults([]);
      setSearchError(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    setSearchError(false);

    // Debounce so a fast typist doesn't fire a query per keystroke.
    const t = setTimeout(async () => {
      try {
        let req = supabase.from("foods_search").select(SELECT).limit(50);
        if (q) req = req.ilike("name", `%${q}%`);
        if (categoryId) req = req.eq("category_id", categoryId);
        const { data, error } = await req.order("name");
        if (error) throw error;
        if (!cancelled) setResults((data ?? []).map((r) => toRow(r as Record<string, unknown>)));
      } catch (e: unknown) {
        captureException(e, { source: "useFoodSearch" });
        if (!cancelled) {
          setSearchError(true);
          setResults([]);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 180);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, categoryId]);

  return { results, searching, searchError };
}

/** The 2-level browse taxonomy (§4.1b) — same shape the SessionAddPicker accordion consumes. */
export function useFoodCategories() {
  const [categories, setCategories] = useState<FoodCategory[]>([]);
  const fetched = useRef(false);

  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    void (async () => {
      const { data, error } = await supabase
        .from("food_categories")
        .select("id, name, parent_id, sort_order")
        .order("sort_order");
      if (error) {
        captureException(error, { source: "useFoodCategories" });
        return;
      }
      setCategories((data ?? []) as FoodCategory[]);
    })();
  }, []);

  const parents = categories.filter((c) => c.parent_id === null);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);
  return { categories, parents, childrenOf };
}

/**
 * Recent + Frequent, from the client's own log — the Planning Board add-picker vocabulary
 * ("Recently used" + a ×N count), applied to food.
 *
 * One read of the client's recent entries, folded in memory. No N+1, and no separate
 * "favourites" table to keep in sync with reality: what you actually eat IS your favourites.
 */
export function useRecentFoods(clientUserId: string | null) {
  const [recent, setRecent] = useState<FoodRow[]>([]);
  const [frequency, setFrequency] = useState<Map<string, number>>(new Map());
  const fetched = useRef<string | null>(null);

  const load = useCallback(async () => {
    if (!clientUserId) return;
    try {
      const { data: logs, error } = await supabase
        .from("food_log_entries")
        .select("food_id, logged_at")
        .eq("client_id", clientUserId)
        .not("food_id", "is", null)
        .order("logged_at", { ascending: false })
        .limit(200);
      if (error) throw error;

      const counts = new Map<string, number>();
      const order: string[] = [];
      for (const l of logs ?? []) {
        const id = l.food_id as string;
        counts.set(id, (counts.get(id) ?? 0) + 1);
        if (!order.includes(id)) order.push(id);
      }
      setFrequency(counts);

      const topIds = order.slice(0, 12);
      if (topIds.length === 0) {
        setRecent([]);
        return;
      }
      const { data: foods, error: foodErr } = await supabase
        .from("foods_search")
        .select(SELECT)
        .in("id", topIds);
      if (foodErr) throw foodErr;

      const byId = new Map((foods ?? []).map((f) => [f.id as string, toRow(f as Record<string, unknown>)]));
      // Preserve most-recent-first; a food whose row is gone simply drops out.
      setRecent(topIds.map((id) => byId.get(id)).filter((f): f is FoodRow => f != null));
    } catch (e: unknown) {
      captureException(e, { source: "useRecentFoods" });
    }
  }, [clientUserId]);

  useEffect(() => {
    if (!clientUserId || fetched.current === clientUserId) return;
    fetched.current = clientUserId;
    void load();
  }, [clientUserId, load]);

  return { recent, frequency, reload: load };
}

/** A food's portions + micros — loaded only when the detail drawer opens for it. */
export function useFoodDetail(foodId: string | null) {
  const [portions, setPortions] = useState<FoodPortion[]>([]);
  const [micros100g, setMicros100g] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!foodId) {
      setPortions([]);
      setMicros100g({});
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [portionRes, nutrientRes] = await Promise.all([
          supabase
            .from("food_portions")
            .select("id, label, gram_weight, unit_kind, ml_equiv")
            .eq("food_id", foodId)
            .order("sort_order"),
          supabase
            .from("food_nutrients")
            .select("amount_per_100g, nutrients(key, category)")
            .eq("food_id", foodId),
        ]);
        if (portionRes.error) throw portionRes.error;
        if (nutrientRes.error) throw nutrientRes.error;
        if (cancelled) return;

        setPortions(
          (portionRes.data ?? []).map((p) => ({
            id: p.id as string,
            label: p.label as string,
            gram_weight: Number(p.gram_weight),
            unit_kind: p.unit_kind as FoodPortion["unit_kind"],
            ml_equiv: p.ml_equiv == null ? null : Number(p.ml_equiv),
          })),
        );

        const micros: Record<string, number> = {};
        for (const row of nutrientRes.data ?? []) {
          const n = row.nutrients as unknown as { key: string; category: string } | null;
          if (n && n.category === "micro") micros[n.key] = Number(row.amount_per_100g);
        }
        setMicros100g(micros);
      } catch (e: unknown) {
        captureException(e, { source: "useFoodDetail" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [foodId]);

  return { portions, micros100g, loading };
}
