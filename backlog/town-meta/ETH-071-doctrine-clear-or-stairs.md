---
id: ETH-071
title: Party stances - Steady, Cautious, Reckless, Delve, Plunder and Fall back
type: feature
status: idea
priority: P2
milestone: M3
epic: town-meta
size: M
depends_on: [ETH-058, ETH-115, ETH-162]
created: 2026-11-18
updated: 2026-11-25
---

## Summary
Ship the party **stance** axis of tactics (`CLAUDE.md` §5.2). The stance sets how the whole party approaches a floor. The old clear-floors-or-stairs doctrine becomes two stances: *Plunder* clears floors and *Delve* heads down once the stairs are known.

## Why
In 2026-11-18, the player asked for full exploration vs stairs-first to be their choice. The tactics design (2026-11-25) widens that into a stance the player swaps at will.

## Acceptance criteria
- [ ] `tactic.*` stance defs, each with a short plain-language effect:
  - *Steady* (the default, today's behavior)
  - *Cautious* (leaves a fight and retreats earlier, stays closer)
  - *Reckless* (fights everything in sight, flees later)
  - *Delve* (descends once the stairs are known and a minimum share of the floor is explored)
  - *Plunder* (clears each floor and picks up more)
  - *Fall back* (heads home now, the same as `act.retreat_run`)
- [ ] Stances change behavior through rule rows and `AiCtx` parameters (ETH-162), reusing the run-modifier flag path where it fits (ETH-115). The baseline descend logic reads the stance.
- [ ] *Steady* reproduces today's behavior (T0 identity with it picked).
- [ ] The trace names the stance when it decides ("Delve: stairs known, heading down").
- [ ] Tooltips, Codex text and log lines. Hand-map sim tests per stance. A smoke run reports turns per floor and win rate for each stance.

## Notes
- Which stances are free and which the Library unlocks: ETH-163.
- Stance changes only when the player picks one; there is no automatic switch to *Fall back*.

## Log
- 2026-11-18: Created from the player's answer to the ETH-058 question.
- 2026-11-18: Doctrine becomes a free-to-redo Tactics choice (ETH-086).
- 2026-11-19: Added ETH-115 (run-wide modifiers) to `depends_on`: build on the shared system instead of a parallel version.
- 2026-11-24: Moved from M2 to M3 in the backlog reorganization by theme.
- 2026-11-24: Nate: doctrines are unlocked through building trees; the unlock moves from a Guild Hall tier to a Library node (ETH-163).
- 2026-11-25: Rewritten for the tactics design (Nate, 2026-11-25): the doctrine becomes the party stance axis (six stances, Delve vs Plunder covering clear-or-stairs). Back to `idea` until ETH-162 lands; size M.
