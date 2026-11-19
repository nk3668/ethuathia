---
id: ETH-085
title: Depth-weighted Renown rewards
type: feature
status: ready
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-062]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-19
---

## Summary
Renown per floor grows with depth (first pass: 10 x floor^1.3 for each floor below the first) instead of a flat 10, plus the existing 1 per 50 turns.

## Why
Deep runs should pay much more than shallow farming. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [ ] The formula lives in one tuneable place with a tooltip that shows it
- [ ] The run summary breakdown shows Renown per floor
- [ ] Sim report shows Renown per hour before and after

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Assigned to Antigravity as a low-risk item.
