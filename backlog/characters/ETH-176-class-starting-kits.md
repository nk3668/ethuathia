---
id: ETH-176
title: Classes start each run with a kit of gear
type: feature
status: ready
priority: P1
milestone: M2
epic: characters
size: S
depends_on: [ETH-033, ETH-082]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
A class can name a starting kit: items each adventurer of that class carries, equipped, from the first turn of every run. The Vanguard gets a weapon and a shield.

## Why
Today every adventurer starts empty-handed, so a class can only differ in its attributes. A Wits class needs a staff to use its Wits in a fight, a Finesse class a blade (weapon scaling, ETH-082). The starter classes (ETH-160) need kits, and the Smithy's starting gear (ETH-159) builds on the same field. See `CLAUDE.md` §3 ("the Smithy's starting kits are the gear progression").

## Acceptance criteria
- [x] Spec reviewed by Nate before building (spec gate)
- [ ] `ClassDef.kit?: readonly string[]`: item def ids, validated at content load (they must exist, be gear, and not share a slot)
- [ ] `createRun` gives each adventurer their class kit, identified and equipped in its slot, before the first turn. Kit items are ordinary items in play: they can be dropped or swapped for upgrades.
- [ ] Kit items are marked as kit and are **not** sold for Trophies when carried out of the dungeon (ETH-171), so a run never pays for its own starting gear. Their tooltip says so.
- [ ] The Vanguard's kit is an oak cudgel (`item.oak_cudgel`, a mace, Brawn scaling) and a round shield (`item.round_shield`)
- [ ] The class tooltip, the Prepare screen's class preview and the class's Codex entry list the kit
- [ ] A log line at run start says what each adventurer carries ("Mira shoulders an oak cudgel and a round shield.")
- [ ] **T2 gate** (`docs/DIFFICULTY_PHILOSOPHY.md` §9): starting gear changes every run, so run 100 seeds against `main` and put the table in the PR. If the win rate leaves the §2 band, raise it with Nate before tuning anything else.
- [ ] Tests: a run starts with the kit equipped and identified; a class without a kit starts empty-handed; an unknown, non-gear or slot-clashing kit fails validation; kit items carried out add no Trophies

## Notes
- Split from ETH-160 (2026-11-24) so the plumbing and its balance check land on their own before new classes arrive.
- The Smithy (ETH-159) adds to the kit later (better kits, a starting enchantment); this item doesn't decide how.
- Conducts like "never changed gear" (M6) will need to treat the kit as the starting gear.
- If ETH-171 lands first, this item adds the kit exclusion to its sale; if this lands first, ETH-171 must honor the kit mark.

Decisions:
- **Decided (Nate, 2026-11-24):** each class's kit is one weapon and one piece of armor, both cheap common items. The new classes' kits are in ETH-160.
- (default) Kit items are identified from the start. Alternative: unidentified like found gear (odd for your own equipment).

## Log
- 2026-11-24: Created, split from ETH-160 (starter classes need starting gear). (spec gate) awaiting Nate's review.
- 2026-11-24: Spec approved by Nate with a piece of armor added to each kit (Vanguard: round shield). Added: kit items don't sell for Trophies. Status ready.
