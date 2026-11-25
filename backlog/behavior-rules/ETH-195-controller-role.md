---
id: ETH-195
title: Controller role and Softens targets habit, with a stun status and the first control and debuff sources
type: feature
status: idea
priority: P2
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-193, ETH-194]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
- The **Controller** role disables the biggest threat (stun, slow, blind), then moves on to the next threat once that one is locked down.
- The **Softens targets** habit applies a debuff before attacking.

The sim has no stun yet, and no adventurer ability applies a status on purpose, so this item also adds a stun status and the first `control` and `debuff` sources.

## Why
Nate asked for a role that prioritizes debuffing or disabling enemies (2026-11-25). Most real control abilities come with M4 classes; this item makes the role work now and proves the tag design (`CLAUDE.md` §5.2).

## Acceptance criteria
- [ ] A **stun** status: the target loses its turns for a short time. A brief immunity after it ends prevents stunlock. It has Codex, tooltip and log text.
- [ ] At least one `control` source and one `debuff` source an adventurer can use in M3, tagged per ETH-192. For example:
  - a thrown or consumable item (stun or blind)
  - Lorekeeper using its bolt with a slow or weaken rider
  - poison on a coated weapon

  Each source is reachable in a run (content reach check, ETH-143).
- [ ] *Controller* targets the most dangerous foe that is not already disabled. Without a `control` source, it falls back to Damage and says so.
- [ ] *Softens targets* uses a `debuff` source before attacking, at most once per target while the debuff lasts.
- [ ] Monsters can be stunned. Monster use of stun is out of scope.
- [ ] Hand-map sim tests: stun applies and expires, immunity works, the Controller switches targets, fallback. A 20-seed smoke run with a Controller in the party. `npm run check` passes.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
