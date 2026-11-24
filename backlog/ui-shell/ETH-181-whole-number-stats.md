---
id: ETH-181
title: Show derived stats the way combat uses them, as whole numbers
type: feature
status: ready
priority: P3
milestone: M2
epic: ui-shell
size: S
depends_on: [ETH-177]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
After ETH-177's formulas, damage, accuracy and evasion come out fractional ("+1.8 damage") but combat rounds them. Show the number combat actually uses, and put the exact value in the tooltip's breakdown.

## Why
Every number should be readable and true (`CLAUDE.md` §1). A "+1.8" that acts as "+2" misleads. Found in the ETH-177 review; Nate asked for it (2026-11-24).

## Acceptance criteria
- [ ] Party cards, the Prepare preview and the Codex show the rounded value combat uses, using the same rounding function as combat (one shared helper)
- [ ] Tooltips show the exact contributions and say the total is rounded
- [ ] Tests: a fractional stat shows its combat value; the tooltip lists the exact parts

## Log
- 2026-11-24: Created from the ETH-177 review; Nate said yes.
