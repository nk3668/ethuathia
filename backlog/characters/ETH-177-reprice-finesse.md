---
id: ETH-177
title: Reprice Finesse so classes can share one point budget
type: feature
status: done
priority: P1
milestone: M2
epic: characters
size: M
depends_on: [ETH-160]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Finesse buys too much per point. Rebalance the attribute formulas so a point of each attribute is worth about the same in a fight, then put the starter classes back on one shared budget.

## Why
Tuning the starter classes (ETH-160) showed the Outrider winning 100% of runs on the Vanguard's 37-point budget; it had to drop to 32 points and +2 per level, and the Reaver to 32. Finesse feeds accuracy and evasion (1 per point above 10 each), disarm and flee, and the damage of swords and daggers (weapon scaling, ETH-082), so it stacks three combat stats where Brawn and Grit feed one or two. The formulas were set when the Vanguard was the only class (ETH-033) and weapon scaling came later, so nothing compared attributes against each other until there were several classes. Nate (2026-11-24): do it in M2.

## Acceptance criteria
- [x] A short written comparison (in the PR) of what one point of each attribute adds in combat today, measured with the harness (`--class`, ETH-160), not just read off the formulas
- [x] `ATTRIBUTE_FORMULAS` (and the weapon-scaling rows if needed) changed so a point of Finesse, Brawn or Grit is worth about the same; Wits stays light until M4 spells (the Lorekeeper may trail)
- [x] The Outrider and Reaver go back to the shared budget (37 starting points, about +3.25 per level) or as close as the band allows; record any remaining deviation in `ETH-160`'s Notes (Outrider on 37, Reaver on 35, recorded)
- [x] The attribute tooltips and Codex text still match the formulas (they're generated from them; check)
- [x] Balance: a T2 run (100 seeds per class with Human) keeps every class but the Lorekeeper in the `docs/DIFFICULTY_PHILOSOPHY.md` §2 band; update §2 and the class notes there (200 seeds: Vanguard 14%, Outrider 22%, Reaver 29%, Stonekin 14%, Fenling 22%; the Reaver above and the Vanguard just under the 15-25% band, reported rather than tuned further)
- [x] Tests that pin derived stats (e.g. the "starting Human Vanguard" example in `src/sim/stats/attributes.ts`) updated

## Notes
- Nate (2026-11-24) isn't worried about fine balance yet; aim for "classes roughly even on one budget", not precision.
- Monster stats are not derived from attributes, so this only moves adventurers.

## Log
- 2026-11-24: Created from the ETH-160 findings; Nate asked for it in M2.
- 2026-11-24: Started. Measured one point of each attribute with the harness before changing anything (see the PR).
- 2026-11-24: Built. Formulas: Grit 1 HP a point from 0 became 4.5 from 8; damage 0.5 above 10 became 0.2 above 3; accuracy and evasion 1 above 10 became 0.3 above 5. Outrider back on 37 and +3.25; Reaver 35 and +3.25; Stonekin +1 Finesse. The fresh Vanguard moved from 21% to 14% wins (mean depth 6.1 to 6.5). Fractional gear and scaling text is rounded to two places and gear comparison ignores float dust. Tests that pin derived numbers updated. Status done.
