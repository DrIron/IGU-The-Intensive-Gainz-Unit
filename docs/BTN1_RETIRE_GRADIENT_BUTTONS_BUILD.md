# BTN1 — Retire the gradient button variants app-wide (flatten CTAs)

**Status:** Build handoff (2026-07-04, Cowork). **Owner:** terminal. Cowork verifies on prod.
**Decision (Hasan, 2026-07-04):** the `gradient` (and `hero`) button variants are the last non-flat primitive in the app's core language. Retire them globally → the flat `default` (solid primary) variant. App-wide (not public-only), so it's its own slice, running in parallel with `docs/PUB8_PUBLIC_PAGES_ALIGNMENT_BUILD.md`. Purely visual; no behavior change.

## Why
`src/components/ui/button.tsx` defines two gradient variants:
```
hero:     bg-gradient-to-r from-primary to-accent … font-bold shadow-lg hover:shadow-xl …
gradient: bg-gradient-to-r from-primary to-accent … transition-opacity
```
Both violate the flat language (gradient fill; `hero` also carries `font-bold` 700 + shadow). `default` is the flat target: `bg-primary text-primary-foreground hover:bg-primary/90 active:bg-primary/80`.

Usage (grep 2026-07-04): `variant="gradient"` = 28 usages across **20 files**; `variant="hero"` = 1 (`src/pages/Index.tsx`). Files (gradient): CoachManagement, CoachProfile, CoachServiceLimits, calculator/AdjustmentCalculator, calculator/CalorieCalculatorForm, PaymentButton, ServiceCard, client-overview/addons/LogAddonSessionDialog, client/AddonCheckoutSheet, client/PaymentAttentionBanner, client/GracePeriodBanner, client/WelcomeModal, client/ClientDashboardLayout, pages/Auth, pages/Waitlist, pages/PaymentReturn, pages/ResetPassword, pages/EmailConfirmed, pages/BillingPayment, pages/client/AddonsCatalog.

## Changes
1. Replace every `variant="gradient"` and `variant="hero"` → `variant="default"` across all listed files. **Preserve each call's `size` and other props** — only the variant changes. (The `hero` usage in Index likely pairs with a large `size`; keep that size.)
2. Remove the `hero` and `gradient` entries from the `variant` map in `src/components/ui/button.tsx` (lines 18–19). Leave `default/destructive/outline/secondary/ghost/link` untouched.
3. `hero` carried `font-bold` — after the swap, CTAs inherit the base `font-medium`; that's intended (weight cap). No separate weight edit needed.

## Verify (Cowork, prod after merge)
- `grep -rnE 'variant="(hero|gradient)"' src/` → **0**. `grep -n 'hero:|gradient:' src/components/ui/button.tsx` → 0.
- tsc/build clean (the removed variants are gone from the CVA union — confirm no stray typed reference).
- Visual smoke a representative CTA per surface-type on prod: Auth sign-in, a PaymentButton / BillingPayment checkout CTA (confirm it still renders + click works — payment path), Index hero CTA, Waitlist submit, an addon checkout, a coach-management action. Each is now solid primary, flat, functional.
- No console errors; button sizes/spacing unchanged (only fill changed).

## Notes / coordination
- Overlaps PUB8 on `ServiceCard.tsx:66` and `Waitlist.tsx:172` (both gradient buttons). Whichever merges second just confirms the swap already happened; no conflict — PUB8 explicitly defers buttons to BTN1.
- Payment CTAs (`PaymentButton`, `BillingPayment`, `AddonCheckoutSheet`, `AddonsCatalog`) are in the list — the change is cosmetic (variant only), but smoke the checkout render since these are revenue-path.
- After BTN1 + PUB8 both land, `grep -rn 'bg-gradient' src/` should be ~empty (any remaining are non-button and would be a separate finding).
