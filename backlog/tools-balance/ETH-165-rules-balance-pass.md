---
id: ETH-165
title: Rules and presets balance pass (M3 capstone)
type: chore
status: idea
priority: P1
milestone: M3
epic: tools-balance
size: M
depends_on: [ETH-162, ETH-163, ETH-164, ETH-151, ETH-154]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Check that good rules beat the baseline by a visible but bounded margin, and that no single preset dominates.

## Why
"Idle decisions matter" (`CLAUDE.md` §1): rules must pay off without making the baseline useless. This is M3's milestone balance check (`docs/DIFFICULTY_PHILOSOPHY.md` §9.1).

## Acceptance criteria
- [ ] The harness can run each shipped preset, and the baseline, as a sweep
- [ ] Target margins are written down and met
- [ ] T3 acceptance sweep recorded in the Log

## Log
- 2026-11-24: Created in the backlog reorganization by theme.
