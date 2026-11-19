---
id: ETH-110
title: Rolled growth, shared kill XP and uncapped levels
type: feature
status: done
priority: P1
milestone: M1
epic: characters
size: M
depends_on: [ETH-034]
created: 2026-11-18
updated: 2026-11-18
---

## Summary
Follow-up to ETH-034 from Nate's answers. Each level-up rolls the class's growth from a seeded
RNG. Everyone in the fight shares kill XP. Levels have no cap, and XP costs are lower, so a run
gets more levels.

## Why
Nate's answers to the ETH-034 questions (2026-11-18). Fixed growth was too predictable. With
killing-blow XP only, a healer standing back would never level. A level cap had no reason to
exist yet. See `CLAUDE.md` §7.

## Acceptance criteria
- [x] Each class gives each attribute its own level-up roll (a range, with an optional chance). The roll uses a seeded RNG, and the rolled gains are stored, so a save and load never changes them
- [x] Kill XP is shared by every living party member near the killer or the victim, and a lone killer still gets the full amount
- [x] No level cap: the XP curve, the invariants and the UI handle any level
- [x] Lower XP costs: the mean party level in the sim compare rises noticeably, and level-up healing is unchanged
- [x] `xpGained` (the ETH-087 hook) and the `track.xp` tracker still work

## Notes
- Growth rolls: `ClassDef.growth[attr] = { min, max, chance? }`. The rolled points are summed into
  `growth.gained` on the actor.
- The roll's RNG is `seedState(seed, 'growth/<actor>/<level>')` (`growthRng`). This is the same
  derived-seed pattern as the floor RNGs, so the gains don't depend on draw order in shared streams.
- Balance gets another pass later (ETH-080).

## Log
- 2026-11-18: Created from Nate's answers to the ETH-034 questions; started (in-progress).
- 2026-11-18: (default) The growth RNG is a per-level seed derived from the run seed, the actor id and the level (`growthRng`), not a draw from a shared stream. The rolled gains are also stored in `growth.gained`. Alternative: a new `growth` stream in `RunState.rng`.
- 2026-11-18: (default) Kill XP is shared by every living party member on the victim's floor within 6 tiles (Chebyshev, no line-of-sight check) of the killer or the victim. Each sharer gets ceil(base × (1 + 0.25 × (n − 1)) / n), so a lone killer gets 100%, and 2 sharers get 62.5% each. Alternatives: the full amount each, or requiring line of sight.
- 2026-11-18: (default) `XP_STEP` lowered from 15 to 8. Solo runs reach a mean level of 12.4 (was 9.1), and 4-member parties a highest level of 10.2 (was 7.3). The Vanguard rolls Brawn 0–2, Finesse 0–1, Wits 1 at 25% and Grit 1–2, the same averages as before.
- 2026-11-18: Done.
