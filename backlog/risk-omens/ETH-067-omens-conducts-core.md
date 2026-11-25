---
id: ETH-067
title: More starter Omens and conduct tracking
type: feature
status: idea
priority: P2
milestone: M6
epic: risk-omens
size: M
depends_on: [ETH-023, ETH-044, ETH-064, ETH-072, ETH-114, ETH-115, ETH-052, ETH-185]
created: 2026-11-17
updated: 2026-11-24
---

## Summary
The rest of the Omens on top of the M2.2 Omen system (ETH-185), and automatically tracked conducts that grant Favor.

## Why
See `CLAUDE.md` §6 (Omens, Conducts) and principle 3 (Risk is a choice).

## Acceptance criteria
- [ ] Built on ETH-185's Omen defs, ranks, multiplier and Prepare panel (no second system)
- [ ] Starter Omens: Gloom, Thriving Dark, Dry Wells, Short Leash, each unlocked by a town node or by clearing a run at a high Omen level (§6). Ravenous is ETH-053; Cursed Hoards moved to ETH-186
- [ ] Conducts as `RunTracker`s (pacifist, no armor, no prayers, never changed gear); kept conducts grant Favor and appear in the run summary
- [ ] Elite Spawns Omen raises the elite frequency run parameter from ETH-052
- [ ] Codex, tooltip and log text; tests per Omen effect and per conduct

## Notes
Acceptance criteria to be refined against the real code before starting (planning gate).

## Log
- 2026-11-17: Created as part of the backlog fan-out plan.
- 2026-11-18: Cursed modifiers taken mid-run (ETH-105) build on Omens.
- 2026-11-19: Added ETH-114 (objective engine), ETH-115 (run-wide modifiers) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M4 to M6 in the backlog reorganization by theme.
- 2026-11-24: Took over the Elite Spawns Omen criterion from ETH-052 and added it to depends_on.
- 2026-11-24: Town trees v4 (Nate): the Omen system itself moved forward to M2.2 (ETH-185) and its first Omens to ETH-186. This item keeps the remaining starter Omens and conducts; retitled.
