---
id: ETH-119
title: Persistent adventurer records: a profile slice with identity, history, traits, peak level and death
type: feature
status: ready
priority: P1
milestone: M2
epic: lineage
size: M
depends_on: [ETH-034, ETH-059, ETH-062]
created: 2026-11-19
updated: 2026-11-24
---

## Summary
Every adventurer who has been on a run gets a durable record in the profile, with a stable id
that the run carries through: name, class, race, peak level, traits, lifetime history, status
(active, fallen, retired) and, for the fallen, a cause of death. It is data only; the roster
screen, graveyard and lineage rules are built on it by their own items.

## Why
The roster (ETH-068), recruits (ETH-089), quirks (ETH-104), class Mastery (ETH-087), gravestones
and heirlooms (ETH-069), ballads (ETH-103), the nemesis (ETH-101), retirement and descendants
all need "who was this adventurer, across runs". Today a party member exists only for one run:
`AdventurerConfig` is `{ name, classId, raceId }`, and the profile keeps only the compact party
list in `history` (`RunRecord.party`) plus `extras['track.xp']`. See `CLAUDE.md` §7 and the
"Shared systems" list in `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [ ] Profile slice `adventurers` (`src/meta/slices/adventurers.ts`, `defineSlice`, one line in
      `PROFILE_SLICES`): `{ nextId, records: Record<AdventurerId, AdventurerRecord> }` with
      `AdventurerRecord = { id, name, classId, raceId, peakLevel (highest level reached in any
      run), traits: string[], status: 'active' | 'fallen' | 'retired', born: run number, history:
      { runs, victories, deepest, kills, turns }, death?: { run, depth, turn, cause, killer? },
      origin?: { kind: 'recruit' | 'found' | 'kin', note?, kin? } }`. Zod schema, invariants via
      `checkProfile`.
- [ ] The id travels through the run: `AdventurerConfig.recordId?` (optional, so tests and old
      configs need nothing), copied into `extras['run.party']` (`PartyMemberRecord.recordId`).
      `startRun` creates records for new recruits. **Every member starts the run at level 1**
      (Nate, 2026-11-24: levels reset each run; lasting power lives in Class Mastery), so no
      growth values are carried into the run.
- [ ] `onRunResult` updates each member's record from `extras['run.party']`, `['track.xp']`,
      `['track.deaths']` and `['track.kills']` (kills per member added to `track.kills` extras):
      peak level and history; a member who fell gets `status: 'fallen'` and `death` with the
      cause and killer from the run end. Pure, returns a new slice.
- [ ] Read API (`src/meta/adventurers.ts`): `recordOf`, `activeRecords`, `fallenRecords`,
      `addTrait`, `setStatus` (retire), `newRecord`. Nothing outside the slice mutates records.
- [ ] Tests: a run with two members creates two records; a second run with the survivor keeps
      its history and traits, starts at level 1, and raises `peakLevel` only when beaten; a wipe marks both fallen with causes; old saves without the slice
      load to an empty slice; profile round-trip.

## Notes
Who uses it and how:
- **ETH-068 roster and graveyard:** lists, caps and the Graveyard tab read active and fallen records.
- **ETH-089 recruits:** a found adventurer gets a record with `origin.kind: 'found'` and a backstory note.
- **ETH-104 quirks:** quirks are `traits` added after a run.
- **ETH-087 class Mastery:** per-adventurer XP feeds class totals from the same update.
- **ETH-069 gravestones / heirlooms:** a grave is placed from a fallen record (depth, best item).
- **ETH-103 ballads / ETH-101 nemesis:** read names, causes and killers from `death`.
- **Retirement / descendants** (no items yet): `status: 'retired'` and `origin.kind: 'kin'`.

Open decisions:
- (default) Every adventurer who ever ran gets a record, random fill-ins included — alternative:
  only roster members (fewer records; fill-ins vanish as today).
- (default) Records are never deleted; a cap (e.g. 200 fallen) trims the oldest fallen with no
  heirloom — alternative: keep everything forever.
- **Decided (Nate, 2026-11-24): levels reset to 1 every run.** This replaces the 2026-11-19
  full carry-over trial. Records keep identity, traits, titles and history; the per-run XP feeds
  Class Mastery instead (ETH-087). Later items add fields with their own migrations: titles
  (lineage) and the adventurer's talent build (ETH-088, M4).

## Implementation instructions

To keep this foundation pure, extensible and zero-delta on existing runs:

1. **Pure `buildRunConfig` vs. record creation lifecycle:**
   - `buildRunConfig(profile, choices, seed)` is called by previews, tests and headless scripts; it must remain pure and not mutate `profile` in place.
   - **Decision:** add one pure meta function `startRun(profile, choices, seed): { profile: Profile; config: RunConfig }` in `src/meta/prepare/build.ts`. It calls `buildRunConfig`, then allocates `AdventurerId`s `'adv.<n>'` from `adventurers.nextId` for members without a record and returns the updated profile. Every place that launches a run calls it: Descend, Start next run, Rematch, auto-restart and time-away catch-up. The UI never allocates ids itself; `App.tsx` only stores the returned profile. `buildRunConfig` stays pure. When a roster pick names an existing record, it copies that record's `recordId` (and its name, class and race) onto the `AdventurerConfig`; nothing about growth is copied. Rematch reuses the previous run's config as-is (same seed, same record ids).
   - Because `AdventurerConfig.recordId?: AdventurerId` is optional, if a run finishes with a party member that has no `recordId` (or an unknown one), `adventurersSlice.onRunResult` allocates a fresh record on the fly from `nextId` (`born: runNumber`) before folding that run's results. That way every run banked through `applyRunResult(profile, result)` creates and updates records even when started from a bare `buildRunConfig`.
2. **Carrying `recordId` through the sim** (levels reset, so no growth start values; the 2026-11-19 `AdventurerConfig.growth` plan is dropped):
   - Extend `AdventurerConfig` (`src/sim/state.ts`) and `AdventurerPart` with optional `recordId?: string`. In `createRun` (`src/sim/createRun.ts`), copy it onto `entity.adventurer`.
   - Include `recordId?: string` on `PartyMemberRecord` (`src/sim/run/end.ts`, `extras['run.party']`) and `RunRecordMember` (`src/meta/slices/history.ts`).
   - `onRunResult` reads each member's final level from the existing `XP_TRACKER` record (`extras['track.xp']`) to update `peakLevel`. ETH-087 reads the same record for Mastery XP.
   - Extend `KILLS_TRACKER` (`src/sim/run/trackers.ts`) state to `{ kills: number; trophies: number; byActor: Record<EntityId, number> }`: when `e.type === 'killed' && e.byParty`, increment `byActor[e.killer]` whenever `e.killer` is a party member (keep `kills` and `trophies` for all `byParty` kills so ETH-123 companion kills still count toward Trophies without polluting per-member kill counts).
   - Bump `STATE_VERSION` by 1 and register invariant checks in `core.party` / `stats.growth` for `adventurer.recordId` (non-empty string when present).
3. **Slice ordering, schema, invariants and trimming (`src/meta/slices/adventurers.ts`):**
   - Register `adventurers: adventurersSlice` in `PROFILE_SLICES` (`src/meta/slices/index.ts`). **Decision:** add an optional third parameter `ProfileSlice.onRunResult?(state, result, before: Profile)`, where `before` is the profile as it was before `applyRunResult` started (`src/meta/slice.ts`, `src/meta/profile.ts`). Existing slices ignore it. The run number is `before.history.totals.runs + 1`, so the order of slices in `PROFILE_SLICES` doesn't matter and no second run counter is kept.
   - Validate in `adventurersSchema` (or via a `superRefine` so `checkProfile` catches violations): every record key in `records` matches `record.id`; `nextId` is strictly greater than the numeric suffix of every `adv.<n>` id; `peakLevel` is a positive integer; `status === 'fallen'` iff `death !== undefined`; `history.victories <= history.runs`; `kin` references (when `origin.kind === 'kin'`) are issued ids (see below); `traits` has no duplicates.
   - Cap fallen records at `FALLEN_RECORD_CAP = 200`: when `onRunResult` pushes fallen records past the cap, trim the oldest fallen records (by `death.run`, then `id`). Never trim a record another record points at (`origin.kin`). ETH-069 adds its own "has a grave or heirloom" protection when it lands; don't invent a flag for it now.
   - **Kin references:** `kin` must name a record id that has been issued (< `nextId`), not necessarily one that still exists. The trim guard above keeps targets in practice, but the schema shouldn't fail a save if one goes.
4. **Read & mutation API (`src/meta/adventurers.ts`):**
   - Export pure helpers taking and returning `Adventurers` (or `Profile`): `recordOf(profile, id)`, `activeRecords(profile)` (in id/creation order), `fallenRecords(profile)` (newest death first), `retiredRecords(profile)`, `newRecord(slice, init)`, `addTrait(slice, id, trait)` (idempotent if already present), `setStatus(slice, id, status)`.
   - Export everything from `src/meta/index.ts`.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-068, 069, 087, 089, 101, 103, 104, retirement and descendants).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
- 2026-11-19: Implementation instructions drafted by Antigravity; reviewed and amended by Claude (bugs fixed, open either/or choices decided, missing cases added). Ready to build.
- 2026-11-19: Nate: full carry-over as a trial, to revisit when balancing; the carry-over share is one tunable constant.
- 2026-11-24: Nate decided levels reset to 1 every run. Dropped level, XP and growth carry-over (records keep peakLevel); the spec shrinks. Still ready.
