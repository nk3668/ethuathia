---
id: ETH-193
title: Roles, ranges and focuses - Tank, Healer, Damage and Scout; engagement distance; target choice
type: feature
status: idea
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-162, ETH-192]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Ship three per-adventurer tactics axes (`CLAUDE.md` §5.2), and tune each class's default build from them.
- **Roles:** *Tank*, *Healer*, *Damage*, *Scout*. The *Controller* role is ETH-195.
- **Ranges:** *Front line*, *Close support*, *Back line*, *Keep away*.
- **Focuses:** *Nearest*, *Weakest*, *Strongest*, *Casters*, *Melee*, *Ranged*, *Protect allies*.

## Why
These are the core choices: what an adventurer is for, how close they fight and who they hit.

## Acceptance criteria
- [ ] **Roles** work through ability tags (ETH-192):
  - *Tank* holds the front, steps between foes and hurt allies, and stays at the front of the leash
  - *Healer* puts `heal` and `buff` on allies before attacking
  - *Damage* uses its best `damage` source
  - *Scout* ranges ahead of the party and avoids fights it can walk away from

  Each has a stated fallback when the adventurer lacks the tag.
- [ ] **Ranges** set preferred engagement distance, read by approach, hang-back and bolt actions.
- [ ] **Focuses** set target choice, read by attack, approach and rush actions. *Protect allies* targets whoever last hit an ally.
- [ ] **Class default builds** are tuned from these. The defaults may change behavior, measured with a 20-seed smoke run against tactics off.
- [ ] Trace, tooltip, Codex and log text for every option. Hand-map sim tests per option on a fixed seed. `npm run check` passes.

## Notes
- Reuse the existing actions: `act.mend_ally`, `act.bolster_ally`, `act.hang_back`, `act.surround`, `act.rush_caster`, `act.regroup`, `act.hold_position`.
- If this runs over size M, split roles from ranges and focuses.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
