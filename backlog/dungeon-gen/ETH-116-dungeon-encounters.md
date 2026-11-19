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

## Implementation instructions

To ensure encounters support altars (ETH-070), gravestones (ETH-069/051), merchants (ETH-049), bounties (ETH-030), recruits (ETH-089), cursed wells (ETH-105), vaults (ETH-098) and fountain harmful-draught avoidance (ETH-094) without breaking existing fountain determinism:

1. **Content model & validation (`src/content/encounters.ts`):**
   - Define `ENCOUNTERS = new Registry<EncounterDef>('encounter')` and `ENCOUNTER_KIND` in `CONTENT_KINDS`.
   - Shape:
     - `glyph: Glyph` and `states?: Readonly<Record<'ready' | 'spent' | string, Glyph>>` (extend `findGlyph` in `src/content/registries.ts` so `encounter.<id>.<state>` resolves just like `feature.<id>.<state>`).
     - `verb?: { present: string; past: string; gerund: string }` (e.g. `{ present: 'drink from', past: 'drank from', gerund: 'drinking from' }` for fountains; defaults to `'use' / 'used' / 'using'`) so log text and AI trace lines read naturally per encounter.
     - `uses: number | 'unlimited'` (or `{ min: number; max: number } | number | 'unlimited'` so fountains roll `2..4` uses at placement).
     - `placement?: { depth?: { min: number; max: number }; chance?: number; count?: { min: number; max: number }; weight?: number; maxPerFloor?: number; where?: 'room' | 'any'; distinctRooms?: boolean }`.
     - `choices?: readonly EncounterChoiceDef[]` where `EncounterChoiceDef = { id: string; label: string; description?: string; requires?: Requirement; cost?: { gold?: number; hp?: number }; outcome: EncounterOutcome; aiWeight?: number }` (when `choices` is omitted or empty, use a single `outcome: EncounterOutcome` on the def with implicit choice id `'default'`).
     - `EncounterOutcome` discriminated union:
       - `{ kind: 'effects'; effects: readonly Effect[]; source?: string }` (runs via `runEffects`)
       - `{ kind: 'draught' }` or `{ kind: 'table'; entries: readonly { id: string; weight: number; tag?: 'boon' | 'bane' | 'plain'; outcome: EncounterOutcome }[]; rollAt?: 'placement' | 'use' }` (for `encounter.fountain`, referencing `DRAUGHTS` or table entries rolled at placement into `feature.rolled`)
       - `{ kind: 'item'; item: string; qty?: number; to?: 'pack' | 'floor' }` (`addToInventory` if space/actor, else `placeItem` + `rememberTile`)
       - `{ kind: 'gold'; amount: number }` (adds to `state.domains.items.gold`)
       - `{ kind: 'spawn'; monster: string; count?: number; overlay?: MonsterOverlay }` (via `spawnMonster` on `arrivalTile` near `pos`, or companion via ETH-123 later)
       - `{ kind: 'runModifier'; modifier: RunModifierConfig }` (calls `addRunModifier`, ETH-115)
       - `{ kind: 'all'; outcomes: readonly EncounterOutcome[] }` (composite outcome so an altar or grave can grant loot + a boon + Favor in one choice).
     - `ai?: { defaultChoice?: string; desire?: number; condition?: Requirement }` so baseline AI and `act.use_encounter` know which choice to pick and whether a choice is desirable.
   - Add `refs` to `ENCOUNTER_KIND` checking every nested bundle/effect (`bundleRefs`), item id (`ITEMS`), monster id (`MONSTERS`), draught id (`DRAUGHTS`), run modifier bundle (`hasBundle`), and requirement (`requirementRefs` with `'actor'` scope).
2. **Feature part, fountain compatibility & zero-delta sim compare:**
   - In `src/sim/state.ts`, add `{ kind: 'encounter'; encounter: string; usesLeft: number | null; used: number; rolled: string[]; data?: Record<string, unknown> }` to `FeaturePart` (`usesLeft: null` means `'unlimited'`; `used` counts uses so far and keys use-time rolls, below).
   - Keep `gen.fountains` in `FLOOR_HALLS.steps` drawing the exact same sequence from the floor RNG (`rng.int(p.min, p.max)`, `rng.shuffle([...draft.rooms])`, `rng.pick(tiles)`, `rng.int(p.minDraughts, p.maxDraughts)`, `rollDraught(rng)`) and emitting `encounter.fountain` features. Replace `{ kind: 'fountain', draughts }` outright; don't keep it as a second feature shape, because two shapes for one thing is what this item removes. That way **all 50 seeds in `npm run sim -- --seeds 50 --compare origin/main` produce 0 gameplay delta**.
   - For other encounters, register `FLOOR_PLAN_HOOKS` entry `floors.encounters`:
     - First place any matching `state.config.placedEncounters` for that floor's depth (`PlacedEncounterConfig = { encounter: string; depth: number; pos?: Pos; uses?: number; rolled?: string[]; data?: Record<string, unknown> }`), picking a free room/floor tile via `encounterRngState(state.seed, floorId)` when `pos` is omitted.
     - Then roll any content `ENCOUNTERS` with `placement` (excluding `encounter.fountain` while `gen.fountains` places it) from `encounterRngState(state.seed, floorId)`—only drawing from the RNG when at least one eligible encounter exists at that depth.
     - Apply `RunConfig.maxFountains` to `encounter.fountain` features just as `capFountains` does today.
3. **Perception, action, possession & UI integration:**
   - **Sighting:** in `floors` `turnStart` / `turnEnd` (or `perceive`), track sighted encounter entity ids in `state.domains.floors.sightedEncounters: EntityId[]` (plain array for save serialization) and emit `encounterSighted { actor, feature, encounter, floor, pos }` once when a party member first sees an encounter tile.
   - **Action `interact { choice?: string }`:**
     - Must stand on the encounter tile (`usesLeft === null || usesLeft > 0`).
     - If the encounter has `choices`: when `choice` is omitted (e.g. `KeyF` while possessed or AI default), resolve the default choice (`ai?.defaultChoice` or the first choice whose `requires` and `cost` hold). Validate `choice` exists, its `requires` holds (`checkRequirement`), and `cost` (e.g. `gold <= state.domains.items.gold`) is met.
     - Roll use-time table outcomes from `encounterUseRng(state, floorId, pos, used)` = `Rng.seeded(state.seed, 'encounter-use/' + floorId + '/' + pos.x + ',' + pos.y + '/' + used)`. Key it by place and use count, not by entity id or turn, so the roll doesn't change when entity allocation or timing shifts. Use-time rolls never touch the `dungeon`, `combat`, `loot` or `ai` streams.
     - Decrement `usesLeft` (when numeric), increment `used`, apply outcome(s), emit `encounterUsed { actor, feature, encounter, choice, outcomeId?, left: usesLeft, floor, pos }`, and when `usesLeft === 0` emit `encounterSpent { feature, encounter, floor, pos }`.
     - Keep `drink` in `FLOORS_ACTIONS` as a thin alias that calls `interact` on `encounter.fountain`, so `KeyF` (`POSSESSED_KEYS` in `src/ui/input/keymap.ts`) and ETH-094 (`rolled[0]` inspection for harmful draughts) keep working.
     - **Events: one, not two.** A fountain use emits only `encounterUsed` (with `outcomeId` = the draught) and `encounterSpent`. Retire `drankFountain` / `fountainRanDry` rather than emitting both, which would double the log lines. Move what consumed them in the same change:
       - their log text, which becomes `encounterUsed` text using the def's verb ("drinks from the fountain: a draught of …");
       - Codex draught discovery;
       - the chronicle, if it reads them;
       - **`tools/headless.ts:177`**, which counts `drankFountain` for the sim's "fountain drinks" metric. Count `encounterUsed` with `encounter === 'encounter.fountain'` instead.

       The compare runs main's old code for its baseline, so both sides must still count the same thing.
   - **Invariant `floors.encounters`** (from the acceptance criteria): known def, `usesLeft` null or ≥ 0 and ≤ the def's max, `used` ≥ 0, every `rolled` id known to its table.
   - **Map & Codex:**
     - Update `featureGlyphId` (`src/ui/map/glyphs.ts`), `describeTile` & `tileSubject` (`src/ui/map/scene.ts`), and `floorToText` / `parseFloorText` (`src/sim/floorText.ts`) to handle `feature.kind === 'encounter'` (using state `'ready'` when `usesLeft === null || usesLeft > 0`, `'spent'` when `usesLeft === 0`, or `'flowing'`/`'dry'` for fountains).
     - Add `src/ui/codex/renderers/encounter.tsx` and discoveries in `FLOORS_DOMAIN.discoveries` (`encounterSighted` → `'seen'`, `encounterUsed` → `'used'` plus any `outcomeId` such as a draught `'seen'`).
4. **AI condition and rule action:**
   - Add `cond.encounter_known { kinds?: string[] }` and `act.use_encounter { kinds?: string[]; choice?: string; maxDetour?: number }` (with `maxDetour` optional, defaulting to unlimited when used for healing fountains or configurable for detours).
   - The baseline fountain rule becomes `cond.hurt_no_healing → act.use_encounter { kinds: ['encounter.fountain'] }`, per the acceptance criteria. Players can't save rules yet (the editor is M3), so no compatibility is needed: drop `act.drink_fountain` and update the tests that name it, unless keeping a one-line alias is simpler.
   - **Scope:** build the types for every outcome kind, but only fountains and the tests' two-choice encounter need to run end to end. Leave `cost.hp` and the `verb` gerund out until a user needs them (an altar or merchant item adds them).

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-030, 049, 051, 069, 070, 089, 098, 105).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
- 2026-11-19: Implementation instructions drafted by Antigravity; reviewed and amended by Claude (bugs fixed, open either/or choices decided, missing cases added). Ready to build.
