# Waitlist Mode toggle — persist on flip (footgun fix)

**Status:** Build handoff (2026-07-07, Cowork). **Owner:** terminal CC. Small, frontend-only.
**Problem:** in `src/components/admin/WaitlistManager.tsx` the "Waitlist Mode" `Switch` (`onCheckedChange` at L186-188) only updates **local state** — the on-screen label flips to "Waitlist is off" but nothing persists until the separate **"Save Settings"** button (`handleSave`, L94) is clicked. An admin who flips the switch and walks away has changed nothing: the site keeps redirecting (confirmed live 2026-07-07 — DB stayed `is_enabled=true` while the UI implied off). The DB write path itself is healthy (RLS allows admin UPDATE; `handleSave` already checks `{ error }`).

## Fix — the toggle persists immediately (optimistic + rollback)
The Waitlist Mode switch is a binary, site-wide, high-stakes control; it should behave like a real on/off, not a staged edit.

- Change the `Switch` `onCheckedChange` to **persist immediately**: optimistically set local state, then `UPDATE waitlist_settings SET is_enabled = <checked>, updated_by = <user.id> WHERE id = settings.id`. **Destructure `{ error }` and, on error, revert the local toggle + destructive toast** (CLAUDE.md silent-RLS rule — a `.update()` that hits 0 rows returns no error, so also treat "no rows affected" as a failure and revert). On success, a brief toast ("Waitlist enabled" / "Waitlist disabled").
- Disable the switch while the write is in flight (a `togglingRef`/local `saving` flag) to avoid double-fire races.
- **Keep the heading/subheading** text edits behind the existing "Save Settings" button (batching copy edits there is fine) — consider relabeling that button "Save copy" so it's clearly not the thing that controls the mode.

Net: flipping the switch takes effect and persists on the spot; if it fails (perms/network) the switch snaps back with an error, so the UI never lies about the live state.

## Verify (Cowork, prod — admin)
- Flip Waitlist Mode off → the `waitlist_settings.is_enabled` row is `false` in the DB with no "Save" click; a logged-out visit reaches `/auth` instead of `/waitlist`. Flip back on → row is `true`, logged-out visit hits `/waitlist`.
- A forced failure (e.g. non-admin) reverts the switch + shows the error, and the DB is unchanged.
- Heading/subheading still save via the button.
- tsc/lint/build clean.
