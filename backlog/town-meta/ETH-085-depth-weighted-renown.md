---
id: ETH-085
title: Depth-weighted Renown rewards
type: feature
status: pending-review
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-062]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-23
---

## Summary
Renown per floor grows with depth (first pass: 10 x floor^1.3 for each floor below the first) instead of a flat 10, plus the existing 1 per 50 turns.

## Why
Deep runs should pay much more than shallow farming. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [x] The formula lives in one tuneable place with a tooltip that shows it
- [x] The run summary breakdown shows Renown per floor
- [x] Sim report shows Renown per hour before and after

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Assigned to Antigravity as a low-risk item.
- 2026-11-19: Implemented by Gemini. `(default)` Rounded each floor's `10 * floor^1.3` with `Math.round` and summed per-floor rounded values in `depthRenown` so the run summary per-floor breakdown matches total depth Renown exactly. `(default)` Computed `renown/hr (1x), banked` in the sim report at 1x speed (`TURNS_PER_SECOND = 5` steps/s = 18,000 steps/hr) as aggregate banked Renown divided by total elapsed hours across runs.
- 2026-11-23: Rebased onto main (renumbered Guild Hall rescaling follow-up to ETH-132) and merged to main (PR #82); PENDING REVIEW.
