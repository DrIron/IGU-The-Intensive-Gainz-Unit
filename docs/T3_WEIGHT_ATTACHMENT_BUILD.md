# T3 — Weight-Change Attachment (testimonial proof) — Build Spec

_Slice C (T3) of `docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` §3.2/§5: a client optionally attaches a real, coach-scoped weight change to their testimonial, rendered as proof on the public surfaces._
_Created 2026-07-10. T1 (Slice A) is complete + verified. Lift-progression proof = T4 (deferred, gated on the canonical workout log)._

---

## 0. Ground state + the key insight

**Schema (prod-verified 2026-07-10):**
- `weight_logs`: `id, phase_id, user_id, log_date, weight_kg, week_number, created_at`.
- `nutrition_phases`: `id, user_id, **coach_id**, phase_name, goal_type, start_date, end_date, is_active, created_at`.
- `testimonials`: no `attachment*` columns yet (net-new).
- Fixture: +online (`4331fa4f`) has 22 weight logs across 2 phases — good test data.

**The insight that shapes the design:** `nutrition_phases.coach_id` ties every phase (and its weight logs) to a specific coach. So scoping a weight-change proof to a **phase whose `coach_id` = the reviewed coach** satisfies the plan's Gap-2 honesty guardrail *by construction* — we can never credit coach A for results a client achieved under coach B.

## Decisions (recommended — grounded in the schema; flag to change)
1. **Source = computed from `weight_logs`, never self-reported.** Real logged data → trustworthy.
2. **Window = a nutrition phase, restricted to phases where `coach_id` = the reviewed coach.** No free date-range in v1 (a free range can't be coach-verified and would break Gap-2). Phase = clean start/end + already coach-scoped.
3. **Tamper-proof:** the snapshot is computed **server-side** in a SECURITY DEFINER RPC from the client's own logs; the client never passes the numbers. Denormalized into `attachment` so the public render never reads private `weight_logs`.

---

## 1. Migration A — attachment columns
`supabase/migrations/YYYYMMDDHHMMSS_testimonial_attachments.sql`:
```sql
ALTER TABLE public.testimonials
  ADD COLUMN IF NOT EXISTS attachment_type text NOT NULL DEFAULT 'none'
    CHECK (attachment_type IN ('none','weight_change','lift_progression')),  -- lift_progression = T4
  ADD COLUMN IF NOT EXISTS attachment jsonb,
  ADD COLUMN IF NOT EXISTS attachment_note text CHECK (attachment_note IS NULL OR char_length(attachment_note) <= 280);
```
`attachment` shape for `weight_change`: `{ phase_id, phase_name, start_kg, end_kg, delta_kg, weeks, from_date, to_date }`. Regen types.

## 2. Migration B — RPCs (SECURITY DEFINER, one CREATE FUNCTION per file, REVOKE-PUBLIC pattern)
- **`get_attachable_weight_phases(p_coach_user_id uuid) RETURNS jsonb`** (authenticated; own client). Returns the caller's nutrition phases where `coach_id = p_coach_user_id`, each with a computed preview: `{ phase_id, phase_name, goal_type, start_kg, end_kg, delta_kg, weeks, from_date, to_date }` (start = earliest `weight_logs.weight_kg` in the phase, end = latest, `weeks` from log-date span or phase start/end). Phases with <2 logs → omit (no computable delta). Used by the submit + manage UIs to offer real, coach-scoped options.
- **`attach_weight_change(p_testimonial_id uuid, p_phase_id uuid, p_note text) RETURNS jsonb`** (authenticated). Guards: `testimonials.user_id = auth.uid()` (own testimonial) AND `nutrition_phases.user_id = auth.uid()` (own phase) AND **`nutrition_phases.coach_id = testimonials.coach_id`** (Gap-2 — raise if the phase isn't under the reviewed coach). Recomputes the snapshot server-side from `weight_logs`, sets `attachment_type='weight_change'`, `attachment = <snapshot>`, `attachment_note = p_note`. Returns the stored snapshot.
- **`clear_testimonial_attachment(p_testimonial_id uuid)`** (own testimonial) — sets `attachment_type='none'`, nulls `attachment`/`attachment_note`.
- **Extend `get_coach_public_testimonials`** to also return `attachment_type`, `attachment`, `attachment_note` (so the coach reputation block renders the proof).
- Grants: all authenticated-only except the extended `get_coach_public_testimonials` stays anon (it already is). REVOKE-PUBLIC/anon + GRANT authenticated on the 3 new write/read RPCs.

## 3. Submit — "Add proof" (`src/pages/Testimonial.tsx`)
- After consent/attribution, an optional **"Add proof: weight change"** disclosure. If the client has attachable phases (`get_attachable_weight_phases(selectedCoachId)` returns any), show a phase dropdown labeled e.g. *"Summer Cut · −8.2 kg over 12 weeks"* + an optional note (≤280). No phases → hide the section (nothing to prove yet).
- On submit: the current INSERT must return the new id (`.select('id').single()`), then call `attach_weight_change(newId, phaseId, note)` when a phase was chosen. Attachment is optional; a text-only testimonial still works.

## 4. Manage — `/my-testimonials` (`src/pages/MyTestimonials.tsx`)
- Per row: if an attachment exists, show it (proof chip) with **Remove** (`clear_testimonial_attachment`); if none, an **Add proof** affordance (same phase picker → `attach_weight_change`). de478a4 optimistic + rollback pattern.

## 5. Rendering — proof chip on every public surface
A small shared component `src/components/testimonials/WeightChangeProof.tsx` (reads the `attachment` snapshot): renders e.g. **"▼ 8.2 kg · 12 weeks"** (down-arrow + `abs(delta_kg)` + weeks), color by direction (loss vs gain — use the goal context, don't assume down=good), + the note beneath. Mount it in:
- `CoachPublicProfile` reputation quote cards (via the reputationSlot items in `CoachPublicPage` — pass attachment through).
- `TestimonialsList` cards (`/testimonials` + Index) — add `attachment_type/attachment/attachment_note` to its select + render the chip.
- `CoachTestimonials` (coach preview) + admin `TestimonialsManager` (inline, so coach/admin see the proof).

## 6. i18n
New strings (`common`, en+ar, defaultValue overload): "Add proof", "weight change", the phase-option label, "{n} kg", "{n} weeks", "Remove proof". React 19 native metadata (no helmet).

## 7. Phases (ship incrementally)
- **T3.1 — migration + RPCs** (columns, `get_attachable_weight_phases`, `attach_weight_change`, `clear_testimonial_attachment`, extend `get_coach_public_testimonials`). DB-only; SQL-verifiable.
- **T3.2 — submit + manage UI** (Testimonial.tsx "Add proof" + /my-testimonials add/remove).
- **T3.3 — rendering** (WeightChangeProof on coach page + /testimonials + coach/admin surfaces).

## 8. Verify
- `tsc -p tsconfig.app.json` (delta vs 301); eslint clean. RPC grant/anon checks; the Gap-2 guard raises when `phase.coach_id ≠ testimonial.coach_id`.
- Cowork smoke (+online client of dr.ironofficial): "Add proof" lists the client's dr.ironofficial phases with a real computed delta; attach → the fixture testimonial gets a snapshot; it renders as a proof chip on `/coaches/dr-irontraining` (when shown) + `/testimonials` (when featured); remove clears it. Attempt to attach a phase under a different coach → RPC raises.

## 9. Related
`docs/COACH_PROFILE_TESTIMONIALS_PLAN.md` (§3.2/§5, Gap 2), `docs/T1_TESTIMONIALS_CURATION_BUILD.md`, `docs/CPR_TO_T2_HANDOFF.md`. T4 (lift-progression) is deferred — the `lift_progression` enum value is reserved here but not implemented.
