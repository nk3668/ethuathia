---
id: ETH-024
title: Contract model and the Recover-relic contract; victory needs every contract plus the exit
type: feature
status: done
priority: P1
milestone: M1
epic: quests
size: M
depends_on: [ETH-058, ETH-061, ETH-062]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Adds contracts (main quests) to the run: typed objectives with their own progress and reward. The first contract type, Recover the relic, places a relic on the bottom floor. A run is a Victory when every selected contract is complete and the party has walked out.

## Why
Gives runs a goal beyond "go deeper" and a clear Victory state. See `CLAUDE.md` §2 (Ending a run) and §6 (Quests).

## Acceptance criteria
- [x] Contract definitions live in `src/content/` with an id, name, description, objective kind, parameters and reward, and are validated at load time
- [x] `RunState` holds the selected contracts with per-contract progress, and survives a serialize round-trip
- [x] Recover the relic: dungeon gen places a relic on the bottom floor; picking it up completes the contract
- [x] The run ends as a Victory only when every contract is complete and the party reaches the dungeon exit; each completed contract pays its own reward into the at-risk total
- [x] Contract progress and completion emit events with log messages, and the run summary lists each contract and its reward
- [x] Sim tests with a fixed seed and a hand-built map cover completion and the victory check

## Notes
- Depends on stairs, items and run end from M1; add those IDs to `depends_on` once the M1 items are written.
- With one contract slot, Prepare defaults to Recover the relic, so no new UI is needed yet beyond showing it.
- The baseline AI needs a simple objective goal (go down until the relic is found, then head up). Richer weighting is ETH-031.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Started.
- 2026-11-18: Done. Contract kind (`objective` by kind, `reward`), `contract.recover_relic` and its relic `item.ember_reliquary`; quests slice with per-contract progress (STATE_VERSION 13); a `FloorPlanHook` seam that places the relic on the bottom floor; `victory.contracts`; `track.contracts` pays rewards into at-risk and feeds the run summary and history (slice v3); baseline fetches the relic and heads out; Prepare contracts section and panel (one per `contractSlots`); Codex fields. Tests in `test/sim/contracts.test.ts` and `test/meta/contracts.test.ts`.
- 2026-11-18: (default) Recover the relic pays 100 Renown — alternatives: add Trophies or Favor, or scale with dungeon depth.
- 2026-11-18: (default) The contract counts as complete only while a living adventurer carries the relic; if the bearer falls it is undone and its reward taken back (the relic stays in the fallen pack) — alternatives: complete for good on pickup, or drop the relic where the bearer fell so others can take it up.
- 2026-11-18: (default) A run always takes at least one contract (an empty choice falls back to Recover the relic) — alternative: allow a contract-free "just delve" run, which can then only end in a retreat.
- 2026-11-18: (default) Once the relic is in hand the baseline heads straight out, leaving the rest of the bottom floor unexplored — alternative: finish exploring first.
- 2026-11-18: (default) The relic lies in the farthest quarter of the bottom floor from the stairs up, picked at random there — alternatives: anywhere on the floor, or always the single farthest tile.
