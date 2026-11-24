---
id: ETH-153
title: Scale the return-trip surge with party size
type: chore
status: idea
priority: P2
milestone: M2
epic: tools-balance
size: M
depends_on: [ETH-080]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
The return-trip deep surge (ETH-136) is the same size for every party. Make it grow with party
size, the same way the floor threat budget grows per extra adventurer (`PARTY_SIZE_BUDGET_STEP`,
ETH-145). Then climbing out with the relic is dangerous for a party of 4 too, not just for a lone
adventurer.

## Why
- **The surge only scares solo.** In ETH-080 (T3, 200 seeds at `c2e645e`), the return trip killed
  about 20% of fresh solo relic runs but only about 6–8% of party-of-4 relic runs.
- **The 2× rule needs a follow-up.** The ETH-080 review found that on progressed seeds 201–400,
  party 4 won 1.84× as often as solo (50.5% vs 27.5%). That is under the 2× rule, which seeds
  1–200 met at 2.06×. Nate accepted this for M1.5 (2026-11-24) and asked for a follow-up.
  Scaling the surge by party size is the lever expected to move this ratio.
- **Nate's call** (2026-11-24): "The return trip for larger parties should also be larger
  (proportionally to the size of the party as we did for the initial difficulty tuning)."

## Acceptance criteria
- [ ] **Scaling:** the surge (`surge.countMul` and/or `templateBonus` in `src/content/dungeons.ts`)
      grows for each living adventurer after the first. The step is a named shared balance constant
      next to `PARTY_SIZE_BUDGET_STEP` (or reuses it). It changes headcount and templates only, never
      stats.
- [ ] **Text:** the floor tooltip and the Codex surge text say that the climb out grows with party
      size, and show the figure for the current party.
- [ ] **Sim test:** on a fixed seed, a party of 4 gets a larger surge than solo.
- [ ] **Lethality:** party-of-4 return-trip lethality on relic runs moves toward solo's. Set the
      target from data and report it. Fresh solo stays inside its §2 bands.
- [ ] **T3 check:** `--party-sweep` at 200 seeds on both presets shows 1<2<3<4, and party 4 wins at
      least 2× as often as solo. Check this on **two** seed sets (1–200 and 201–400) so the 2× rule
      isn't an accident of one set. Update `docs/DIFFICULTY_PHILOSOPHY.md` §9.2.

## Notes
- ETH-080 tuned the surge flat: `templateBonus` went from 0.15 to 0.10, and `countMul` stayed 1.1.
  Raising `countMul` alone to 1.2–1.4 only hurt parties, so per-party scaling should be the main
  lever here.
- Filed from ETH-080's out-of-scope ideas (Nate approved filing, 2026-11-24).

## Log
- 2026-11-24: Created from the ETH-080 review (Nate approved). It also carries the 2× follow-up.
