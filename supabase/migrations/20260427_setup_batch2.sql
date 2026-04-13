-- Sternal Pec BB Flat Press
UPDATE exercise_library SET setup_points = ARRAY[
  'Bar height: just under arms reach at full extension — easy to lift off and re-rack',
  'Position eyes just under the racked bar to allow clearance for the arcing press path',
  'Grip: comfortably wider than shoulder width — forearms vertical or slightly angled inward',
  'Feet flat on floor — leg drive optional',
  'Back tensed for stable base — arch optional',
  'Tip — Grip width: too wide = forearms flare out, too narrow = elbows close/flex. Target: forearms straight up or slightly inward, roughly over the elbows',
  'Tip — Foot drive: toes behind knee level, push heels down while bracing to hold arch and add tension',
  'Tip — Back tension + arch: row/pull toward bar to engage back musculature, creates stable base, aids performance, and frees scapula slightly during the press'
] WHERE name LIKE 'Sternal Pec BB Flat Press%';
