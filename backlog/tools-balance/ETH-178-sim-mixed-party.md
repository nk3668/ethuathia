---
id: ETH-178
title: Sim harness option for a random mixed party, as players get it
type: feature
status: done
priority: P2
milestone: M2
epic: tools-balance
size: S
depends_on: [ETH-160]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
`npm run sim -- --recruits` fields the party the way the Prepare screen does for a new player: empty slots filled with random recruits from the available classes and races, from the seed.

## Why
The harness always fields Vanguard/Human (`headlessParty`), so nothing measures the mixed parties players actually get now that recruits can roll any of four classes and three races (ETH-160). Nate (2026-11-24): add it in M2.

## Acceptance criteria
- [x] `--recruits` builds each seed's party through the same code path as the Prepare screen's random fill (`src/meta/prepare/party.ts`), so it can't drift from the game; `--party N` sets the size
- [x] Works with `--compare`, `--baseline`, `--json` and `--party-sweep`; combining it with `--class` or `--race` is an error with a clear message
- [x] The report adds a per-class and per-race breakdown (members fielded, deaths, Mastery XP) when the party is mixed
- [x] The default (no flag) output and state hashes are unchanged
- [x] Tests: the same seed gives the same party; the party only uses available classes and races; the flag clash errors

## Log
- 2026-11-24: Created from the ETH-160 findings; Nate asked for it in M2.
- 2026-11-24: Started.
- 2026-11-24: Done. `--recruits` fields `recruitParty(profile, seed, size)` (`src/meta/prepare/build.ts`), which runs the same `fillParty` the Prepare screen's party section uses (extracted from `PARTY_CHOICE.apply`) on the `prepare` stream, so a party of the profile's size equals `buildRunConfig`'s. `--party N` sets the size. It works with `--compare`, `--baseline`, `--json` and `--party-sweep` (`recruits` is a report argument, so recruit and uniform reports do not compare), and is an error with `--class` or `--race`. A mixed party adds `members` and `classXp` to each seed result and a per-class and per-race table (fielded, deaths, Mastery XP) to the report and its JSON summary (`tools/headless/mixed.ts`). Class Mastery XP includes the run-end bonus; race Mastery XP is the members' shares only. Default output and hashes unchanged (50 seeds vs origin/main: all hashes equal). A ref from before this item cannot be `--compare`d with `--recruits`, as it does not know the flag.
