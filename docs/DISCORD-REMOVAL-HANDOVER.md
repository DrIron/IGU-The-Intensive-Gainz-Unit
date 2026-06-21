# Handover — Remove Discord

_For a dedicated Cowork+Claude Code session. Authored 2026-06-20. Feature-handover #1 (see `docs/FEATURE-IDEAS-HANDOVER.md`). **Decision confirmed: Discord is OUT.** Read `CLAUDE.md` first. Relay model: Cowork specs/verifies; Claude Code edits/tests/deploys._

## Goal
Remove the Discord integration entirely, in two phases so the launch isn't risked: **Phase 1 (pre-launch)** = strip client-facing references so brand-new clients aren't told about a channel that's being dropped. **Phase 2 (post-launch)** = remove the backend/admin/automation and drop the DB columns.

## Phase 1 — client-facing removal (PRE-LAUNCH)
Remove Discord copy/links/steps from these (grep `discord` in each; counts from a 2026-06-20 scan):
- `src/components/onboarding/ServiceStep.tsx` (5) — the heaviest; Discord likely shown as a service perk/step.
- `src/components/onboarding/LegalStep.tsx` (1) — **coordinate with the Legal handover session; same file, don't collide.**
- `src/pages/OnboardingForm.tsx` (1)
- `src/components/client/WelcomeModal.tsx` (1)
- `src/components/marketing/ComparisonTable.tsx` (1) and `src/components/marketing/FAQSection.tsx` (1)
- `src/components/Navigation.tsx` (1)
- i18n: `src/i18n/locales/en/nav.json` + `src/i18n/locales/ar/nav.json` (Discord nav strings)
- Also check (appeared in the broad scan): `src/pages/Dashboard.tsx`, `src/pages/ClientSubmission.tsx`, `src/components/PaymentStatusDashboard.tsx`, `src/lib/routeConfig.ts` — remove any Discord route/label/link.
- The **`discord_username` input** collected during onboarding/coach-application: remove the field in Phase 1 (stop collecting); **drop the column in Phase 2** (it's on several submission tables — see below).

Phase 1 is UI/copy only — no DB changes — so it's safe to ship pre-launch.

## Phase 2 — backend / admin / DB (POST-LAUNCH)
- **Admin UI:** `src/components/ServiceConfiguration.tsx` (Discord role config), the **Discord Automation** section in `src/components/admin/AdminDashboardLayout.tsx`, and `src/components/admin/PlansServicesManager.tsx`.
- **Edge functions:** delete `supabase/functions/manage-discord-roles/`; remove the Discord call inside `supabase/functions/verify-payment/index.ts` (verify-grep — be careful not to break the payment-verification happy path).
- **DB (migration, additive-safe):** drop `services.discord_role_id` (migration `20251005103034`) and the `discord_username` columns on the submission/profile tables (migrations `20251005095612`, `20260121170317`, `20260123144847`, etc.). Use a new timestamped migration; **never edit applied migrations**. Confirm nothing still reads these before dropping (grep + check generated `types.ts`). On this single-project setup, mind the prod-ahead `db push` playbook.

## Gotchas
- **Same-file collision:** `LegalStep.tsx` is touched by both this and the Legal handover — sequence them, don't run both sessions on it simultaneously (we hit stacked-branch friction before).
- Removing the `verify-payment` Discord call must not change payment status logic — it should be a clean excision of the side-effect only.
- `discord_username` is collected next to `heard_about_us` in the onboarding insert RPCs — removing the input (Phase 1) and dropping the column (Phase 2) are separate; don't drop while the insert still references it.
- After Phase 2, regenerate `src/integrations/supabase/types.ts`.

## First moves
Pull `main`, `grep -ril discord src supabase`, and split the hits into the Phase 1 (client-facing) vs Phase 2 (backend/DB) buckets above. Ship Phase 1 as one PR pre-launch; hold Phase 2 for after.
