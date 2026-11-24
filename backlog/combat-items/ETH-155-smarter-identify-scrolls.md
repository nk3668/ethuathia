---
id: ETH-155
title: Smarter Scroll of Identify use: better targets, optionally skip consumables
type: feature
status: idea
priority: P2
milestone: M2
epic: combat-items
size: S
depends_on: [ETH-147]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Since ETH-147, known-type potions and scrolls stay unidentified until their blessing is known. So
the baseline reads Scrolls of Identify more often. It can also spend one on another stack of
Identify scrolls, or even on its own remaining stack. This item makes it pick targets in a sensible
order, and lets a rule or doctrine skip consumables when identifying.

## Why
The ETH-147 agent found this. A competent idle player wouldn't waste an Identify scroll on a stack
of Identify scrolls, or on a plain potion while unknown gear waits (`CLAUDE.md` §1 "Idle decisions
matter", §5.3).

## Acceptance criteria
- [ ] **Target order for the baseline:**
  1. unidentified gear the adventurer wears or could wear, weighted by `hiddenGearMargin` (ETH-142);
  2. consumables whose type is unknown;
  3. consumables whose type is known.

  It never targets another Identify stack, or its own, while any other target exists.
- [ ] A rule parameter or doctrine option ("identify: gear only") skips consumables. It has Library
      text, a Codex entry and a tooltip.
- [ ] The trace says which item was chosen and why, e.g. "identifying the unknown boots: they may be
      worth wearing".
- [ ] Sim tests on a fixed seed with a hand-built inventory cover the target order and the skip
      option.
- [ ] A T1 compare (50 seeds) for party 1 and party 4. `npm run check` passes.

## Notes
- Filed from ETH-147's out-of-scope ideas 3 and 4 (Nate approved, 2026-11-24).

## Log
- 2026-11-24: Created (Nate approved filing).
