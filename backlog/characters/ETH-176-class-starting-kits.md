---
id: ETH-176
title: Classes start each run with a kit of gear
type: feature
status: idea
priority: P1
milestone: M2
epic: characters
size: S
depends_on: [ETH-033, ETH-082]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
A class can name a starting kit: items each adventurer of that class carries, equipped, from the first turn of every run. The Vanguard gets one weapon.

## Why
Today every adventurer starts empty-handed, so a class can only differ in its attributes. A Wits class needs a staff to use its Wits in a fight, a Finesse class a blade (weapon scaling, ETH-082). The starter classes (ETH-160) need kits, and the Smithy's starting gear (ETH-159) builds on the same field. See `CLAUDE.md` §3 ("the Smithy's starting kits are the gear progression").

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate)
- [ ] `ClassDef.kit?: readonly string[]`: item def ids, validated at content load (they must exist and be gear)
- [ ] `createRun` gives each adventurer their class kit, identified and equipped in its slot, before the first turn. Kit items are ordinary items: they can be dropped or swapped for upgrades, and they count as carried items at the run's end like any other.
- [ ] The Vanguard's kit is one oak cudgel (`item.oak_cudgel`, a mace, Brawn scaling)
- [ ] The class tooltip, the Prepare screen's class preview and the class's Codex entry list the kit
- [ ] A log line at run start says what each adventurer carries ("Mira shoulders an oak cudgel.")
- [ ] **T2 gate** (`docs/DIFFICULTY_PHILOSOPHY.md` §9): a starting weapon changes every run, so run 100 seeds against `main` and put the table in the PR. If the win rate leaves the §2 band, raise it with Nate before tuning anything else.
- [ ] Tests: a run starts with the kit equipped and identified; a class without a kit starts empty-handed; an unknown or non-gear kit id fails validation

## Notes
- Split from ETH-160 (2026-11-24) so the plumbing and its balance check land on their own before new classes arrive.
- The Smithy (ETH-159) adds to the kit later (better kits, a starting enchantment); this item doesn't decide how.
- Conducts like "never changed gear" (M6) will need to treat the kit as the starting gear.

Open decisions:
- (default) Every class's kit is one weapon, the weakest common one of its type. Alternative: a weapon plus a piece of armor (bigger balance shift).
- (default) Kit items are identified from the start. Alternative: unidentified like found gear (odd for your own equipment).

## Log
- 2026-11-24: Created, split from ETH-160 (starter classes need starting gear). (spec gate) awaiting Nate's review.
