---
id: ETH-053
title: Redefine the Ravenous Omen for food buffs (no hunger)
type: chore
status: idea
priority: P3
milestone: M4
epic: risk-omens
size: S
depends_on: [ETH-054]
created: 2026-11-17
updated: 2026-11-17
---

## Summary
The Ravenous Omen ("food drains faster") assumed a hunger meter. There is no hunger: food only grants short-term buffs (ETH-054). Redefine Ravenous to work with food buffs.

## Why
Keeps the Omen list consistent with the systems we build. See `CLAUDE.md` §6 (Omens).

## Acceptance criteria
- [ ] Ravenous is redefined in CLAUDE.md §6 and its Omen def so that it uses food buffs, with Codex and tooltip text
- [ ] Each rank's effect is a tunable value, and the reward multiplier per rank is set

## Notes
- Proposed: food buffs last a shorter time and are weaker per rank (e.g. −25% duration per rank). Other ideas: food spawns less often, or each adventurer can hold only one food buff at a time.
- Food must never become required, so Ravenous should make runs harder without adding a starvation risk.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: The player ruled out hunger and starvation; food gives short-term buffs only. Retitled from "Decide the fate of the Ravenous Omen without food".
