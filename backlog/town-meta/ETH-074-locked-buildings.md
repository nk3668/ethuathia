---
id: ETH-074
title: Town buildings unlocked by milestones
type: feature
status: ready
priority: P3
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-063, ETH-062]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Buildings other than the Guild Hall start locked and unlock when a milestone is met (e.g. reach depth 3, finish a run). Locked buildings show what unlocks them.

## Why
`CLAUDE.md` §4 says buildings are unlocked by milestones; `docs/VISUAL-DESIGN.md` §5.2 shows the locked state. Found as an ETH-063 follow-up.

## Acceptance criteria
- [ ] Building defs get an optional unlock milestone (data), validated
- [ ] Milestones are checked in `applyRunResult`; unlocking logs it and shows it in the run summary
- [ ] The Town tab shows locked buildings with the milestone text
- [ ] Unit tests and a component test

## Log
- 2026-11-18: Created from an ETH-063 follow-up.
