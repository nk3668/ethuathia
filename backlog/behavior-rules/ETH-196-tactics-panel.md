---
id: ETH-196
title: Tactics panel, party-card intent and the Prepare tactics column
type: feature
status: idea
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-162]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
The UI for tactics:
- a **Tactics** tab (replacing the planned Rules tab) with party stance and formation, plus one row per adventurer with role, range and focus pickers and habit slots
- the same pickers in the Prepare screen's "Loadout & tactics" column
- party cards showing each adventurer's role and the option behind the current intent

## Why
Swapping tactics mid-run is the main way to interact during a run (`CLAUDE.md` §2, §5.2, §8). The mock-up is in `docs/VISUAL-DESIGN.md` §5.1.

## Acceptance criteria
- [ ] The Tactics tab follows `docs/VISUAL-DESIGN.md` §5.1. Changes send `setTactics` and take effect on the next decision, mid-run included.
- [ ] Locked options are greyed, with a padlock and the Library node that unlocks them. Habit slots show used / total, and exclusive pairs explain why one is disabled.
- [ ] Each option's tooltip covers what it does, the ability tags it uses, this run's hit count, and the fallback when the adventurer lacks the tag.
- [ ] Party cards show "Name · Role" and the intent with its option ("mending Bram · Healer"). AI log lines name the option.
- [ ] The Prepare screen sets the same picks before a run, with "Reset to class defaults".
- [ ] Keyboard accessible and never color-only. Checked in `npm run dev` with no console errors. `npm run check` passes.

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
