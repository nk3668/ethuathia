---
id: ETH-118
title: Item properties: per-instance layers that feed gearBundles, value, names and stacking
type: feature
status: blocked
priority: P1
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-043, ETH-061]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
One extension point for "this particular item is different": an `ITEM_PROPERTIES` registry of
property kinds, each owning one optional field of `ItemInstance` and saying how it changes the
item's bundles, worth, display name, identification and stacking. `gearBundles`, `itemValue`,
`canStack` and a new `itemName` all go through it, so enchantment, curses, affixes, charges and
heirloom origin are each one registry entry.

## Why
Weapon scaling (ETH-082), enchantment and curses (ETH-044), affixes and artifacts (ETH-045),
rechargeable wands (ETH-096), heirlooms (ETH-069) and Ethan's sword (ETH-109) each add
per-instance data. `docs/ARCHITECTURE.md` (Items, Equipment) already plans for this: "later
features add optional fields" to `ItemInstance`, "ETH-044/045 add enchantment and affix bundles
in `gearBundles`" and "an `ITEM_VALUE_HOOKS` entry for worth". Without one registry each would
edit `gearBundles`, `canStack`, value and naming separately. See the "Shared systems" list.

## Acceptance criteria
- [ ] `ItemPropertyKind` (`src/sim/items/properties.ts`): `{ id, field (a key of ItemInstance),
      schema, bundles?(ctx, value), value?(ctx, value, base), name?(value) → { prefix?, suffix? },
      hidden?(value, known) (shown only once identified), stacks: 'never' | 'equal' }` with
      `ctx = { state, item, wearer? }`. `ITEM_PROPERTIES` is filled in a fixed order (a list in
      the items domain, `SimDomain.itemProperties` if other domains need to add one).
- [ ] `gearBundles(item)` becomes `gearBundles(state, wearer, item)`: the def's bundle, then each
      property's bundles in registry order, every one credited to the item ("Iron hatchet +2"
      with a part per property). The `items.equipped` source, `compareGear` and `upgradeSlot`
      use it, so stats, triggers and the AI comparison see properties at once.
- [ ] `ITEM_VALUE_HOOKS` gets one hook that applies each property's `value`; `itemName(state,
      item, viewer?)` builds "+2 cursed Iron hatchet of Embers" from the property names (hidden
      parts omitted until known); log text, `ItemView` and the Codex `Explain` use it.
- [ ] `canStack` compares property fields by their `stacks` rule; the instance schema validates
      each present field with its kind's schema. Invariant `items.properties` (known fields,
      valid values). No `STATE_VERSION` change while no property is defined.
- [ ] The first property kind, `origin` (`{ by?: adventurer record id, run?, note? }`, `stacks:
      'never'`, no bundles), proves the path: an item with `origin` never stacks with a plain
      one and keeps it through pickup, drop and equip.
- [ ] Tests: a test-only property with a modifier bundle changes `getStat` with the right part,
      changes `compareGear`, value and name; save/load keeps it; the sim compare shows no
      behavior change.

## Notes
Who uses it and how:
- **ETH-044:** `enchant` (bundle scaled by the number, value up), `blessing` (`blessed` /
  `cursed`; cursed refuses `unequip` in validate), `identified` (drives `hidden`).
- **ETH-045:** `affixes` (each affix a bundle, prefix/suffix name) and artifacts as fixed affixes.
- **ETH-082:** weapon scaling is a derived property (reads `GEAR_TYPE_INFO.scalesWith` and the
  wearer's attribute through `ctx.wearer`), so its damage shows in the same tooltip.
- **ETH-096:** `charges { n, max }` recharged on `floorEntered`.
- **ETH-069:** heirlooms carry `origin` with the fallen adventurer and run.
- **ETH-109:** "Ethan's Apology" is an artifact: fixed affixes plus `origin.note` flavor text.

Open decisions:
- (default) Each property owns a top-level optional field of `ItemInstance` (`enchant`,
  `affixes`, …), as the architecture doc already suggests — alternative: one `props` record
  keyed by property id (one field, but nested saves and comparisons).
- (default) `gearBundles` takes the wearer so scaling can be a property — alternative: keep
  scaling as a separate `StatProvider` in ETH-082 and leave `gearBundles` wearer-free.
- (default) Name order is enchant, blessing, prefixes, base name, suffixes — alternative: let
  each property give a sort weight.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-044, 045, 069, 082, 096, 109).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
