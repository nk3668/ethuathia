---
id: ETH-178
title: Sim harness option for a random mixed party, as players get it
type: feature
status: ready
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
- [ ] `--recruits` builds each seed's party through the same code path as the Prepare screen's random fill (`src/meta/prepare/party.ts`), so it can't drift from the game; `--party N` sets the size
- [ ] Works with `--compare`, `--baseline`, `--json` and `--party-sweep`; combining it with `--class` or `--race` is an error with a clear message
- [ ] The report adds a per-class and per-race breakdown (members fielded, deaths, Mastery XP) when the party is mixed
- [ ] The default (no flag) output and state hashes are unchanged
- [ ] Tests: the same seed gives the same party; the party only uses available classes and races; the flag clash errors

## Log
- 2026-11-24: Created from the ETH-160 findings; Nate asked for it in M2.
