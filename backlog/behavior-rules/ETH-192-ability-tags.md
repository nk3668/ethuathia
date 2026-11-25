---
id: ETH-192
title: Ability tags - abilities, consumables and wands declare what they do, and the AI picks the best of a tag
type: feature
status: pending-review
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
- [x] A closed tag vocabulary in content. The tag list on each ability and item def is validated at load.
- [x] Every existing adventurer-usable source is tagged. For example:
  - mend: `heal`
  - bolster: `buff`
  - the bolt: `damage` + `ranged`
  - healing potions: `heal`
  - escape items: `escape`
  - and so on
- [x] `bestByTag(ctx, tag, target?)` in `src/sim/ai/` returns the best usable source with a reason, or `null`. Existing rule actions (`act.mend_ally`, `act.quaff_healing`, `act.cast_bolt`, ...) use it where that changes nothing.
- [x] **No behavior change:** T0 identity (0 hash diffs).
- [x] The Codex and tooltips show an ability's or item's tags in plain words. Hidden items reveal tags only once identified, with a guard per `docs/ARCHITECTURE.md` §11.6.
- [x] Unit tests for the resolver on hand-built states. `npm run check` passes.

## Notes
- ETH-037 (signature abilities, M4) must tag every new ability.
- Control and debuff sources don't exist yet; ETH-195 adds the first ones.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
- 2026-11-25: Implemented on branch `eth-192-ability-tags`. `src/content/abilityTags.ts` holds the closed vocabulary (the eight named tags plus `utility` for identify and uncurse); `ItemDef.abilityTags` is validated by the item schema and required on exactly the usable items. Tags: mending draught, scroll of renewal, trail biscuit and field ration `heal`; quickstep tonic `buff`; scrolls of identify and uncursing `utility`. No class abilities or wands exist yet, so items are the only sources; `ETH-037` and `ETH-195` must tag theirs. `bestByTag` is in `src/sim/ai/abilities.ts`; `bestHealing` (the baseline quaff) is built on it, the other rule actions (identify, uncurse, eat ration) pick by effect and were left alone because they do not choose among sources. Unidentified-type items are never sources. Codex gains a "Works as" field. T0 vs origin/main, 20 seeds: all state hashes equal, 0 diffs. Decision: `target` other than the actor returns `null` (items only act on their user).
