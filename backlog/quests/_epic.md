---
epic: quests
title: Quests: contracts and bounties
status: active
milestones: [M1, M2, M3, M4, M5]
---

## Goal
Every run has a clear goal. The player picks contracts (main quests) that define Victory and takes on bounties (side quests) for extra rewards.

## Scope
**In:**
- Contract model, types and Victory check
- The return trip out of the dungeon
- Contract slots
- Bounty board and in-dungeon bounty encounters
- Quest rule conditions and AI objective weighting

**Out (later or elsewhere):**
- Currency banking and wipe loss (see `town-meta`, ETH-023)
- Named uniques themselves (see `bestiary`)

## Design refs
- `CLAUDE.md` §2: Core loop (Prepare, Ending a run)
- `CLAUDE.md` §6: Quests

## Items
- [ ] [ETH-024 Contract model and the Recover-relic contract; victory needs every contract plus the exit](ETH-024-contracts-recover-relic.md)
- [ ] [ETH-025 Return trip: walk back up through explored floors, with light respawns](ETH-025-return-trip.md)
- [ ] [ETH-026 Slay-named-foe contract](ETH-026-slay-named-foe-contract.md)
- [ ] [ETH-027 Gather and Delve contracts](ETH-027-gather-delve-contracts.md)
- [ ] [ETH-028 Contract slots as a Guild Hall upgrade](ETH-028-contract-slots-upgrade.md)
- [ ] [ETH-029 Bounty board on the Prepare screen; bounty rewards are at risk](ETH-029-bounty-board.md)
- [ ] [ETH-030 Bounty encounters inside the dungeon](ETH-030-bounty-encounters.md)
- [ ] [ETH-031 Quest rule conditions and objective weighting in the AI](ETH-031-quest-rule-conditions-ai.md)
- [ ] [ETH-032 Rescue contract](ETH-032-rescue-contract.md)
