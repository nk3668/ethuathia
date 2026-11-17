---
id: ETH-029
title: Bounty board on the Prepare screen; bounty rewards are at risk
type: feature
status: idea
priority: P2
milestone: M2
epic: quests
size: M
depends_on: [ETH-024, ETH-023]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
The Prepare screen offers a few bounties (side quests, e.g. "kill 3 trolls", "drink from a fountain") to accept. Bounties never end the run, and their rewards join the run's at-risk total.

## Why
Side goals that shape what the party chases without replacing the main goal. See `CLAUDE.md` §6 (Quests).

## Acceptance criteria
- [ ] Bounty definitions in `src/content/` (objective kind, parameters, reward), validated at load time
- [ ] The board offers a seeded selection each run; the player accepts up to a limit
- [ ] Completing a bounty logs it and adds its reward to the at-risk total; it is subject to the 25% wipe loss like other earnings
- [ ] Completing a bounty never ends the run or sends the party home
- [ ] The run summary lists bounties completed and failed

## Notes
- The board size and accept limit are later Guild Hall or Tavern upgrades.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
