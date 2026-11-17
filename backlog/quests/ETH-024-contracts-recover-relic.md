---
id: ETH-024
title: Contract model and the Recover-relic contract; victory needs every contract plus the exit
type: feature
status: idea
priority: P1
milestone: M1
epic: quests
size: M
depends_on: []
created: 2026-11-17
updated: 2026-11-17
---

## Summary
Adds contracts (main quests) to the run: typed objectives with their own progress and reward. The first contract type, Recover the relic, places a relic on the bottom floor. A run is a Victory when every selected contract is complete and the party has walked out.

## Why
Gives runs a goal beyond "go deeper" and a clear Victory state. See `CLAUDE.md` §2 (Ending a run) and §6 (Quests).

## Acceptance criteria
- [ ] Contract definitions live in `src/content/` with an id, name, description, objective kind, parameters and reward, and are validated at load time
- [ ] `RunState` holds the selected contracts with per-contract progress, and survives a serialize round-trip
- [ ] Recover the relic: dungeon gen places a relic on the bottom floor; picking it up completes the contract
- [ ] The run ends as a Victory only when every contract is complete and the party reaches the dungeon exit; each completed contract pays its own reward into the at-risk total
- [ ] Contract progress and completion emit events with log messages, and the run summary lists each contract and its reward
- [ ] Sim tests with a fixed seed and a hand-built map cover completion and the victory check

## Notes
- Depends on stairs, items and run end from M1; add those IDs to `depends_on` once the M1 items are written.
- With one contract slot, Prepare defaults to Recover the relic, so no new UI is needed yet beyond showing it.
- The baseline AI needs a simple objective goal (go down until the relic is found, then head up). Richer weighting is ETH-031.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
