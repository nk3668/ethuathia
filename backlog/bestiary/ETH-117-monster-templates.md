---
id: ETH-117
title: Monster templates: prefixes, traits and named overrides layered on a base MonsterDef
type: feature
status: done
priority: P1
milestone: M2
epic: bestiary
size: M
depends_on: [ETH-040, ETH-060, ETH-065]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
A way to make "a stronger or named version of a monster" without a new `MonsterDef`: a
`MonsterOverlay` (plain data: name, title, prefix, stat changes, bundles, role or power changes,
threat and loot tier) stacked on a base def when the monster spawns. Content templates
(`template.*`, e.g. *Venomous*, *Swift*) are named overlays; profile-made monsters (nemeses,
heirloom carriers) pass an overlay directly.

## Why
Named uniques (ETH-041), elites and mini-bosses (ETH-052), Ethan (ETH-109), the nemesis
(ETH-101), the heirloom-carrying killer (ETH-099) and monster families (ETH-042) all need "this
base monster, but more". `spawnMonster(state, defId, floor, pos)` takes only a def id and
`MonsterDef` has no hook for changes. Without a shared layer each feature would copy defs or
special-case combat. See `CLAUDE.md` §6 (Elites) and the "Shared systems" list.

## Acceptance criteria
- [x] Content: a `template` kind (`src/content/monsterTemplates.ts`, `template.*`): `{ prefix?,
      suffix?, stats?: { add?, mul? }, bundle?, role?, powers? (bolt / mend / bolster),
      threatMul, lootTier, glyphTint?, families? }`, validated (stat ids, bundle refs, role).
- [x] `MonsterOverlay` (sim, plain data): `{ templates?: string[], name?, title?, stats?, bundles?,
      threatMul?, lootTier?, carries?: ItemInstance[] }`. `spawnMonster` takes an optional
      overlay; the `monster` part stores it (`monster.overlay`). `monsterRules` and role powers
      read the overlay's role / powers over the def's.
- [x] Stats: a `StatProvider` `combat.overlay` adds the overlay's stat changes after
      `stats.base`, and a `BundleSource` `combat.templates` visits template and overlay bundles,
      each credited to the template ("Venomous") so tooltips explain it. `threat` for rewards and
      XP is `monsterThreat(entity)` (def × overlay), used by `killed` and `grantKillXp`.
- [x] Naming and text: `monsterName(entity)` ("Venomous cave rat", "Vell the Unbowed") is used
      by `ActorView.name`, log text and death causes; the Codex shows templates as their own
      entries (`seen` when a templated monster is sighted) and the monster entry lists which
      were met.
- [x] Generation: `gen.monsters` gains an optional `templateChance` and picks templates by weight
      from the dungeon stream only when it is set, so existing floors are unchanged (sim
      compare: no behavior change). Invariant `combat.overlay` (known templates, finite stats).
      `STATE_VERSION` + 1.
- [x] Tests: a templated monster's stats, tooltip parts, name and threat; a profile-style overlay
      with a name and carried item; save/load round-trip.

## Notes
Who uses it and how:
- **ETH-041 uniques:** a unique is a base def plus a fixed overlay (name, title, stats) in content.
- **ETH-052 elites / mini-bosses:** 1–2 templates rolled at spawn; `lootTier` feeds the better loot table.
- **ETH-109 Ethan:** a unique overlay with tiny HP and a guaranteed `carries` artifact.
- **ETH-101 nemesis / ETH-099 heirloom carrier:** the profile stores an overlay (name, title,
  grudge stats, the heirloom in `carries`) and the run spawns it through `spawnMonster`.
- **ETH-042 families:** templates list `families` they fit, so a floor theme can favor them.

Open decisions:
- (default) Overlay stat changes go through a `StatProvider` (adds/muls on base) and traits
  through bundles — alternative: everything as bundles (simpler, but base stat edits then show
  as modifiers in tooltips).
- (default) At most 2 templates per monster, prefixes only in the name ("Swift venomous rat") —
  alternative: a prefix and a suffix ("Venomous rat of the Deep").
- (default) Uniques are overlays in content, not separate `MonsterDef`s — alternative: full
  defs with a `unique: true` flag (simpler Codex, but no shared code with elites).

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-041, 042, 052, 099, 101, 109).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
- 2026-11-19: Started (in-progress).
- 2026-11-19: (default) A template has `weight` (generation picks by it) and `families` matches monster tags until ETH-042 adds real families — alternative: a separate family registry now.
- 2026-11-19: (default) `carries` drop on the monster's tile when it dies (`died.drops`) — alternative: keep them in an inventory part the party must loot.
- 2026-11-19: (default) Shipped four templates (Venomous, Swift, Hulking, Hexspitting); no floor type sets `templateChance` yet, so play is unchanged until ETH-052 — alternative: a small chance on the Hewn Halls now.
- 2026-11-19: Done. `MonsterOverlay` on `monster.overlay`, `combat.overlay` provider, `combat.templates` source, `monsterName` / `monsterThreat` / `monsterLootTier`, Codex section, map tint, `templateChance`, invariant `combat.overlay`, STATE_VERSION 25. Sim compare: no behavior change.
