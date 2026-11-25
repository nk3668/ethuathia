---
id: ETH-184
title: Run-scope kill and identify counts, so the Reaver and Lorekeeper get their intended reveals
type: feature
status: done
priority: P2
milestone: M2
epic: characters
size: S
depends_on: [ETH-036, ETH-121]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Add two run-scope conditions, "the party has killed at least N monsters this run" and "the party has identified at least N items this run", and switch the Reaver's and Lorekeeper's reveals to them.

## Why
ETH-036 approved the Reaver revealing at 40 kills in a run and the Lorekeeper at 5 identifications in a run, but no run-scope condition could count either, so it used fallbacks (reach floor 5; finish 5 runs). Nate (2026-11-24): add them.

## Acceptance criteria
- [x] Two run-scope conditions on the ETH-121 requirement system (e.g. `cond.run_kills` and `cond.run_identified`, each with a `min` count), read from what the run already tracks (`track.kills`; identification events), with condition words for tooltips ("killed 40 monsters in one run")
- [x] The Reaver's reveal becomes `metInRun` 40 kills, the Lorekeeper's 5 identifications; the Codex training row and the sealed-node text show the new wording
- [x] Saves that already revealed either class under the old fallback keep the reveal (the milestone record stays)
- [x] Extend the §11.6 guards if a new condition falls under them (`docs/ARCHITECTURE.md`)
- [x] Tests: each condition true and false at the boundary; the reveal records once from a run that meets it; an old recorded reveal survives
- [x] Sim: the default sim's gameplay is unchanged (`--compare origin/main`: every metric delta 0). State hashes differ on all seeds by design: the run state gains `track.identified`, and the harness now watches the two `metInRun` reveal requirements

## Log
- 2026-11-24: Created from ETH-036's report (fallback reveals); Nate asked for it.
- 2026-11-24: Implemented on `eth-184-kill-identify-reveals`: added `parseMinCount` (`src/sim/ai/types.ts`), `runKills` (`src/sim/run/trackers.ts`), `COND_RUN_KILLS` (`cond.run_kills`, `src/sim/run/rules.ts`), `IDENTIFIED_TRACKER` (`track.identified`, `runIdentified`, `identifiedCount`, `src/sim/items/identify.ts`) with `items.identified` invariant (`src/sim/items/index.ts`), `COND_RUN_IDENTIFIED` (`cond.run_identified`, `src/sim/items/rules.ts`), bumped `STATE_VERSION` to 39 (`src/sim/state.ts`), switched Reaver (`UPGRADE_REAVER_TRAINING.reveal`) to `cond.run_kills` (`min: 40`) and Lorekeeper (`UPGRADE_LOREKEEPER_TRAINING.reveal`) to `cond.run_identified` (`min: 5`), and updated `docs/ARCHITECTURE.md` and `tools/headless/config.ts`. Added tests (boundary, non-party kills, Wits/equip/use/scroll identifications, save/load, §11.6 AI indistinguishability guard for `cond.run_identified`, legacy save survival, Codex/Town UI wording). Verified `npm run check` (124 files / 1,499 tests, 0 ESLint warnings), `npm run validate:content`, `npm run build`, `npm run soak -- --seeds 200 --cap 2000` (200 passed, 0 failed, 385,369 steps), and `npm run sim -- --seeds 20 --compare origin/main` (delta `0` on all 46 gameplay/economy metrics; state hashes differ on 20/20 seeds solely from `STATE_VERSION` 38 → 39, `track.identified` in `RunState`, and `buildHeadlessConfig` populating `watchRequirements`). Status `pending-review`.
- 2026-11-24: Reviewed by Claude (PR #119): `npm run check` passes on b19c9e7 (124 files, 1,499 tests). Sim criterion reworded to match the result (identical metrics, different hashes by design). Follow-ups noted, not blocking: `track.identified` counts every actor's identifications (only adventurers identify today; filter to the party if monsters ever use items); a mixed-blessing stack counts once per group; both reveals now tend to fire in the first run or two, for ETH-161 to judge. Merged; `done`.
