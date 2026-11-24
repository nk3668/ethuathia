---
id: ETH-150
title: Codex polish for rare monsters: a faster-reveal hint and a lore-tier content warning
type: feature
status: idea
priority: P3
milestone: M2
epic: codex-tooltips
size: S
depends_on: [ETH-144]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Tell the player when a monster's Codex entry reveals faster than usual, and warn content authors
when a rare monster's lore tier is set too high to reach.

## Why
ETH-144 lets a def override its kill tiers (`codexTiers`), but nothing tells the player why one entry
unlocks at 1/2/3 kills while others need 1/10/50. And a rare spawn left on the default 50-kill lore
tier keeps its lore hidden in practice. `CLAUDE.md` §1 ("Readable") and §8 (Codex).

## Acceptance criteria
- [ ] A monster with `codexTiers` shows a short note on its Codex page and tier summary (e.g. "Rare:
      reveals faster"), with a tooltip giving its thresholds.
- [ ] Content validation warns (named def, reason) when a monster's spawn weight is ≤ 3 and its
      effective lore tier is above 10. Uniques flagged `handPlaced` (ETH-143) are judged by their own tiers.
- [ ] Tests for both. `npm run check` passes.

## Notes
- Thresholds (weight ≤ 3, lore > 10) are a starting point; tune with ETH-041 and ETH-109 content.
- Found by the ETH-144 agent (out-of-scope list).

## Log
- 2026-11-24: Created from the ETH-144 review (Nate approved filing).
