---
id: ETH-048
title: Run history list
type: feature
status: done
priority: P3
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-059, ETH-062]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
A list of past runs with their outcome, depth, contracts, party and currency, each opening its run summary.

## Why
Shows progress over time, alongside the Graveyard. See `CLAUDE.md` §7.

## Acceptance criteria
- [x] Run summaries are saved (capped count, tunable)
- [x] A Stats or History tab lists them, newest first
- [x] Selecting one reopens its summary

## Notes
- The `history` slice (v2) keeps compact `RunRecord`s, newest first, capped at `HISTORY_LIMIT`.
  The sim adds `extras['run.party']` to the `RunResult` so the record knows who set out.
- Contracts are not recorded yet: none exist until ETH-024. Its record field belongs with that item.

## Log
- 2026-11-17: Created from a design discussion on quests, depth and extra features.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Started.
- 2026-11-18: (default) `HISTORY_LIMIT` is a code constant of 50 runs — alternatives: keep 20, or a player setting in Options.
- 2026-11-18: (default) The run history lives in the Stats tab under lifetime totals — alternative: its own History tab.
- 2026-11-18: Done. History slice v2 with run records (cause, party, Codex finds), `extras['run.party']`, Stats tab with totals and the run list, past summaries reopen in the run summary modal.
