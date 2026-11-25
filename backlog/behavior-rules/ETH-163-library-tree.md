---
id: ETH-163
title: Library tree unlocks tactics and habit slots
type: feature
status: idea
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-162, ETH-086, ETH-197]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
The Library building's Tactics tree, spent in Renown. It unlocks tactic options (stances, formations, roles, ranges, focuses, habits) and more habit slots per adventurer.

## Why
The player starts with a small set of tactics, and the Library grows it (`CLAUDE.md` §4, §5.2).

## Acceptance criteria
- [ ] A **starter set** is free from the first run. A starting proposal, checked with Nate in the spec:
  - Steady stance and Stick together formation
  - Tank, Healer and Damage roles
  - Front line and Back line ranges
  - Nearest and Weakest focuses
  - a few habits

  Every class default build uses only starter options.
- [ ] Everything else is unlocked by Library nodes (`unlock` grants of `tactic.*` ids). Habit-slot ranks raise `capacity(profile, 'habitSlots', 1)` (ETH-194).
- [ ] The tactics panel shows locked options with a padlock and the node that unlocks them (ETH-196).
- [ ] The Library is a Tactics tree and can be redone for free between runs (ETH-086).
- [ ] The tree follows the town-tree layout Nate reviewed (artifact "Ethuathia town trees", v4), adapted from rule vocabulary to tactics:
  - the fourth party berth
  - Warding Lore I–III
  - the Teeming Dark Omen node
  - a placeholder for a future Library class
- [ ] Codex and tooltip text for every node. `npm run check` passes.

## Notes
- Habit slots go to about 3 in total, counting the Guild Hall's Rule Clerk, which becomes a habit-slot node in ETH-194. Nate (2026-11-25): "we'll have to experiment with them", so the capstone (ETH-165) measures 1, 2 and 3 slots.

## Log
- 2026-11-24: Created in the backlog reorganization by theme.
- 2026-11-25: Rewritten for the tactics design: unlocks tactic options and habit slots instead of rule conditions, actions and slots. Depends on the Library's building quest (ETH-197).
