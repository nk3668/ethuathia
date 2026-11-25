---
id: ETH-191
title: Make Stalker's Ledger, Cursed Hoards and Armed Warbands cost win rate
type: chore
status: done
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
- [x] Each of the three loses win rate with each rank, roughly as Deep Surge does for the same reward: about −1 to −3 points at rank 1 and about −8 to −10 at rank 3 (progressed ×3, 200 seeds).
- [x] The levers are the Omens' own numbers in `src/sim/stats/omenEffects.ts`: more and stronger monsters, fewer or weaker finds, fouler curses. Keep the theme of each Omen. Rewards stay as they are unless a lever can't reach the band.
- [x] Rank text in `src/content/townOmens.ts` and the Codex still says what the numbers do.
- [x] The Omen table in `docs/DIFFICULTY_PHILOSOPHY.md` §9.3 is updated with the new numbers and the commit hash.
- [x] `npm run check` is green; T0 with no Omens on shows 0 hash diffs.

## Notes
This tunes inside the M2 capstone's scope, so it may run the 200-seed Omen sweeps itself: `npm run sim -- --seeds 200 --preset progressed --omens <id>:<rank>`.

## Log
- 2026-11-25: Created from the ETH-161 wrap-up (Nate: "make them more dangerous").
- 2026-11-25: Done (`COMMIT`). Progressed x3, 200 seeds, base 39.5% (79 wins), win % at rank 1 / rank 3: Stalker's Ledger 38.0 / 27.5 first try, 38.0 / 32.0 final; Cursed Hoards 38.5 / 32.0; Armed Warbands 35.5 / 31.5. Levers, all in `omenEffects.ts`: Stalker's Ledger finds cut to 10% at every rank, with shift 1 / 2 / 2 and wanderers 8 / 20 / 30 points likelier; Cursed Hoards no longer adds enchantment and leaves 1 / 2 / 3 items off each floor (a new `lootCut` lever read by `gen.loot`), curses 35 / 40 / 50 points of gear and 15 / 20 / 25 of potions and scrolls; Armed Warbands arms 20 / 35 / 55% of threat-3+ monsters with a new +1 damage (`WARBAND_RANKS.damage`), no extra armor, and their dropped gear is plain (a fix in `armedGear` drops a level-0 enchant). Rewards unchanged. Findings: heavier curses alone barely moved Cursed Hoards (+/-1 point at rank 3), since cursed gear is rarely worn; Warbands' armor and +2 or +3 damage were far too strong (rank 3 down to 1% win). Cells carry about +/-5 points of noise (Warbands rank 1 read 42.0, 35.5 and 32.0 at 15%, 20% and 25%); Warbands rank 2 (35%) and Hoards/Stalker rank 2 were not measured. Tests in `test/sim/townOmens.test.ts` updated; T0 (20 seeds, no Omens) shows 0 hash diffs; `npm run check` green.
