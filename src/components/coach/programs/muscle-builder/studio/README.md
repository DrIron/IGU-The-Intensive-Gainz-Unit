# Planning Board — Studio edition

Drop-in redesigned components for the muscle-first program builder. The
existing `MuscleBuilderPage` / `WeeklyCalendar` / `DayColumn` / `MuscleSlotCard`
remain for now; these live alongside and can be adopted incrementally.

## Aesthetic direction — "Studio console"

A coach's workbench, not a dashboard. Precise, dark, high-contrast, typographic.
Think: mission-control, mixing desk, atelier — not generic SaaS.

**Core moves:**

- **Typography does the work.** Bebas Neue for the one number that matters on
  each slot (sets). JetBrains Mono for data (tempo, rep range, counts).
  DM Sans for everything else. No decorative icons where a number tells the
  story.
- **Muscle color is a vertical rail, not a dot.** Each slot has a 3px colored
  stripe on its left edge. At a glance the week becomes a legible color-coded
  pattern of training emphasis.
- **Hairlines, not rounded boxes.** Slots are flat rectangles separated by
  1px dividers. Rounded cards get scrapped. The grid reads as one surface.
- **Status becomes typography, not icons.** Missing intensity, per-set
  custom, replacements — each expressed as a tiny text/decoration change
  instead of a sixth competing icon.
- **Volume ribbon promoted to the top of each day column.** Coach sees the
  day's total set count + muscle distribution spectrum while planning,
  not scrolled-past below the grid.
- **Rest days are visually distinct.** Cross-hatch pattern + sideways
  "REST" typographic label in Bebas Neue 40px. Instantly recognizable.
- **Save status is ambient, not modal.** A small status dot + text in the
  header that updates in-place. Disabled Save buttons are gone.

## Pain-point map

| # | Pain | Solved by |
|---|------|-----------|
| 1 | 160px columns truncate names | Studio slot takes single line: name left, sets right. Short labels via `getShortMuscleLabel`. |
| 2 | 280px right palette compresses calendar | Palette becomes a command-picker; no permanent sidebar. (Wire a `cmdk` or `Dialog`-based picker when ready — not in this skill output.) |
| 3 | 6 competing icons | Collapsed to: left color rail + optional `✓` chip for exercise + amber dot for missing-intensity + dashed underline for per-set custom. That's it. |
| 4 | @hello-pangea/dnd lag | Not fixable without swapping libraries. Minor mitigation: set `contain: layout` on each slot to limit reflow scope. |
| 5 | Volume analytics below the fold | `StudioDayColumn` bakes a per-day volume ribbon into the column header. Secondary analytics still live below but are no longer required for basic planning feedback. |
| 6 | Rest days indistinct | `StudioRestDay` component with cross-hatch + rotated Bebas Neue label. |
| 7 | Dirty Save button feels dead | `StudioSaveStatus` renders ambient status (`● Saved 3s ago` / `● Saving…` / `● Retry`). |

## Components in this folder

- `StudioSlotCard.tsx` — replaces `MuscleSlotCard` render.
- `StudioDayColumn.tsx` — replaces `DayColumn`, adds volume ribbon.
- `StudioRestDay.tsx` — rest day block.
- `StudioSaveStatus.tsx` — header status strip.
- `StudioAnalyticsRail.tsx` — 48px collapsed / 320px expanded right-edge panel
  for volume + frequency + progression. One icon to toggle.
