---
id: ETH-072
title: Fountains with a documented effect table and a drink action
type: feature
status: done
priority: P2
milestone: M4
epic: dungeon-gen
size: M
depends_on: [ETH-057, ETH-058]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Fountains appear on some floors. Drinking from one has a seeded effect from a small, readable table.

## Why
The Dry Wells Omen and the "drink from a fountain" bounty both assume fountains exist (`CLAUDE.md` §6). Found as a follow-up of ETH-039.

## Acceptance criteria
- [x] A fountain feature def with glyph and Codex entry; a gen step places 0–2 per floor (seeded)
- [x] `drink` action and `act.drink_fountain` rule action; effects are bundles from a weighted table in content (heal, a short buff, a mild debuff, nothing), shown in the Codex once seen
- [x] A fountain can run dry after N uses; events and log text
- [x] Baseline: drink only when hurt and no healing potion is carried
- [x] Exposes a run param the Dry Wells Omen (ETH-067) can set to remove fountains
- [x] Hand-map sim tests

## Log
- 2026-11-18: Created from the ETH-039 survey follow-ups.
- 2026-11-18: Started.
- 2026-11-18: Done. `feature.fountain` (`{`, flowing/dry states), `gen.fountains` in the floors
  domain (0–2 per Hewn Halls floor, 2–4 draughts each, rolled from the floor RNG at generation so
  drinking draws nothing), the `draught` content kind (Mending, Bright, Brackish, Still water)
  with two new statuses (Keen-eyed, Queasy), the `drink` action, `drankFountain` /
  `fountainRanDry` events with log text, Codex section "Fountain draughts", baseline rule
  `cond.hurt_no_healing { below: 50 } → act.drink_fountain`, `RunConfig.maxFountains` for Dry
  Wells, invariant `floors.fountains`. STATE_VERSION 10.
- (default) The baseline drinks below 50% HP — alternatives: a lower threshold, or only when no
  bane draughts have been seen.
- (default) Draughts are pre-rolled per fountain when the floor is built (hidden from the UI,
  which only shows flowing/dry) — alternative: roll at drink time from a per-fountain derived RNG.
- (default) The Dry Wells seam is a per-floor cap `maxFountains` (0 removes all) rather than a
  chance multiplier, so it changes nothing else on the floor — alternative: scale the gen step's
  count.
- (default) "Has a healing potion" is `carriesHealingPotion`, returning false until ETH-061
  (TODO in `src/sim/floors/fountains.ts`).
