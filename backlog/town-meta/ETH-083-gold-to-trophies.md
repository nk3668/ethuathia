---
id: ETH-083
title: Leftover gold converts to Trophies when the party exits
type: feature
status: ready
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
- [ ] A conversion rate in content (e.g. 10 gold = 1 Trophy), shown in a tooltip
- [ ] The run summary shows a "Gold converted" line on victory and retreat, and "Gold lost" on a wipe
- [ ] The conversion happens after the Omen multiplier is applied to other currencies, and gold itself is not multiplied (default)
- [ ] Test for victory, retreat and wipe

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
- 2026-11-24: Assigned to Gemini (Antigravity); Claude reviews the PR.
