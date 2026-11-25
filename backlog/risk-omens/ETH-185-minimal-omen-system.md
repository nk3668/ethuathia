---
id: ETH-185
title: Minimal Omen system with ranks, one reward multiplier and a Prepare toggle, unlocked by town nodes
type: feature
status: done
priority: P1
milestone: M2.2
epic: risk-omens
size: M
depends_on: [ETH-115, ETH-064, ETH-023, ETH-172]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
Turn the placeholder Omen content kind into a working system: Omen defs with ranks, unlocked by building-tree nodes, switched on and ranked on the Prepare screen, and paid through one reward multiplier. The first real Omens are ETH-186; the M6 Omens and conducts stay in ETH-067.

## Why
Town trees v4 (Nate, 2026-11-24) turns every risk node into an Omen unlock, so all extra risk pays through the one Omen multiplier (`CLAUDE.md` §6) instead of each node carrying its own bonus. M2 ships four such nodes, so the system moves forward from M6.

## Acceptance criteria
- [x] `OmenDef` (`src/content/omens.ts`) gains ranks: each rank is a run-wide modifier (ETH-115 bundle or run parameter) plus a multiplier increment; the schema validates both. Omens start locked.
- [x] An upgrade node can unlock an Omen with the same `unlock` grant classes and races use (ETH-036); `validateContent` checks the id exists.
- [x] The Prepare screen lists unlocked Omens with a rank selector (0 = off) and shows the total multiplier with a tooltip that itemizes it. Choices persist with the previous run's Prepare settings (auto-restart and Rematch reuse them).
- [x] The multiplier applies to Renown, Trophies and Favor as they are earned in the run, before the wipe loss; leftover gold and sold items converted on exit are not multiplied (`CLAUDE.md` §3). The run summary shows the multiplier line.
- [x] The active Omens and ranks are recorded in the run config and the run history, so a seed replays identically.
- [x] Codex entries for Omens (hint while locked), tooltips, and a log line at run start naming the active Omens; a test Omen covers ranks, the multiplier and the wipe loss.

## Notes
- A run tracker with `unmultiplied: true` (ETH-188, `track.salvage`: Field Salvage Kit scrap) joins the at-risk total but is not scaled by the Omen reward multiplier, like exit sales (`CLAUDE.md` §3). `sumTrackerRewards` in `src/sim/run/trackers.ts` already skips it; keep it that way when the multiplier moves.
- The multiplier per rank is a content number; ETH-161 tunes it with ETH-186's Omens on and off.
- Reward-multiplier tables in `docs/DIFFICULTY_PHILOSOPHY.md` should say where the Omen multiplier sits; update it in the same change.
- Clearing a run at a high Omen level unlocking more Omens (§6) is M6 (ETH-067).

## Log
- 2026-11-24: Created from the town trees v4 decision (Nate): risk nodes unlock Omens; a minimal Omen system ships in M2.2.
- 2026-11-25: Started (branch eth-185-minimal-omen-system, stacked on ETH-188).
- 2026-11-25: Done. Ranks are the whole effect at that rank (bundle and/or flags, scope, text, total `reward`, strictly rising); an Omen is available only through an owned `unlock` node (an Omen no node unlocks stays locked, unlike classes). `omens` Prepare section (`{ ranks: { id: rank } }`) writes `RunConfig.omens`; `initStats` turns it into run modifiers (`src/sim/stats/omens.ts`), so the existing `rewardMultiplier`, the start-of-run log line and Codex discovery serve it, and `unmultiplied` trackers stay outside it. `RunResult.extras['run.omens']` and `RunRecord.omens` (optional, no history version bump) feed the summary's "Omen multiplier" line. Harness gained `HeadlessOptions.omens` (API only). Docs: ARCHITECTURE §6.3 and the run-modifier section, DIFFICULTY_PHILOSOPHY opt-in risk. Sim policy (milestone piece: T0 plus smoke only), measured at e903a81 plus the harness option: T0 20 seeds, no Omens, `--compare 3f3c3f4`: every metric identical and all 20 state hashes the same. Smoke, 20 seeds with a throwaway "monsters ×1.25 / ×1.6 HP" Omen at ranks 0/1/2: mean depth 6.20 / 5.80 / 5.35 (rank 0 matches T0).
