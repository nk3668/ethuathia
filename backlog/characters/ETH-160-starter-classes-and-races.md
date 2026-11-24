---
id: ETH-160
title: Starter set of unlockable classes and races
type: content
status: idea
priority: P1
milestone: M2
epic: characters
size: M
depends_on: [ETH-033, ETH-034, ETH-081]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Add a small starter set of classes and races beyond Vanguard and Human, each defined by attributes, growth and starting gear, so the Guild Hall has something to unlock.

## Why
Only `class.vanguard` and `race.human` exist, so class and race unlocks (ETH-036) have nothing to unlock. Signature abilities and AI roles come later, in M4 (ETH-037, ETH-038). This item only gives the classes different statistical identities. See `CLAUDE.md` §4 (Guild Hall).

## Acceptance criteria
- [ ] At least three more classes and two more races, with original names and lore (`CLAUDE.md` §9, clean-room)
- [ ] Each differs in attributes, growth and starting kit enough to show up in `npm run sim`
- [ ] Each has Codex text and tooltips
- [ ] A T1 harness run shows no class or race beating the field by more than the band set in `docs/DIFFICULTY_PHILOSOPHY.md`

## Notes
Needs decomposing before work starts, and the class list is for Nate to approve. ETH-039 (survey of DCSS and NetHack ideas) is the starting point.

## Log
- 2026-11-24: Created in the backlog reorganization by theme (gap: one class and one race exist).
