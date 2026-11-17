---
id: ETH-057
title: Bundles (modifiers, effects, triggers), stats with sources and timed statuses
type: feature
status: ready
priority: P0
milestone: M1
epic: combat-items
size: M
depends_on: [ETH-055]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
The shared building block from `docs/ARCHITECTURE.md` §2.2: data bundles of stat modifiers, effects and triggers, attached to actors with a source, and `getStat` that returns the value plus its contributing modifiers. Adds timed statuses (buffs/debuffs with a duration in turns).

## Why
Attributes, gear, food, abilities, elites, Omens, blessings and upgrades are all bundles. Building it once keeps them consistent and tooltip-ready.

## Acceptance criteria
- [ ] Bundle type: `modifiers` (stat, op add/mul, value), `effects` (one interpreter with a `kind` switch; start with `heal`, `damage`, `applyStatus`), `triggers` (event kind → effects). Validated as content data
- [ ] Actors get a `stats` part: base values per `StatId` plus attached bundles with `source` (content id + label). `getStat(state, actor, stat)` returns `{value, parts[]}`; existing hp/mp/speed/sight reads go through it
- [ ] Timed statuses: apply, tick down per actor turn, expire with an event; same-type refresh rule configurable per status def
- [ ] Events + log text for status applied/expired; snapshot exposes statuses per party member and the card shows them with remaining turns
- [ ] Unit tests for stacking order, sources, expiry; determinism and soak stay green

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
