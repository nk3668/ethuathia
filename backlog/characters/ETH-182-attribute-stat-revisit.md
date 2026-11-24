---
id: ETH-182
title: Revisit attributes and derived stats, starting with Grit
type: spike
status: idea
priority: P2
milestone: M4
epic: characters
size: M
depends_on: [ETH-177]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Look at the four attributes and the stats they drive as a whole, now that there are several classes. Grit is still the weakest attribute per point after ETH-177.

## Why
ETH-177 evened out Brawn and Finesse, but measured Grit at about 0 extra depth per point against +0.35 for Brawn. Fixing that needs Grit to do new work (armor, status resistance that matters, recovery), which is a new mechanic. Nate (2026-11-24): revisit the stats in general in M4.

## Acceptance criteria
- [ ] Spec reviewed by Nate before building (spec gate): what each attribute should mean in play, measured per point with the harness (`--class`, `--recruits`)
- [ ] Proposal for Grit's new job, and any other attribute changes, with a T2 balance check

## Notes
- Related findings from ETH-177: accuracy and evasion clamp at 0, so Finesse below 5 has no penalty; damage and accuracy are fractional but used rounded (ETH-181 fixes the display).

## Log
- 2026-11-24: Created from the ETH-177 review; Nate put it in M4.
