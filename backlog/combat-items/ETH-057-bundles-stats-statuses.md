---
id: ETH-057
title: Bundles (modifiers, effects, triggers), stats with sources and timed statuses
type: feature
status: done
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
- [x] Bundle type: `modifiers` (stat, op add/mul, value), `effects` (one interpreter with a `kind` switch; start with `heal`, `damage`, `applyStatus`), `triggers` (event kind → effects). Validated as content data
- [x] Actors get a `stats` part: base values per `StatId` plus attached bundles with `source` (content id + label). `getStat(state, actor, stat)` returns `{value, parts[]}`; existing hp/mp/speed/sight reads go through it
- [x] Timed statuses: apply, tick down per actor turn, expire with an event; same-type refresh rule configurable per status def
- [x] Events + log text for status applied/expired; snapshot exposes statuses per party member and the card shows them with remaining turns
- [x] Unit tests for stacking order, sources, expiry; determinism and soak stay green

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-17: Started.
- 2026-11-17: Done. `src/sim/stats/` has `getStat`/`statValue` (stat providers, then bundle sources; add then mul, rounded, clamped), `attachBundle`/`detachBundles`, `applyStatus`/`removeStatus`/`tickStatuses`, `runEffect` and `fireTrigger`; the hub gained `statProviders`, `bundleSources`, `triggers` and `turnStart`/`turnEnd` on `SimDomain`. Content kinds `bundle` and `status` (Hasted, Regenerating, Poisoned, Dazzled). `ActorPart` lost `speed`, `maxHp` and `maxMp`; `STATE_VERSION` 7 (after ETH-017 and ETH-058). Party cards show status badges. API in ARCHITECTURE Contracts.
- 2026-11-17: (default) A `mul` modifier is a factor (1.5 = +50%) and all `mul` parts multiply after every `add` part is summed — alternatives: additive percentages (+50% and +50% = +100%).
- 2026-11-17: (default) Status turns count down at the end of the holder's own turns, so one applied during its own action counts that turn — alternatives: skip the tick on the turn it was applied.
- 2026-11-17: (default) `refresh` keeps the longer of the remaining and new durations (never shortens) and the stronger potency — alternatives: always reset to the new duration.
- 2026-11-17: (default) Stats are whole numbers (`Math.round`), max HP at least 1, others at least 0 — alternatives: fractional accuracy/evasion.
