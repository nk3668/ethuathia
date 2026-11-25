---
id: ETH-038
title: Class fit for tactics - class-only options and bonuses for a good fit
type: feature
status: idea
priority: P2
milestone: M4
epic: characters
size: M
depends_on: [ETH-037, ETH-162, ETH-193]
created: 2026-11-17
updated: 2026-11-25
---

## Summary
M3 gives every class a default tactics build, and lets any adventurer take any role, range, focus or habit (`CLAUDE.md` §5.2). This item makes class matter in those choices:
- options can be class-only (`requires`)
- options that fit the class give a bonus (`favors`)
- default builds are retuned around the M4 signature abilities

## Why
Without this the AI wastes class depth. See `CLAUDE.md` §5.2 and §5.3.

## Acceptance criteria
- [ ] The `requires` and `favors` fields on tactic defs (validated since ETH-162) take effect. The tactics panel shows why an option is unavailable or favored.
- [ ] At least one class-only option per M4 class, e.g. a signature-ability role.
- [ ] Class default builds are retuned with the signature abilities (ETH-037).
- [ ] The trace names the option and the class fit behind a decision.
- [ ] Sim tests with hand-built maps cover each class-only option.

## Notes
- Talent nodes can unlock tactic options too (ETH-088).

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-24: Moved from M3 to M4 in the backlog reorganization by theme.
- 2026-11-25: Rewritten for the tactics design (Nate, 2026-11-25). Roles themselves ship in M3 (ETH-193); M4 adds class fit, and off-class picks stay allowed.
