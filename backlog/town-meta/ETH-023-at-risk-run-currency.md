---
id: ETH-023
title: Track run earnings as at-risk currency and lose 25% on a wipe
type: feature
status: done
priority: P1
milestone: M2
epic: town-meta
size: M
depends_on: [ETH-059, ETH-060, ETH-062]
created: 2026-11-17
updated: 2026-11-18
---

## Summary
Currency earned during a run stays in a separate at-risk total until the run ends. Victory and
retreat bank all of it. A wipe loses 25% of each currency's at-risk total and banks the rest.
Banked currency is never at risk.

## Why
This makes retreating a real choice: pull out with everything, or push deeper and risk losing
part of the haul. It only puts this run's earnings at stake, never past progress, so it fits
"Risk is a choice". See `CLAUDE.md` §2 (Ending a run) and §3 (Banked vs. at-risk currency).

## Acceptance criteria
- [x] Run state holds an at-risk total per currency (Renown, Trophies, Favor per deity), separate from the profile's banked totals, and it survives a serialize round-trip
- [x] When a run ends, victory and retreat bank 100% of the at-risk total; a wipe banks 75% of each currency, rounded down, and records the amount lost. The 25% loss is a single tunable constant
- [x] Nothing in a run can lower the banked totals
- [x] The top bar shows banked and at-risk amounts separately, with tooltips that explain the wipe loss
- [x] The run summary's currency table has a "Lost in the wipe" line, and the log records the loss
- [x] Sim/meta tests with a fixed seed cover each outcome (victory, retreat, wipe), including rounding

## Notes
- Depends on the currency trackers and run-reward items, which don't exist yet. Add them to
  `depends_on` once the M2 items are written.
- Apply the Omen multiplier before the wipe loss, so the summary reads base → ×Omen → −25%.
- Open question: should a later run recover the lost currency from the gravestone (lineage, §7)?
  Not part of this item.
- Codex and tooltip text are needed for the at-risk mechanic (CLAUDE.md §9 conventions).

## Log
- 2026-11-17: Created from a design discussion. The player chose a 25% wipe loss on run earnings only.
- 2026-11-17: Wired `depends_on` to the foundation items added in the fan-out plan.
- 2026-11-18: Gold stays outside at-risk currency; leftover gold converts to Trophies on exit and is lost on a wipe (ETH-083).
- 2026-11-18: Started. Nate confirmed 25% as final (not a default).
- 2026-11-18: Done. `WIPE_LOSS_SHARE` / `wipeLoss` in `src/sim/run/wipeLoss.ts`; the sim fills `RunResult.lost` and emits `earningsLost` before `runEnded` on a wipe; the top bar shows `+N` at risk beside each banked total; the run summary's column is "Lost in the wipe" with a note under the table. No `RunState` change (the at-risk totals already lived in `rewards.atRisk`).
- 2026-11-18: (default) The kept 75% is rounded down, so the loss rounds up and a wipe with 1 point at risk loses it — alternative: round the loss down (keep more).
- 2026-11-18: (default) The at-risk amount shows as a muted `+N` after each banked number and hides once the run ends — alternatives: a second row, or a "banked / at risk" pair.
- 2026-11-18: The Codex has no kind for game mechanics or currencies yet, so the at-risk explanation lives in the top-bar tooltips, the summary note and the log line; a Codex page is a follow-up.
