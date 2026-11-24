---
id: ETH-083
title: Leftover gold converts to Trophies when the party exits
type: feature
status: done
priority: P2
milestone: M2
epic: town-meta
size: S
depends_on: [ETH-023, ETH-061]
assignee: antigravity
created: 2026-11-18
updated: 2026-11-24
---

## Summary
When the party leaves the dungeon, its leftover gold converts into Trophies at a set rate. On a wipe all gold is lost.

## Why
Makes spending versus saving gold at merchants a choice. Decided in Nate's interview answers (2026-11-18). Gold is still not at-risk currency (ETH-061).

## Acceptance criteria
- [x] A conversion rate in content (e.g. 10 gold = 1 Trophy), shown in a tooltip
- [x] The run summary shows a "Gold converted" line on victory and retreat, and "Gold lost" on a wipe
- [x] The conversion happens after the Omen multiplier is applied to other currencies, and gold itself is not multiplied (default)
- [x] Test for victory, retreat and wipe

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-24: Assigned to Gemini (Antigravity); Claude reviews the PR.
- 2026-11-24: Implemented leftover gold-to-Trophies conversion (commit `5d03e5a`, merged `origin/main` in `94ccf6e`): added `GOLD_PER_TROPHY = 10` and `goldToTrophies` in `src/content/economy.ts`, updated `ITEM_GOLD.description` and `CURRENCY_INFO.trophies.about`, added `RunResult.converted`, `goldSettled` event, `GoldConversionRecord` (`extras['run.gold']`), `checkRunResult` validation for `converted`, `(atRisk - lost) + converted` banking, `history` v5 `RunRecord.gold` persistence + Run History reconstruction, `goldSettled` log text, `RunSummary` Gold converted/Gold lost lines and Trophies/TopBar tooltips, and tests (`test/sim/goldConversion.test.ts` plus updates to `runEnd`, `save`, `runSummary`, `logText`, `shell`). Verified `npm run check` (111 files / 1365 tests passing), `npm run validate:content`, and `npm run sim -- --seeds 100 --compare origin/main` (100/100 identical state hashes, 0 regressions).
- 2026-11-24: Reviewed by Claude: npm run check green merged with main, sim state hashes identical. Merged; status done.
