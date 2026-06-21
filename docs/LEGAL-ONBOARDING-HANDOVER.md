# Handover — Legal section + onboarding consent integration

_For a dedicated Cowork+Claude Code session. Authored 2026-06-20. This is feature-handover #2 (see `docs/FEATURE-IDEAS-HANDOVER.md`). **Compliance-critical / pre-launch priority.** Read `CLAUDE.md` first. Relay model: Cowork designs/specs/verifies + produces paste-ready blocks; Claude Code implements/tests/deploys._

## Goal
Make the legal documents solid and weave **explicit, recorded consent** into onboarding — Terms, Liability Release (assumption of risk), Privacy, Refund/Cancellation, Intellectual Property — so IGU has a defensible consent trail before taking real clients. IGU is a Kuwait **sole establishment = unlimited personal liability** (see business docs), so this matters.

## Current state (grounded)
- **`legal_documents` table** (migration `20251006172449`): one row per `document_type` ∈ `terms_conditions`, `liability_release`, `privacy_policy`, `refund_policy`, `intellectual_property`. Admin manages versions via **`LegalDocumentsManager.tsx`**.
- **Onboarding `LegalStep.tsx`**: shows the 5 docs (PDF links from `legal_documents` URLs, falling back to `/public/legal/*.pdf`), each with a **checkbox**. Acceptance is stored as **boolean flags** (`agreed_terms`, `agreed_privacy`, `agreed_refund_policy`, `agreed_intellectual_property`, `agreed_medical_disclaimer`) on the onboarding submission.
- PAR-Q medical screening is separate (`parq_submissions`) — out of scope here, but adjacent.
- A bilingual "Master Coaching Service Agreement" (EN/AR) exists in Hasan's Drive — candidate source content.

## The gap to close
Consent is currently just booleans — **no timestamp, no document-version pinned to the acceptance, no per-document audit record**. For liability defense you want: "client X accepted document Y **version N** at **timestamp T**." Recommend a `legal_acceptances` table (`user_id, document_type, document_version, accepted_at`) written at onboarding, instead of (or alongside) the boolean flags.

## Suggested scope (confirm with Hasan)
1. **Content:** review/upgrade the 5 documents; ensure each `legal_documents` row has a current version + a reachable PDF (the `/public/legal/*.pdf` fallbacks must exist). Hasan owns the legal copy (and should have it lawyer-reviewed per the action plan); Arabic versions where required.
2. **Consent capture:** add timestamped, version-pinned acceptance records at onboarding (`legal_acceptances`), keep the UX (checkbox per doc) but record properly. Migration + RLS (self-insert, admin-read).
3. **Legibility:** make `LegalStep` scannable (collapsible doc cards, clear "what you're agreeing to" one-liners) rather than a wall of checkboxes — pairs with the ON1 onboarding-quiz idea on the board.

## Considerations / gotchas
- Don't regress the existing `agreed_*` flags other code may read — add the new record alongside, migrate readers deliberately.
- RLS + the SECURITY DEFINER REVOKE/GRANT convention for any new RPC (CLAUDE.md).
- Coordinate with the **Discord removal** session: `LegalStep.tsx` has 1 Discord reference (remove it there too — flag so you don't collide on the same file; sequence one after the other).
- Email copy uses `--` not `—` (CLAUDE.md) if any notifications are touched.

## First moves
Pull current `main`, read `LegalStep.tsx` + `LegalDocumentsManager.tsx` + migration `20251006172449`, confirm with Hasan which documents are final, then spec the `legal_acceptances` table + the `LegalStep` capture change before writing code.
