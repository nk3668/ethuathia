---
id: ETH-078
title: Remove the unused empty texts from SidePanel TAB_INFO
type: chore
status: ready
priority: P3
milestone: M1
epic: ui-shell
size: S
depends_on: []
created: 2026-11-18
updated: 2026-11-18
---

## Summary
The `empty` texts for the town, codex and options tabs in `TAB_INFO` are never shown any more; remove them.

## Why
Dead code left behind by ETH-048. Follow-up.

## Acceptance criteria
- [ ] The unused `empty` entries are gone and no test or UI depends on them
- [ ] `npm run check` passes

## Log
- 2026-11-18: Created from Nate's interview answers (2026-11-18).
