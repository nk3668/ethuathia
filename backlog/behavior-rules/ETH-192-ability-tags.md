---
id: ETH-192
title: Ability tags - abilities, consumables and wands declare what they do, and the AI picks the best of a tag
type: feature
status: ready
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: []
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Every adventurer ability, usable consumable and wand declares **tags**, such as `heal`, `buff`, `damage`, `debuff`, `control`, `ranged`, `area` and `escape`. A shared resolver answers "the best `heal` this adventurer can use on this target right now". Tactics (ETH-162) use it, so options never name a specific class, spell or item.

## Why
New classes have to work with every tactic without AI changes (Nate, 2026-11-25). A new class only declares its abilities' tags. See `CLAUDE.md` §5.2.

## Acceptance criteria
- [ ] A closed tag vocabulary in content. The tag list on each ability and item def is validated at load.
- [ ] Every existing adventurer-usable source is tagged. For example:
  - mend: `heal`
  - bolster: `buff`
  - the bolt: `damage` + `ranged`
  - healing potions: `heal`
  - escape items: `escape`
  - and so on
- [ ] `bestByTag(ctx, tag, target?)` in `src/sim/ai/` returns the best usable source with a reason, or `null`. Existing rule actions (`act.mend_ally`, `act.quaff_healing`, `act.cast_bolt`, ...) use it where that changes nothing.
- [ ] **No behavior change:** T0 identity (0 hash diffs).
- [ ] The Codex and tooltips show an ability's or item's tags in plain words. Hidden items reveal tags only once identified, with a guard per `docs/ARCHITECTURE.md` §11.6.
- [ ] Unit tests for the resolver on hand-built states. `npm run check` passes.

## Notes
- ETH-037 (signature abilities, M4) must tag every new ability.
- Control and debuff sources don't exist yet; ETH-195 adds the first ones.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
