---
id: ETH-074
title: Town buildings unlocked by milestones
type: feature
status: done
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
- [x] Building defs get an optional unlock milestone (data), validated
- [x] Milestones are checked in `applyRunResult`; unlocking logs it and shows it in the run summary
- [x] The Town tab shows locked buildings with the milestone text
- [x] Unit tests and a component test

## Log
- 2026-11-18: Created from an ETH-063 follow-up.
- 2026-11-18: Started.
- 2026-11-18: Done. `BuildingDef.unlock` takes a milestone from `src/content/milestones.ts`
  (reach depth N, finish N runs, win N runs); `applyRunResult` ends with `unlockMilestones`, which
  records `{ id, run }` in a new `milestones` profile slice (the unlock log). Town tab shows locked
  tabs with a padlock, milestone and progress; the run summary has an "Unlocked" section;
  `canPurchase` refuses nodes of a locked building.
- (default) The Smithy is added as a locked placeholder building (no nodes) so the locked state is
  visible and testable; it unlocks on reaching floor 3 — alternatives: finish a run, or another
  building/milestone.
- (default) "Logs it" means the unlock is recorded in the profile with the run that opened it
  (shown in the summary and as "Opened after run N" in the tab tooltip), not a line in the run
  log, whose lines come only from sim events — alternative: a meta/town log feed.
- (default) Milestones are checked against lifetime history totals, so an old save that already
  reached floor 3 opens the Smithy at the end of its next run — alternative: also check on load.
