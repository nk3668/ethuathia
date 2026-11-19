---
id: ETH-116
title: Dungeon encounters: placed interactive features with an interact action, choices and outcomes
type: feature
status: ready
priority: P1
milestone: M4
epic: dungeon-gen
size: M
depends_on: [ETH-058, ETH-061, ETH-072]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
A generic "thing in the dungeon you can interact with": an `encounter` content kind and feature
part, placed on floors by a floor plan hook, used through one `interact` action with an optional
choice, resolved into data outcomes, with log and Codex text. Fountains (ETH-072), today a
one-off, are rebuilt as its first encounter to prove the API.

## Why
Altars (ETH-070), gravestones (ETH-069, ETH-051), merchants (ETH-049), bounty encounters
(ETH-030), lost recruits (ETH-089), cursed wells (ETH-105) and vaults (ETH-098) are all "a
feature on a tile that the party walks to and uses, maybe choosing something". `floors/fountains.ts`
shows what each would otherwise copy: its own feature part, gen step, action, rule action,
condition, events and log text. See `CLAUDE.md` §6–§7 and the "Shared systems" list in
`docs/ARCHITECTURE.md`.

## Acceptance criteria
- [ ] Content: an `encounter` kind (`src/content/encounters.ts`, `encounter.*`): glyph and feature
      states, `placement` (depth range, chance per floor, weight, `maxPerFloor`, room tile or
      any), `uses` (a number or `unlimited`), optional `choices: { id, label, outcome }[]` (no
      choices = one implicit outcome), an `outcome` union (`effects` on the user via `runEffects`;
      `item` given or placed; `gold`; `spawn` a monster; `runModifier` via ETH-115 when present;
      `table` = weighted outcomes rolled at placement, as draughts are) and `ai` hints (which
      choice the baseline takes, how much it wants it).
- [ ] Sim (floors domain, `src/sim/floors/encounters.ts`): a feature part
      `{ kind: 'encounter', encounter, usesLeft, rolled: string[], data? }` (`data` carries
      per-placement payload such as a grave's adventurer record id). Placement is a
      `FLOOR_PLAN_HOOKS` entry `floors.encounters` drawing from its own per-floor RNG
      (`encounterRngState(seed, floorId)`), plus `RunConfig.placedEncounters?` for encounters
      the profile places (graves at a given depth).
- [ ] Action `interact { choice? }` (standing on it; see Notes) validates the choice, applies the
      outcome and emits `encounterUsed { actor, encounter, choice, outcome, floor, pos }` and
      `encounterSpent` when uses run out; `encounterSighted` from perception. Log text in
      `logText/floors.ts`, Codex marks `seen` / `used`. A `possess` player picks the choice;
      the AI picks from `ai` hints.
- [ ] AI: one rule action `act.use_encounter { kinds?, maxDetour }` and condition
      `cond.encounter_known { kinds? }`; the fountain baseline rule becomes
      `cond.hurt_no_healing → act.use_encounter { kinds: ['encounter.fountain'] }`.
- [ ] Fountains folded in: `feature.fountain` + draughts become `encounter.fountain` with a
      `table` outcome; `drink`, `drankFountain`, `gen.fountains` and `RunConfig.maxFountains`
      keep working as thin aliases (or are replaced, with the determinism script and tests
      updated). The sim compare shows no behavior change. `STATE_VERSION` + 1.
- [ ] Tests: fixed-seed hand-built map with an encounter with two choices (AI picks by hint,
      possession picks the other); uses run out; placement is deterministic and independent of
      visit order; invariant `floors.encounters` (known def, `usesLeft` ≥ 0, rolled ids known).

## Notes
Who uses it and how:
- **ETH-070 altars:** pray / sacrifice / convert are choices; outcomes add Favor or a modifier.
- **ETH-069 / 051 gravestones:** placed by the profile via `placedEncounters` with the fallen
  adventurer's record in `data`; "pay respects" is a choice with a loot and boon outcome.
- **ETH-049 merchants:** buy/sell choices built from a stock table rolled at placement.
- **ETH-030 bounty encounters:** an encounter whose outcome tracks a bounty objective (ETH-114).
- **ETH-089 recruits:** a "lost adventurer" encounter whose outcome adds a companion (ETH-123).
- **ETH-105 cursed wells:** a choice whose outcome is a run modifier with a reward bonus.
- **ETH-098 vaults:** a vault plan can place encounters as part of its layout.

Open decisions:
- (default) Fold fountains in within this item, as the proof that the API is enough —
  alternative: leave fountains as they are and only align names (less risk, but two systems).
- (default) Interacting needs the actor on the tile, as drinking does now — alternative:
  adjacent is enough (better for large features such as altars).
- (default) Choice outcomes may roll at use time from the `encounter` stream — alternative:
  everything rolls at placement (as draughts do today), so using it draws nothing.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-030, 049, 051, 069, 070, 089, 098, 105).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
