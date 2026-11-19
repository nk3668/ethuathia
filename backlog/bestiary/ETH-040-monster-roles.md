---
id: ETH-040
title: Monster roles and role behaviors
type: feature
status: done
priority: P1
milestone: M1
epic: bestiary
size: M
depends_on: [ETH-060]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Monsters have a role (brute, skirmisher, caster, support, swarm) that sets how they fight.

## Why
Readable, varied fights from a few rules. See `CLAUDE.md` §1 (Readable).

## Acceptance criteria
- [x] Monster defs carry a role, shown in the Codex and inspect tooltip
- [x] Each role has a distinct behavior (brutes close in, skirmishers hit and back off, casters keep range, support buffs or heals, swarms surround)
- [x] Sim tests with hand-built maps cover each role

## Notes
- The role picks the rule set (`ROLE_RULES`); a def may still list its own `rules`. Powers are def
  fields: `bolt` (casters), `mend` and `bolster` (supports). See docs/ARCHITECTURE.md, Contracts,
  "Combat".
- Roles: Gloam rat and Slate hound skirmishers, Mossling and Ashmite swarm swarms, Mire toad a
  caster (spits bog-slime, range 4), Bone gnawer and Cavern brute brutes, and a new support, the
  Moss tender (mends 2 HP, hands out the new Emboldened status: +1 accuracy, +1 damage).
- No balance tuning (ETH-080 does the monster balance pass at the end of M1).

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Started.
- 2026-11-18: (default) Adventurers' baseline now rushes a caster that has them in bolt range
  (`cond.in_bolt_range` → `act.rush_caster`, right after attacking an adjacent enemy); without it
  the party stood under fire. Alternatives: no baseline answer (leave it to player rules, M3), or
  a broader "approach any enemy in sight" rule.
- 2026-11-18: (default) Bolts need only sight, not a clear line: creatures in between don't block
  them. Alternative: blocked by any creature in the way.
- 2026-11-18: Done. Role field on every def (Codex "Role" key field, also in the map inspect card;
  the Codex groups monsters by role), role conditions and rule actions in
  `src/sim/combat/roles.ts`, `bolt` and `aid` actions, `aided` event and log text, sim tests in
  `test/sim/roles.test.ts`.
