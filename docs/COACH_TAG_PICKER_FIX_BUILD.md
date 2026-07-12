# Coach specializations — swap free-text for the tag picker (matching fix)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Cowork verifies on prod.
**Why:** client onboarding "Areas of Focus" is bound to `specialization_tags` (snake_case values). Coach↔client matching (`calculateMatchScore` / `calculateSpecializationMatchScore`) does an exact normalized-string compare of coach `specializations` vs client `focus_areas`. But the **coach self-service profile editor still uses a free-text comma box**, so coaches enter values that never match (real prod example: coach Fahad `["Powerlifting","Nutrition"]` — "Nutrition" ≠ the tag `nutrition_coaching`, so it never matches and renders as a raw word). The `SpecializationTagPicker` already exists and is already used in `CoachSignup` and `SpecialistProfile`; `CoachProfile.tsx` is the one holdout.

## Change 1 — `src/components/CoachProfile.tsx`: free-text → `SpecializationTagPicker`
Mirror the pattern already shipped in `SpecialistProfile.tsx:259-273`.

- **Import:** `import { SpecializationTagPicker } from "@/components/ui/SpecializationTagPicker";`
- **State shape:** `formData.specializations` is currently a comma-joined **string**. Make it a **`string[]`**.
  - Default (`CoachProfile.tsx:58`): `specializations: ""` → `specializations: [] as string[]`.
  - Load (`~line 136`): `specializations: (data.specializations || []).join(", ")` → `specializations: data.specializations || []`.
  - Save (`~line 215-217`): drop the `.split(",")` — write the array directly:
    ```ts
    specializations: formData.specializations,
    ```
    (Keep the `qualifications` newline-split as-is — only specializations changes.)
- **UI (replace `CoachProfile.tsx:400-408`)** — the `<Label>Specializations (comma separated)</Label>` + `<Input>` block becomes:
  ```tsx
  <div className="space-y-2">
    <Label>Specializations</Label>
    <SpecializationTagPicker
      selectedTags={formData.specializations}
      onToggle={(tagValue) =>
        setFormData((prev) => ({
          ...prev,
          specializations: prev.specializations.includes(tagValue)
            ? prev.specializations.filter((v) => v !== tagValue)
            : [...prev.specializations, tagValue],
        }))
      }
      maxTags={15}
    />
  </div>
  ```
- Write target is unchanged — coach self-service writes `coaches_public` directly (per CLAUDE.md), and `coaches_public.specializations` is already `text[]`. This is display/entry only; no schema change.
- tsc will flag any other place that treated `formData.specializations` as a string — fix those to array semantics.

## Change 2 — one-time backfill of existing free-text specializations → tag values
A migration (data-only; wrap in a transaction). Normalize existing `coaches_public.specializations` entries to canonical `specialization_tags.value`s:
- Lowercase + trim + replace spaces/hyphens with `_` (so `"Strength Training"` / `"Powerlifting"` → `strength_training` / `powerlifting`).
- Keep only values that exist in `specialization_tags` (active). Map a small alias set for common near-misses — at minimum `nutrition` → `nutrition_coaching` (that's the live Fahad case). Add `strength` → `strength_training`, `mobility` → `mobility_flexibility` if present.
- Drop any leftover value that still doesn't resolve to a real tag (don't invent tags), and log the coach_id + dropped value in the migration output so we can eyeball. After this ships, any coach whose value was dropped simply re-opens the picker and taps the right tag (nothing is destroyed — matching just ignored it already).
- Idempotent: re-running produces the same result. Admin/service-role gated.
- Prod has only ~2 coaches with data today (verified) so blast radius is tiny — but write it general.

Cowork can run the read side to confirm the mapping before CC applies the migration; hand me the SQL and I'll dry-run a `SELECT` version against prod first.

## Optional (nice-to-have, flag don't block) — fuzzy fallback in matching
`calculateMatchScore` (`CoachPreferenceSection.tsx:155`) and `calculateSpecializationMatchScore` (`src/lib/coachMatching.ts:61`) do exact normalized compares. Once both sides are tag-bound this is exact-correct and needs nothing. Do NOT add fuzzy matching now — the picker makes it unnecessary and fuzzy risks false "matches". Noted only so it isn't re-raised.

## Verify (Cowork, prod)
- Coach self-service profile (`/coach` profile editor, signed in as a coach): Specializations is now the chip picker; existing tags show pre-selected; toggling + Save round-trips to `coaches_public.specializations` as tag values.
- Post-backfill: `SELECT user_id, specializations FROM coaches_public WHERE specializations IS NOT NULL` — every value is a valid `specialization_tags.value` (no capitalized / free-text leftovers).
- Onboarding coach step (1:1): a coach whose tags overlap a client's focus areas now shows a correct "N goals match" badge; View-profile shows proper labels.
- tsc (~303 baseline zero-new), ESLint 0, build clean.
