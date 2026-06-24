# CT — Coach client Care Team tab redesign (roster chips + threaded staff chat)

**Status:** Drop-in spec (2026-06-24, Cowork). **Priority / effort:** P2 / M. Visual polish of two existing components — no data-model change. Files: `src/components/coach/CareTeamCard.tsx`, `src/components/nutrition/CareTeamMessagesPanel.tsx` (mounted by `client-overview/tabs/CareTeamTab.tsx` — leave the tab's composition + gating as-is).

## The problem
`CareTeamTab` already composes the right pieces (`CareTeamCard` roster + `CareTeamMessagesPanel` staff thread, correctly gated to primary coach / admin / assigned specialist). But the two components predate the current card/chip/thread language used elsewhere (Messages, Nutrition). They read as a plain list + a flat message log. Bring them up to the mock.

## Target (approved mock)
1. **Roster card** — one header ("Care team") with an **"Add specialist"** action (primary coach / admin only). A **staff-only banner**: `🔒 Staff only — the client never sees this tab` (the RLS already enforces this; make it visible so coaches trust it).
2. **Member rows** — avatar (initials, role-tinted) + name + a **role chip** colour-coded by subrole: Primary coach = blue (`#E6F1FB`/`#0C447C`), Dietitian = teal (`#E1F5EE`/`#0F6E56`), Physio = amber (`#FAEEDA`/`#854F0B`), others map to remaining ramps. A small secondary line (specialisation / "since wk N"). Scheduled-end assignments get a muted "Ends <date>" chip. Kebab → remove / discharge (existing flows, primary-coach/admin only).
3. **Team discussion** — threaded bubbles: own messages right-aligned in `--color-background-info`, others left in `--color-background-secondary`, role-tinted avatar, timestamp, `@mention` highlighting. Composer pinned at the bottom (`Message the team…` + send). Reuse the existing `CareTeamMessagesPanel` data layer (read tracking, filters, mentions) — restyle the row rendering only.

## Build notes
- **No schema / RLS / RPC changes.** `care_team_assignments` (roster), `care_team_messages` (staff thread, client-excluded) and their gates are unchanged. This is a presentation pass.
- Role chip colours come from a small `Record<subroleSlug, {bg,fg}>` map (same approach as the enum label maps — don't `.replace()` slugs).
- Keep `CareTeamTab`'s gating (`isPrimaryCoach || isAdmin || isCareTeamMember`) and the `useAuthSession`-keyed effect exactly as they are.
- Mobile: member rows stack naturally; the thread already needs to scroll within the card — use a plain `overflow-y-auto` flex item, NOT a Radix ScrollArea inside a max-h (known no-scroll bug — see CLAUDE.md / the ScrollArea memo).
- Don't conflate with `coach_client_messages` (the coach↔client thread on the Messages tab) — this is the staff-only `care_team_messages` surface.

## Verify
- `npx tsc --noEmit` + `npm run build` clean.
- Roster shows role-coloured chips + the staff-only banner; Add/remove/discharge still gated to primary coach / admin. Thread renders own-vs-other bubbles with mentions; composer sends. Smoke with a client that has an assigned dietitian (the +complete or +hybrid test client) so the multi-member roster + chips actually populate.
- Confirm the client login can't see the tab at all (RLS + route gate).
