---
id: ETH-119
title: Persistent adventurer records: a profile slice with identity, history, traits, level and death
type: feature
status: blocked
priority: P1
milestone: M2
epic: lineage
size: M
depends_on: [ETH-034, ETH-059, ETH-062]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
Every adventurer who has been on a run gets a durable record in the profile, with a stable id
that the run carries through: name, class, race, level and XP, traits, lifetime history, status
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
      `AdventurerRecord = { id, name, classId, raceId, level, xp, gained (attribute points),
      traits: string[], status: 'active' | 'fallen' | 'retired', born: run number, history:
      { runs, victories, deepest, kills, turns }, death?: { run, depth, turn, cause, killer? },
      origin?: { kind: 'recruit' | 'found' | 'kin', note?, kin? } }`. Zod schema, invariants via
      `checkProfile`.
- [ ] The id travels through the run: `AdventurerConfig.recordId?` (optional, so tests and old
      configs need nothing), copied into `extras['run.party']` (`PartyMemberRecord.recordId`).
      `buildRunConfig` creates records for new recruits and passes existing ones' level, XP and
      gains into the run (`StatsConfig` growth start values).
- [ ] `onRunResult` updates each member's record from `extras['run.party']`, `['track.xp']`,
      `['track.deaths']` and `['track.kills']` (kills per member added to `track.kills` extras):
      level, XP, gains, history; a member who fell gets `status: 'fallen'` and `death` with the
      cause and killer from the run end. Pure, returns a new slice.
- [ ] Read API (`src/meta/adventurers.ts`): `recordOf`, `activeRecords`, `fallenRecords`,
      `addTrait`, `setStatus` (retire), `newRecord`. Nothing outside the slice mutates records.
- [ ] Tests: a run with two members creates two records; a second run with the survivor keeps
      its level and history; a wipe marks both fallen with causes; old saves without the slice
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
- (default) Level and XP carry over in full between runs — alternative: survivors keep a share.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-068, 069, 087, 089, 101, 103, 104, retirement and descendants).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
