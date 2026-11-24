---
id: ETH-145
title: Fix the party-size inversion so solo is the hardest way to play
type: bug
status: in-progress
priority: P1
milestone: M1.5
epic: tools-balance
size: M
depends_on: [ETH-133, ETH-134, ETH-135, ETH-136]
created: 2026-11-23
updated: 2026-11-23
---

## Summary
A fully upgraded party of 4 does no better than a fresh solo adventurer, and small tuning changes can
flip it into doing far worse. Find out why, fix the cause, and make "win rate rises with party size"
a checked invariant of the balance harness.

## Why
`docs/DIFFICULTY_PHILOSOPHY.md` §1 (Principles 1 and 6): progression, including more berths, must
make content easier, and solo must be the hardest way to play. Measured on 2026-11-23:

- **Committed `d693b47`, seeds 1–24:** fresh solo won 8/24, progressed party of 4 won 8/24 (+1
  retreat). Three extra berths and two Guild Hall upgrades bought nothing.
- **Uncommitted in-progress tuning in the working tree (50 seeds, same day):** fresh solo won 66% at
  a mean party level of 17.3 (max 32) with 0/33 return-trip deaths; progressed party of 4 won 0% at
  a mean level of 4.2, with 17 of its 200 deaths unattributed (`other`).

The second set shows how fragile the ordering is. The solo adventurer takes all kill XP and can
out-level the Danger curve, while a party of 4 splits it and falls behind. ETH-080 can't tune toward
the §2 bands until the ordering is stable, because levels drown out every other lever.

## Acceptance criteria
- [ ] **Party AI checked first:** watch a few 4-party wipe seeds and confirm or rule out AI faults
      (doorway jamming, allies blocking flee tiles, regroup loops, friendly pathing deadlocks). Fix
      any fault found, with a sim test on a fixed seed and a hand-built map.
- [ ] **Unattributed deaths:** every death in the harness report names a monster, status or hazard;
      `other` is gone or broken down into its real causes.
- [ ] **XP curve:** retune `XP_PER_THREAT`, `XP_PER_DEPTH`, `XP_STEP` and kill sharing
      (`KILL_GROUP_BONUS`, `KILL_SHARE_RADIUS`) so a full delve ends around Level 5–8 for solo *and*
      for a party of 4, with no more than about 2 levels between them.
- [ ] **Party-size encounter surcharge** (`docs/DIFFICULTY_PHILOSOPHY.md` Principle 1, §7): the floor
      threat budget grows per adventurer after the first, as a named shared balance constant
      (`PARTY_SIZE_BUDGET_STEP`) set to the largest value that keeps the ordering below (owner decision
      2026-11-23: small now, ETH-080 tunes it up toward ~10%). It adds headcount or packs only (no stat
      or template changes), the floor tooltip and Codex mention it, and a sim test on a fixed seed shows
      a party of 4 gets a bigger budget than solo.
- [ ] **Party-size ordering holds** with the surcharge on, at 200 seeds for both `--preset fresh` and `--preset progressed`:
      win rate at party 1 < 2 < 3 < 4.
- [ ] **The harness reports the ordering:** a `--party-sweep` option (or an equivalent script) runs
      sizes 1–4 and prints a warning when the ordering is broken, so later balance passes catch a
      regression automatically. `npm run check` passes.

**Handed to ETH-080 (owner decision 2026-11-23):** "party 4 wins at least 2× as often as solo" is no
longer an acceptance criterion here. It depends on absolute win rates, which ETH-080 owns. The
`--party-sweep` keeps printing a 2× warning that says so.

## Notes
- Tune the XP curve before anything else; absolute win rates are ETH-080's job. This item only has to
  get the *ordering* right and levels into the 5–8 band.
- Keep Principle 1: monster *stats* never scale to party size. Fix the ordering through XP sharing,
  AI and pacing. Add the surcharge last, and shrink it if it breaks the ordering.
- Harness flags already exist from the ETH-080 prep commit `2cdb89b` (`--preset`, `--upgrades`,
  `--rules`).

## Log
- 2026-11-23: Created from the ETH-080 review. Split out of ETH-080 as its blocker.
- 2026-11-23: Added the party-size encounter surcharge (Nate: bigger parties face slightly more monsters and packs).
- 2026-11-23: Started. Diagnosis: the baseline had no party cohesion; in 20 progressed seeds 40 of 53 party deaths had no ally within 6 tiles (mean spread 15.8 tiles). Added `cond.party_scattered` / `act.regroup` (leash 8, close 3, only while exploring). Harness: deaths now attributed from the `fell` event (the `other` deaths were poison), mean member level column added, `--party-sweep` added. XP constants left as seeded (levels 5.4-6.5 at every size, no-op). Party-size surcharge added (10% per extra adventurer); at 10% it breaks the ordering, see the open question.
- 2026-11-23: Found during ETH-145: `tools/compare.ts` forwarded only `--seeds/--from/--cap/--party` to the ref, so `--compare REF --preset progressed` silently compared against a fresh baseline. It now forwards `--preset`, `--upgrades` and `--rules` (defaults omitted for old refs), a mismatch in report arguments is an error, and `--party-sweep` is rejected together with `--compare`, `--baseline` or `--json`.
- 2026-11-23: Owner decision (via the coordinator): ship a small surcharge, the largest value that keeps 1<2<3<4 on both presets, and move the 2x rule to ETH-080. At 10% the ordering broke on the progressed preset (26.7 / 26.7 / 25.0 / 31.7% at 60 seeds) and at 5% too (26.7 / 30.0 / 35.0 / 28.3%).
- 2026-11-23: Surcharge tuned at 60 seeds (win % for party 1/2/3/4): progressed 10% 26.7/26.7/25.0/31.7, 5% 26.7/30.0/35.0/28.3, 3% 26.7/33.3/25.0/35.0; fresh 3% 25.0/26.7/25.0/35.0. Every nonzero value broke the ordering on a preset, so `PARTY_SIZE_BUDGET_STEP` ships at 0 (the mechanism is live and tested with an explicit step). ETH-080 tunes it up. `--party-sweep` now labels the 2x line "ratio not met" and says ETH-080 owns it.
