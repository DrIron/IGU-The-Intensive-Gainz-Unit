#!/usr/bin/env node
// ============================================================================
// USDA FoodData Central → IGU food catalog ingest (P0-ingest).
//
// ONE-TIME data load. Parses the FDC Foundation + SR Legacy bulk JSON and emits
// batched, IDEMPOTENT SQL into an output dir. The SQL is then applied to prod via
// the owner-level write path (MCP execute_sql) — there is no service-role key on
// disk, and this script deliberately touches no network and no database itself:
// parse+map here, review the counts, apply the SQL separately.
//
// Loads into the EXISTING P0-lite schema (migrations 20260714120000*). Invents no
// columns. Branded / partner / recipes (P2/P3) are out of scope.
//
// Run:  node scripts/ingest-usda-foods.mjs <foundation.json> <sr_legacy.json> <outdir>
//
// ── Two things the raw data forces, both verified against the 2025-12/2021-10 sets ──
//
//   1. ENERGY IS NOT ALWAYS NUTRIENT 208. Foundation reports most foods' calories
//      under 958 / 957 (Atwater factors, also kcal) — 226 of 365 Foundation foods
//      have NO 208 row. Taking 208 alone would load them at 0 kcal: real macros,
//      zero calories, silently. So energy falls back 208 → 958 → 957.
//
//   2. THE UNIT IS IN `modifier`, NOT `measureUnit`. measureUnit is "undetermined"
//      for ~97% of portions; the human unit ("cup", "fillet", "fl oz") lives in
//      `modifier`. Volume units carry a real density (milk: 1 cup=244 g ⇒ 97 ml/100 g,
//      matching the hand-seed), so ml/L logging lights up. Pure mass units (oz, lb)
//      are skipped — the picker already offers g/kg natively; a "1 oz" portion is
//      just noise.
// ============================================================================

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const [, , FOUNDATION, SR, OUTDIR] = process.argv;
if (!FOUNDATION || !SR || !OUTDIR) {
  console.error("usage: node ingest-usda-foods.mjs <foundation.json> <sr.json> <outdir>");
  process.exit(1);
}
mkdirSync(OUTDIR, { recursive: true });

// ── The 13 tracked nutrients (fdc_nutrient_number → nutrients.key). Ignore USDA's other ~150.
const NUTRIENT_KEY_BY_NUMBER = {
  "208": "energy", "203": "protein", "204": "fat", "205": "carb", "291": "fiber",
  "269": "sugar", "606": "sat_fat", "307": "sodium", "306": "potassium",
  "301": "calcium", "303": "iron", "401": "vitamin_c", "328": "vitamin_d",
};
// Energy fallbacks: 958 = Atwater General, 957 = Atwater Specific — both kcal.
const ENERGY_FALLBACK_NUMBERS = ["208", "958", "957"];

// ── USDA foodCategory.description → seeded food_categories.id (verified live 2026-07-14).
//    Best first-pass; staff refine in the Food Library Manager. Unmapped ⇒ NULL.
const CAT = {
  PROTEIN: "62f20bf3-614b-4bf9-ac6f-b43b7b8eacc8",
  POULTRY: "4df63fad-5765-4ee3-8211-fed93e577a4b",
  RED_MEAT: "4904b4c4-a8a2-4049-8548-3edbae5adcb1",
  FISH: "84d4c0d9-ceec-41bd-906d-a760db138300",
  EGGS: "9f202c25-8c72-4af8-ad1e-b1a9e2e6dd56",
  DAIRY_PROTEIN: "76b54d7b-045d-4037-bf34-e78b9333a7e1",
  PLANT_PROTEIN: "86bb6505-4e0b-49a1-8982-d44c16558a7e",
  CARBS: "7f52e46b-b3a6-453b-8b76-e99882d2b770",
  GRAINS: "ddc5d359-3eb6-45e9-9434-88f111042ac2",
  BAKERY: "8592a106-590c-4ee8-987a-949452be8dbd",
  RICE_PASTA: "b21bc0e8-4467-44b6-8216-d58165fe2653",
  LEGUMES: "8957e431-a1e8-43b7-97a9-ca956af468dc",
  VEGETABLES: "6e82d9c9-70ba-450a-98e6-0100a04dcedb",
  OTHER_VEG: "ed7de220-9281-4867-bf07-5fda1d691434",
  FRUITS: "1ee565fa-8e3a-4c4f-a1f2-862cbd9371e1",
  FRESH_FRUIT: "f6b8e2d5-8a9c-44e0-89c0-cd665dc6ff43",
  FATS: "395b06ed-74b2-44af-a010-34e68a6de1d8",
  OILS: "205d22c7-3afc-4d57-a6a3-203b202c23c5",
  NUTS: "7fad9899-1646-4e93-9cad-bd8aa4a9c239",
  DAIRY: "5e8145a2-c7cf-467d-913b-ad58ac6cd9e9",
  SNACKS: "b1040093-5f2d-49d1-8020-c6a01a3e054e",
  CONFECTIONERY: "f41f808a-93f9-429c-baf6-324181e2eca8",
  CHIPS: "ba85e307-48ba-47f6-844d-7e41813a486b",
  BEVERAGES: "09976785-b71c-4c21-93ab-f8d7d73e6485",
  JUICES: "8a1cb53d-b3f8-4135-829a-0d81662fb33a",
  CONDIMENTS: "4d8c9f36-59cc-445d-a6e3-a1ee6bb35bdb",
  COOKING_SAUCES: "028f8911-5622-45bb-b911-8dca1c634954",
  PREPARED: "f8426be1-5857-4b67-b2a5-cf94db7e2915",
};
const CATEGORY_MAP = {
  "Beef Products": CAT.RED_MEAT,
  "Vegetables and Vegetable Products": CAT.OTHER_VEG,
  "Baked Products": CAT.BAKERY,
  "Lamb, Veal, and Game Products": CAT.RED_MEAT,
  "Fruits and Fruit Juices": CAT.FRESH_FRUIT,
  "Poultry Products": CAT.POULTRY,
  "Beverages": CAT.BEVERAGES,
  "Sweets": CAT.CONFECTIONERY,
  "Baby Foods": CAT.PREPARED,
  "Pork Products": CAT.RED_MEAT,
  "Dairy and Egg Products": CAT.DAIRY,
  "Legumes and Legume Products": CAT.LEGUMES,
  "Fast Foods": CAT.PREPARED,
  "Finfish and Shellfish Products": CAT.FISH,
  "Soups, Sauces, and Gravies": CAT.COOKING_SAUCES,
  "Fats and Oils": CAT.OILS,
  "Cereal Grains and Pasta": CAT.GRAINS,
  "Breakfast Cereals": CAT.GRAINS,
  "Snacks": CAT.CHIPS,
  "Sausages and Luncheon Meats": CAT.RED_MEAT,
  "American Indian/Alaska Native Foods": CAT.PREPARED,
  "Nut and Seed Products": CAT.NUTS,
  "Restaurant Foods": CAT.PREPARED,
  "Meals, Entrees, and Side Dishes": CAT.PREPARED,
  "Spices and Herbs": CAT.CONDIMENTS,
};

// ── Volume units → millilitres. Density (ml per 100 g) = mlOfPortion / gramWeight * 100.
const ML_PER_UNIT = {
  cup: 236.588, cups: 236.588,
  tbsp: 14.7868, tablespoon: 14.7868, tablespoons: 14.7868,
  tsp: 4.92892, teaspoon: 4.92892, teaspoons: 4.92892,
  "fl oz": 29.5735, "fluid ounce": 29.5735, "fluid ounces": 29.5735,
  ml: 1, milliliter: 1, milliliters: 1, millilitre: 1,
  l: 1000, liter: 1000, litre: 1000,
  quart: 946.353, quarts: 946.353, pint: 473.176, pints: 473.176,
  gallon: 3785.41, gallons: 3785.41,
};
// Pure mass units — the picker already offers g/kg, so a named mass portion is redundant noise.
const MASS_UNITS = ["fl oz", "fluid ounce", "fluid ounces", "oz", "ounce", "ounces", "lb", "lbs", "pound", "pounds", "gram", "grams", "kg", "mg"];
// "fl oz" is a VOLUME unit, not mass — it must be tested before "oz" so it wins the prefix.
// (It lives in ML_PER_UNIT; it is only listed above so plain "oz" doesn't swallow it.)

// Tokens tested longest-first so multi-word units ("fluid ounce") beat their prefixes ("oz"),
// and "fl oz" is matched as volume before "oz" is matched as mass.
const VOLUME_TOKENS = Object.keys(ML_PER_UNIT).sort((a, b) => b.length - a.length);
const MASS_TOKENS = MASS_UNITS.filter((u) => !(u in ML_PER_UNIT)).sort((a, b) => b.length - a.length);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const leadingUnit = (text) => {
  const t = text.trim().toLowerCase();
  for (const tok of VOLUME_TOKENS) if (new RegExp("^" + escapeRe(tok) + "\\b").test(t)) return { kind: "volume", ml: ML_PER_UNIT[tok] };
  for (const tok of MASS_TOKENS) if (new RegExp("^" + escapeRe(tok) + "\\b").test(t)) return { kind: "mass" };
  return null;
};

const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const num = (n) => (n == null || Number.isNaN(Number(n)) ? "NULL" : Number(n));

/** First energy amount found by preference 208 → 958 → 957. */
function energyKcal(food) {
  for (const number of ENERGY_FALLBACK_NUMBERS) {
    const row = food.foodNutrients.find((n) => String(n.nutrient?.number) === number && n.amount != null);
    if (row) return row.amount;
  }
  return null;
}

/** The 13 tracked nutrients as { key: amount_per_100g }. Energy uses the fallback chain. */
function trackedNutrients(food) {
  const out = {};
  for (const n of food.foodNutrients) {
    const key = NUTRIENT_KEY_BY_NUMBER[String(n.nutrient?.number)];
    if (!key || key === "energy" || n.amount == null) continue;
    // USDA's "carbohydrate by difference" (100 − protein − fat − ash − water − fibre) can go
    // slightly negative from rounding. A negative gram amount is physically 0 and also trips
    // the amount_per_100g >= 0 CHECK. Clamp — don't drop the row, the food still has 0g of it.
    if (out[key] == null) out[key] = Math.max(0, n.amount); // first wins
  }
  const e = energyKcal(food);
  if (e != null) out.energy = Math.max(0, e);
  return out;
}

/** Portions we keep: volume (with density) + household (serving). Mass units skipped. */
function portionsFor(food) {
  const out = [];
  const seen = new Set();
  for (const p of food.foodPortions ?? []) {
    const gram = Number(p.gramWeight);
    if (!gram || gram <= 0) continue;
    const modifier = String(p.modifier ?? "").trim();
    const muName = p.measureUnit?.name && p.measureUnit.name !== "undetermined" ? String(p.measureUnit.name).trim() : "";
    const amount = p.amount && Number(p.amount) > 0 ? Number(p.amount) : 1;

    // The unit can live in EITHER field: SR Legacy puts it in `modifier` ("cup, chopped"),
    // Foundation often leaves modifier empty and puts it in `measureUnit` ("tablespoon").
    // Prefer the explicit measureUnit, fall back to the modifier's leading token.
    const detected = leadingUnit(muName) ?? leadingUnit(modifier);
    if (detected?.kind === "mass") continue; // redundant with native g/kg

    // Human label: the descriptive modifier if present ("cup, chopped"), else the unit word.
    const word = modifier || muName || "serving";
    const label = (amount === 1 ? `1 ${word}` : `${amount} ${word}`).slice(0, 80);

    let unit_kind = "serving", ml_equiv = null;
    if (detected?.kind === "volume") {
      const density = Math.round((detected.ml * amount / gram) * 100 * 100) / 100; // ml per 100 g
      // DENSITY SANITY GATE. A "cup" of a POURABLE LIQUID sits near water: milk 97, oil 109,
      // honey ~70. A "1 cup, chopped/shredded/sliced" of a SOLID is a loose volume measure and
      // computes a wild density (leafy greens ~450, airy ~950). Enabling ml/L off that would
      // let a client "log 300 ml of spinach" and convert it by a meaningless number — the exact
      // fabrication D6 forbids. So a volume portion only stays VOLUME (ml/L enabled) when its
      // density is liquid-plausible; otherwise it degrades to a household SERVING (keep "1 cup",
      // drop ml). Band chosen to admit water→oil→honey and reject loose solids: rice cooked
      // ~150, flour ~189 both correctly fall to serving.
      if (density >= 55 && density <= 140) {
        unit_kind = "volume";
        ml_equiv = density;
      }
    }

    if (seen.has(label)) continue; // UNIQUE(food_id,label) — dedup within the food up front
    seen.add(label);
    out.push({ label, gram_weight: Math.round(gram * 100) / 100, unit_kind, ml_equiv });
  }
  return out;
}

function mapFood(food, source) {
  const fdcId = String(food.fdcId);
  const name = String(food.description ?? "").trim();
  if (!name) return null;
  const usdaCat = typeof food.foodCategory === "object"
    ? food.foodCategory?.description
    : food.foodCategory;
  const category_id = CATEGORY_MAP[usdaCat] ?? null;
  const portions = portionsFor(food);
  const serving_default_g = portions.length ? portions[0].gram_weight : null;
  return {
    fdc_id: fdcId,
    source,
    name,
    category_id,
    serving_default_g,
    nutrients: trackedNutrients(food),
    portions,
  };
}

// ── Parse ────────────────────────────────────────────────────────────────────
console.log("parsing…");
const foundation = JSON.parse(readFileSync(FOUNDATION, "utf8")).FoundationFoods ?? [];
const srLegacy = JSON.parse(readFileSync(SR, "utf8")).SRLegacyFoods ?? [];

// A food with NO energy figure anywhere in USDA (not even Atwater 958/957) is skipped.
// Loading it would show "0 kcal" in search — and in a food LOG that is worse than absent:
// a client logs it as calorie-free and silently under-counts their intake. We do not ship a
// food we cannot state calories for, and we do NOT fabricate one (computing our own Atwater
// would invent a number USDA chose not to). These are incomplete research records — 42 of
// ~8200, all Foundation single-nutrient samples.
let skippedNoEnergy = 0;
const foods = [];
const consider = (f, source) => {
  const m = mapFood(f, source);
  if (!m) return;
  if (m.nutrients.energy == null) { skippedNoEnergy++; return; }
  foods.push(m);
};
for (const f of foundation) consider(f, "usda_foundation");
for (const f of srLegacy) consider(f, "usda_sr");

// De-dupe on fdc_id WITHIN the input (Foundation and SR share none, but be safe).
const byFdc = new Map();
for (const f of foods) if (!byFdc.has(f.fdc_id)) byFdc.set(f.fdc_id, f);
const allFoods = [...byFdc.values()];

// ── Stats (printed so the counts can be eyeballed before anything hits prod) ──
let nutrientRows = 0, portionRows = 0, zeroKcal = 0, noCat = 0, withVolume = 0;
for (const f of allFoods) {
  nutrientRows += Object.keys(f.nutrients).length;
  portionRows += f.portions.length;
  if (f.nutrients.energy == null) zeroKcal++;
  if (f.category_id == null) noCat++;
  if (f.portions.some((p) => p.unit_kind === "volume")) withVolume++;
}
const stats = {
  foods: allFoods.length,
  food_nutrients: nutrientRows,
  food_portions: portionRows,
  skipped_no_energy: skippedNoEnergy,
  foods_loaded_missing_energy: zeroKcal, // must be 0 — skip filter above guarantees it
  foods_unmapped_category: noCat,
  foods_with_volume_portion: withVolume,
};
console.log("stats:", JSON.stringify(stats, null, 2));
writeFileSync(join(OUTDIR, "stats.json"), JSON.stringify(stats, null, 2));

// ── Emit batched, idempotent SQL ─────────────────────────────────────────────
// foods: INSERT…SELECT…WHERE NOT EXISTS(fdc_id) — idempotent WITHOUT a unique constraint,
// so re-runs and mid-run failures insert 0 dupes and no schema change is needed.
function foodsSql(batch) {
  const values = batch.map((f) =>
    `(${q(f.fdc_id)},${q(f.source)}::public.food_source,${q(f.name)},` +
    `${f.category_id ? q(f.category_id) + "::uuid" : "NULL"},${num(f.serving_default_g)})`
  ).join(",\n");
  return (
    `INSERT INTO public.foods (fdc_id, source, name, category_id, serving_default_g,\n` +
    `                          owner_user_id, approval_status, is_verified, is_active)\n` +
    `SELECT v.fdc_id, v.source, v.name, v.category_id, v.serving_default_g,\n` +
    `       NULL, 'approved'::public.food_approval_status, true, true\n` +
    `FROM (VALUES\n${values}\n) AS v(fdc_id, source, name, category_id, serving_default_g)\n` +
    `WHERE NOT EXISTS (SELECT 1 FROM public.foods f WHERE f.fdc_id = v.fdc_id);`
  );
}

// nutrients: resolve food_id via fdc_id JOIN, nutrient_id via key JOIN. PK ⇒ ON CONFLICT.
function nutrientsSql(rows) {
  const values = rows.map((r) => `(${q(r.fdc_id)},${q(r.key)},${num(r.amount)})`).join(",\n");
  return (
    `INSERT INTO public.food_nutrients (food_id, nutrient_id, amount_per_100g)\n` +
    `SELECT f.id, n.id, v.amount\n` +
    `FROM (VALUES\n${values}\n) AS v(fdc_id, key, amount)\n` +
    `JOIN public.foods f ON f.fdc_id = v.fdc_id\n` +
    `JOIN public.nutrients n ON n.key = v.key\n` +
    `ON CONFLICT (food_id, nutrient_id) DO NOTHING;`
  );
}

// portions: resolve food_id via fdc_id JOIN. UNIQUE(food_id,label) ⇒ ON CONFLICT.
function portionsSql(rows) {
  const values = rows.map((r, i) =>
    `(${q(r.fdc_id)},${q(r.label)},${num(r.gram_weight)},${q(r.unit_kind)}::public.food_unit_kind,${num(r.ml_equiv)},${i})`
  ).join(",\n");
  return (
    `INSERT INTO public.food_portions (food_id, label, gram_weight, unit_kind, ml_equiv, sort_order)\n` +
    `SELECT f.id, v.label, v.gram_weight, v.unit_kind, v.ml_equiv, v.sort_order\n` +
    `FROM (VALUES\n${values}\n) AS v(fdc_id, label, gram_weight, unit_kind, ml_equiv, sort_order)\n` +
    `JOIN public.foods f ON f.fdc_id = v.fdc_id\n` +
    `ON CONFLICT (food_id, label) DO NOTHING;`
  );
}

function writeBatches(prefix, items, size, render) {
  let n = 0;
  for (let i = 0; i < items.length; i += size) {
    const name = `${prefix}-${String(n).padStart(3, "0")}.sql`;
    writeFileSync(join(OUTDIR, name), render(items.slice(i, i + size)) + "\n");
    n++;
  }
  return n;
}

const nFoods = writeBatches("01-foods", allFoods, 700, foodsSql);

const nutrientFlat = [];
for (const f of allFoods) for (const [key, amount] of Object.entries(f.nutrients)) nutrientFlat.push({ fdc_id: f.fdc_id, key, amount });
const nNut = writeBatches("02-nutrients", nutrientFlat, 2500, nutrientsSql);

const portionFlat = [];
for (const f of allFoods) f.portions.forEach((p) => portionFlat.push({ fdc_id: f.fdc_id, ...p }));
const nPort = writeBatches("03-portions", portionFlat, 2500, portionsSql);

console.log(`emitted SQL: ${nFoods} foods files, ${nNut} nutrient files, ${nPort} portion files → ${OUTDIR}`);
