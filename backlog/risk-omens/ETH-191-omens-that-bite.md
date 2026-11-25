---
id: ETH-191
title: Make Stalker's Ledger, Cursed Hoards and Armed Warbands cost win rate
type: chore
status: ready
priority: P1
milestone: M2.2
epic: risk-omens
size: S
depends_on: [ETH-186, ETH-161]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Three of the four town Omens pay their reward without costing anything. Make their danger outweigh their upside so each rank lowers the win rate in step with its reward, as Deep Surge already does.

## Why
"Risk is a choice, and it pays" (`CLAUDE.md` §1, principle 3; `docs/DIFFICULTY_PHILOSOPHY.md` §2). An Omen that pays without risk is just a free multiplier. Nate chose (2026-11-25, ETH-161 wrap-up) to make them more dangerous rather than cut their rewards.

## Measured (ETH-161, `4f1dcfd`, progressed party of 3, 200 seeds, base 39.5% win)
| Omen | Rank 1 win % / reward | Rank 3 win % / reward |
|---|---|---|
| Deep Surge (reference, priced) | 38.5 / +10% | 30.0 / +30% |
| Stalker's Ledger | 43.5 / +10% | 42.0 / +30% |
| Cursed Hoards | 39.5 / +10% | 39.0 / +30% |
| Armed Warbands | 48.5 / +12% | 42.5 / +36% |

The likely cause is the loot each one adds: Stalker's Ledger's variants and wanderers carry finds, Armed Warbands' monsters drop enchanted gear that arms the party, and Cursed Hoards' extra enchantments offset its curses.

## Acceptance criteria
- [ ] Each of the three loses win rate with each rank, roughly as Deep Surge does for the same reward: about −1 to −3 points at rank 1 and about −8 to −10 at rank 3 (progressed ×3, 200 seeds).
- [ ] The levers are the Omens' own numbers in `src/sim/stats/omenEffects.ts`: more and stronger monsters, fewer or weaker finds, fouler curses. Keep the theme of each Omen. Rewards stay as they are unless a lever can't reach the band.
- [ ] Rank text in `src/content/townOmens.ts` and the Codex still says what the numbers do.
- [ ] The Omen table in `docs/DIFFICULTY_PHILOSOPHY.md` §9.3 is updated with the new numbers and the commit hash.
- [ ] `npm run check` is green; T0 with no Omens on shows 0 hash diffs.

## Notes
This tunes inside the M2 capstone's scope, so it may run the 200-seed Omen sweeps itself: `npm run sim -- --seeds 200 --preset progressed --omens <id>:<rank>`.

## Log
- 2026-11-25: Created from the ETH-161 wrap-up (Nate: "make them more dangerous").
