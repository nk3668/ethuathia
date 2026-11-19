---
id: ETH-067
title: Omens with ranks, the reward multiplier and conduct tracking
type: feature
status: idea
priority: P2
milestone: M4
epic: risk-omens
size: M
depends_on: [ETH-023, ETH-044, ETH-064, ETH-072, ETH-114, ETH-115]
created: 2026-11-17
updated: 2026-11-19
---

## Summary
Opt-in difficulty modifiers with ranks that raise the reward multiplier, and automatically tracked conducts that grant Favor.

## Why
See `CLAUDE.md` §6 (Omens, Conducts) and principle 3 (Risk is a choice).

## Acceptance criteria
- [ ] Omen defs with ranks; each rank has a bundle or run-param change and a multiplier increment; validated
- [ ] Starter Omens: Gloom, Thriving Dark, Dry Wells, Short Leash, Cursed Hoard (uses ETH-044 curses). Ravenous is ETH-053 and Elite Spawns ETH-052
- [ ] Prepare panel toggles ranks and shows the total multiplier; the multiplier applies to all currencies before the wipe loss
- [ ] Conducts as `RunTracker`s (pacifist, no armor, no prayers, never changed gear); kept conducts grant Favor and appear in the run summary
- [ ] Codex, tooltip and log text; tests per Omen effect and per conduct

## Notes
Acceptance criteria to be refined against the real code before starting (planning gate).

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Cursed modifiers taken mid-run (ETH-105) build on Omens.
- 2026-11-19: Added ETH-114 (objective engine), ETH-115 (run-wide modifiers) to `depends_on`: build on the shared system instead of a parallel version.
