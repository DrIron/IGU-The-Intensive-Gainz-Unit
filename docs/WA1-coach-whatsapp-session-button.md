# WA1 — "Message coach about this session" (WhatsApp deep-link)

_Spec authored 2026-06-20 (Cowork). From the feature handover (`docs/FEATURE-IDEAS-HANDOVER.md` #3). Hybrid-messaging direction confirmed: WhatsApp is the primary client↔coach channel; this is its flagship touchpoint._

**What:** On the workout completion sheet, **1:1 clients** get a "Message coach about this session" button that opens WhatsApp pre-filled with a tidy recap of what they just did (volume, sets, time, new PRs), which they then continue in their own words.

**Effort:** S–M (1 migration + 2 frontend files). **Surfaces:** `WorkoutCompletionSheet.tsx`, `WorkoutSessionV2.tsx`, + 1 RPC migration.

---

## Why a backend piece is needed
`get_coach_for_client` returns coach display fields but **not** `whatsapp_number` — that's PII on `coaches_private`, which clients can't SELECT. So we add a dedicated, gated RPC that returns only the number, only to that coach's client.

## 1. Migration — `get_coach_whatsapp_for_client` RPC
New file `supabase/migrations/<YYYYMMDDHHMMSS>_get_coach_whatsapp_for_client.sql`. Mirror `get_coach_for_client`'s auth (migration `20260517104551`) + the mandatory REVOKE/GRANT convention (CLAUDE.md "SECURITY DEFINER RPCs").

```sql
CREATE OR REPLACE FUNCTION public.get_coach_whatsapp_for_client(p_coach_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT cpv.whatsapp_number
  FROM public.coaches_private cpv
  WHERE cpv.user_id = p_coach_user_id
    AND cpv.whatsapp_number IS NOT NULL
    AND cpv.whatsapp_number <> ''
    AND (
      public.is_primary_coach_for_user(p_coach_user_id, (SELECT auth.uid()))
      OR public.is_care_team_member_for_client(p_coach_user_id, (SELECT auth.uid()))
    );
$$;

REVOKE ALL ON FUNCTION public.get_coach_whatsapp_for_client(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_coach_whatsapp_for_client(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_coach_whatsapp_for_client(uuid) TO authenticated;
```
Verify anon is denied: `BEGIN; SET LOCAL ROLE anon; SELECT get_coach_whatsapp_for_client('...'); ROLLBACK;` → must raise `42501`. (Confirm the `is_care_team_member_for_client` arg order against `get_coach_for_client` before relying on it.)

## 2. `WorkoutCompletionSheet.tsx` — render the button
Add optional props and a button above "Done" in BOTH the mobile (footer `<div>`) and desktop branches. Build the wa.me href inside the sheet so it reuses the existing `formatElapsed` + `fromCanonicalKg` (consistent units/formatting).

New props:
```ts
coachWhatsApp?: string | null;   // digits/number from the RPC; falsy => no button
moduleTitle?: string;
sessionDateLabel?: string;       // e.g. "20 Jun 2026"
```

Helper inside the component:
```ts
function buildCoachMessage(summary: WorkoutSummary, unit: WeightUnit, moduleTitle?: string, dateLabel?: string): string {
  const vol = fromCanonicalKg(summary.volumeKg, unit, 0) ?? 0;
  const lines: string[] = [];
  lines.push(`Hi coach -- just finished ${moduleTitle ?? "my session"}${dateLabel ? ` (${dateLabel})` : ""}.`);
  lines.push(`Volume ${vol.toLocaleString()} ${unit} · ${summary.setsCompleted} sets${(() => { const e = formatElapsed(summary.elapsedSeconds); return e ? ` · ${e}` : ""; })()}`);
  if (summary.prs.length) {
    lines.push("New PRs:");
    for (const pr of summary.prs) {
      lines.push(`- ${pr.name}: ${fromCanonicalKg(pr.weightKg, unit, unit === "kg" ? 1 : 0)} ${unit} x ${pr.reps}`);
    }
  }
  lines.push("", ""); // leave room for the client to keep typing
  return lines.join("\n");
}
```
Render (above each "Done" button), only when `coachWhatsApp` is truthy:
```tsx
{coachWhatsApp && (
  <a
    href={`https://wa.me/${coachWhatsApp.replace(/\D/g, "")}?text=${encodeURIComponent(buildCoachMessage(summary, unit, moduleTitle, sessionDateLabel))}`}
    target="_blank"
    rel="noopener noreferrer"
    className="mb-2 block"
  >
    <Button variant="outline" className="w-full gap-2">
      <MessageCircle className="w-4 h-4" /> Message coach about this session
    </Button>
  </a>
)}
```
(`MessageCircle` from lucide-react. Use `--` not an em dash in the copy per CLAUDE.md email/copy rule.)

## 3. `WorkoutSessionV2.tsx` — resolve number + gate to 1:1, pass props
- **Do NOT add these reads to `loadSession`'s Promise.all** (BUG3 / WK7 §1.5 pooler-starvation rule). Resolve them in a SEPARATE, ref-guarded effect that runs once after `module` is set.
- Gate: only 1:1-tier clients. Fetch the caller's active subscription service slug once (`subscriptions` active for `auth.uid()` → `services.slug`); show the button only when slug ∈ {`one_to_one_online`,`one_to_one_complete`,`hybrid`,`in_person`} (i.e. **not** `team_plan`).
- If 1:1, call `get_coach_whatsapp_for_client({ p_coach_user_id: module.module_owner_coach_id })`; store the returned number in state (null if none).
- Pass to the sheet: `coachWhatsApp={coachWhatsApp}`, `moduleTitle={module.title}`, `sessionDateLabel={<formatted module/session date>}`.

The button therefore appears only when: client is 1:1 **and** the coach has a WhatsApp number set. Everyone else sees the sheet exactly as today.

## Verify
- `tsc --noEmit` clean; `npm run build` clean.
- RPC: anon-denied check (42501); as a 1:1 client, returns the coach's number; as a non-client, returns null.
- Live (after deploy): complete a 1:1 session → button shows → opens WhatsApp to the coach with the recap pre-filled (PRs listed). Team-plan client → no button. Coach with no number → no button.

## Non-goals
- No change to the in-app messaging system (hybrid: it stays for care-team/MDT — see handover #4).
- No coach-side UI; coaches set their WhatsApp number in their existing profile/admin fields.
- Team-plan clients are intentionally excluded.
