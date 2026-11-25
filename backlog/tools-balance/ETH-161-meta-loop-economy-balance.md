---
id: ETH-161
title: Meta-loop economy balance pass (M2 capstone)
type: chore
status: idea
priority: P1
milestone: M2
epic: tools-balance
size: M
depends_on: [ETH-036, ETH-083, ETH-086, ETH-087, ETH-093, ETH-132, ETH-159, ETH-160, ETH-170, ETH-171, ETH-185, ETH-186, ETH-187, ETH-188]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Check that currency income per hour and town upgrade costs pace well, from a fresh profile to a fully upgraded Guild Hall and Smithy.

## Why
Every milestone ends with a balance check (`CLAUDE.md` §10, `docs/DIFFICULTY_PHILOSOPHY.md` §9.1). This also covers the Guild Hall pacing pass Nate said he would do later (2026-11-24).

## Acceptance criteria
- [ ] The harness reports Renown and Trophies per hour, and the time until each town node becomes affordable
- [ ] Target pacing for the first unlocks is written down in `docs/DIFFICULTY_PHILOSOPHY.md`, and the results meet it
- [ ] T3 acceptance sweep recorded in the Log

## Targets from Nate (2026-11-24)
- Slower than the first strawman (first unlock about run 5, full party about run 15): pick targets in the spec.
- Every run that gets anywhere buys something or moves a bar; a very fast loss earning little is fine.
- Mastery: a really solid run that completes every objective earns about 5 talent points early on.
- Sets the share of open-building nodes that offers the next building quest (ETH-093).

- Pace with the M2.2 Omens both off and on, and tune the Omen multiplier per rank (ETH-185, ETH-186).
- Watch Extraction Drills (ETH-187): Nate expects it may need a nerf.

## Notes
The tree shape comes from the approved town-tree page (v4); ETH-132 and ETH-159 ship its costs as a starting point for this pass.

## Log
- 2026-11-24: Created in the backlog reorganization by theme.
- 2026-11-24: Added the pacing targets from the progression discussion with Nate.
- 2026-11-24: Now runs after M2.1 (town trees) and M2.2 (minimal Omens); added their items to depends_on.
