---
id: ETH-084
title: Rematch button on the run summary replays the same seed
type: feature
status: done
priority: P2
milestone: M2
epic: ui-shell
size: S
depends_on: [ETH-062, ETH-064]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-19
---

## Summary
The run summary gains a Rematch button that starts the next run with the same seed and Prepare settings. Auto-restart keeps rolling a new seed.

## Why
Lets the player test rule changes on a known dungeon. Decided in Nate's interview answers (2026-11-18).

## Acceptance criteria
- [x] Rematch next to Continue and Start next run
- [x] The new run's dungeon layout matches the previous run's (test)
- [x] Upgrades bought between runs still apply; the tooltip says the layout repeats but outcomes may differ

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-19: Assigned to Antigravity as a low-risk item.
- 2026-11-19: Implemented by Gemini. Added `rematch()` and `StartRunOptions` (`sameSeed`) to `runStore`/`App` so Rematch replays the previous run's seed via `buildRunConfig` (applying upgrades bought between runs) without advancing the seed sequence, while Start next run and auto-restart keep rolling a fresh seed. Added the **Rematch** button with an explanatory `Tooltip` to `RunSummary` and (default) `RunOverBanner` so players can close the summary, buy Town upgrades, and launch a rematch directly; (default) kept past runs reopened from Run History showing only **Close** since `RunRecord` does not store a seed. Updated `docs/VISUAL-DESIGN.md` §6.2 and added unit and integration tests in `test/ui/runSummary.test.tsx`.
- 2026-11-20: Review fixes (tooltip names "your current upgrades and rules"; Escape with the tooltip open dismisses only the tooltip, tested) landed; reviewed by Nate and Claude and merged as PR #80. Done.
