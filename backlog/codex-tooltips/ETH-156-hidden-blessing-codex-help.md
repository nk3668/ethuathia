---
id: ETH-156
title: Codex help text: hidden blessings and mixed stacks of potions and scrolls
type: feature
status: idea
priority: P3
milestone: M2
epic: codex-tooltips
size: S
depends_on: [ETH-147]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Add a short help entry to the Codex's potion and scroll pages. It explains that:
- an unidentified copy hides whether it is blessed, plain or cursed;
- copies stack together whatever they hide;
- using or dropping one takes a random copy from the stack;
- identifying the stack splits it into one stack per blessing.

## Why
Since ETH-147, a stack of unidentified potions or scrolls can mix hidden blessings. The behavior is
fair, but nothing in the Codex explains it. A player can be surprised when one potion from a stack
turns out cursed (`CLAUDE.md` §1 "Readable").

## Acceptance criteria
- [ ] The potion and scroll Codex entries, and the "Blessing unknown" tooltip, include the help text
      or link to it.
- [ ] The text never reveals any specific copy's hidden state, and the §11.6 secrecy guard still
      passes.
- [ ] A UI test renders the help text. `npm run check` passes. No sim is needed (UI and text only).

## Notes
- Filed from ETH-147's out-of-scope idea 5 (Nate approved, 2026-11-24).

## Log
- 2026-11-24: Created (Nate approved filing).
