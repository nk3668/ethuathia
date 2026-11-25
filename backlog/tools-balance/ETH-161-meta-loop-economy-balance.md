---
id: ETH-161
title: Meta-loop economy balance pass (M2 capstone)
type: chore
status: done
priority: P1
milestone: M2
epic: tools-balance
size: M
depends_on: [ETH-036, ETH-083, ETH-086, ETH-087, ETH-093, ETH-132, ETH-159, ETH-160, ETH-170, ETH-171, ETH-185, ETH-186, ETH-187, ETH-188]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
Check that currency income per hour and town upgrade costs pace well, from a fresh profile to a fully upgraded Guild Hall and Smithy.

## Why
Every milestone ends with a balance check (`CLAUDE.md` §10, `docs/DIFFICULTY_PHILOSOPHY.md` §9.1). This also covers the Guild Hall pacing pass Nate said he would do later (2026-11-24).

## Acceptance criteria
- [x] The harness reports Renown and Trophies per hour, and the time until each town node becomes affordable
- [x] Target pacing for the first unlocks is written down in `docs/DIFFICULTY_PHILOSOPHY.md`, and the results meet it
- [x] T3 acceptance sweep recorded in the Log

## Targets from Nate (2026-11-24)
- Slower than the first strawman (first unlock about run 5, full party about run 15): pick targets in the spec.
- Every run that gets anywhere buys something or moves a bar; a very fast loss earning little is fine.
- Mastery: a really solid run that completes every objective earns about 5 talent points early on.
- Sets the share of open-building nodes that offers the next building quest (ETH-093).

- Pace with the M2.2 Omens both off and on, and tune the Omen multiplier per rank (ETH-185, ETH-186).
- Watch Extraction Drills (ETH-187): Nate expects it may need a nerf.

## Notes
The tree shape comes from the approved town-tree page (v4); ETH-132 and ETH-159 ship its costs as a starting point for this pass.

## Log
- 2026-11-24: Created in the backlog reorganization by theme.
- 2026-11-24: Added the pacing targets from the progression discussion with Nate.
- 2026-11-24: Now runs after M2.1 (town trees) and M2.2 (minimal Omens); added their items to depends_on.
- 2026-11-25: Rough pass (Nate: keep iterations few). Base `4f1dcfd`.
  - Harness: the report now prints Trophies banked per run and per hour (exit conversions included), and `--pacing` prints runs-to-afford for every Guild Hall and Smithy node (`tools/headless/pacing.ts`).
  - T3, 200 seeds a cell. Fresh sweep 18.5 / 29.5 / 41.5 / 45.0% (2.43x); progressed 21.5 / 33.0 / 39.5 / 47.5% (2.21x). Floor 3+ 100%. Fresh solo income 354 Renown, 197 Trophies a run; progressed x3 480 and 318.
  - Pacing before: the first run bought 5+ nodes, both trees done in ~24 fresh runs. Retune: every Guild Hall and Smithy price x3, the Second Berth 1,200 Renown and the Reinforced Wagon 2,400 Trophies (milestones). After: Second Berth ~run 4 if saved for, Tier I done ~run 20-26, both tiers ~50-75. Targets and numbers in DIFFICULTY_PHILOSOPHY 9.3. Prices only: the sim is untouched, so the sweeps stand.
  - Omens (progressed x3, base 39.5%): Deep Surge r3 30.0% (return-trip deaths 23%), priced. Stalker's Ledger r3 42.0%, Cursed Hoards r3 39.0%, Armed Warbands r1 48.5% / r3 42.5%: free reward, the loot they add offsets the danger. Rewards left as they are pending Nate.
  - Flagged nodes (same base): Artisan Implements 63.0%, Extraction Drills III 47.5%, Field Rations III 42.5%, Forge Stamps 41.0%. Not changed pending Nate.
  - Misses: return-trip lethality 2.6% fresh solo / 5.4% progressed x3 against 15-25%; progressed x4 47.5% is at the band's bottom. Mastery XP: victory median 820 (fresh solo); points per run is set with the M4 trees. Building-quest shares (0.3 / 0.5) kept.
  - Open for Nate before done: the three free Omens (cut rewards or make them bite), the Artisan Implements nerf, return-trip lethality, the ETH-189 milestone.
- 2026-11-25: Nate's answers. Omens: make them more dangerous, filed as ETH-191 (M2.2). Return-trip lethality: left for M5, with new and harder monsters for the return trip. ETH-189 moved to M3. Artisan Implements: nerf.
- 2026-11-25: Artisan Implements was a Vanguard-only outlier: the Flanged mace gave +2 damage over the Oak cudgel, every other class's Tier-1 weapon +1. Mace +3 -> +2 damage (keeps -1 accuracy). Progressed x3, 200 seeds: Vanguard Artisan 63.0 -> 48.0% (base 39.5). Per-class table in DIFFICULTY_PHILOSOPHY 9.3 (Artisan +7.5 to +13, Tailored +3.5 to +15). Class spread at party 3 (Outrider 57%, Reaver 54.5%, Vanguard 39.5%, Lorekeeper 36.5%) noted for M4. Closes when ETH-191 is done.
- 2026-11-25: Done. PR #130 (pacing, harness, mace nerf) and #131 (ETH-191, Omens that bite) merged to main (d5bcb80). M2 is complete.
