---
id: ETH-183
title: One source for the Trophies tooltip text
type: chore
status: ready
priority: P3
milestone: M2
epic: ui-shell
size: S
depends_on: [ETH-171]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
The Trophies tooltip wording (kills, leftover gold, sold items, not Omen-multiplied) lives in `CURRENCY_INFO.trophies.about` and again in the top bar and run summary. Make them all read the one text.

## Why
Duplicated rule text drifts. Found in the ETH-171 review; Nate asked for it (2026-11-24).

## Acceptance criteria
- [ ] The top bar, the run summary and the Codex read the Trophies explanation from `CURRENCY_INFO` (or one helper built on it); no other copy of the wording remains
- [ ] Existing tooltip tests still pass, updated only for the shared text

## Log
- 2026-11-24: Created from the ETH-171 review; Nate said yes.
