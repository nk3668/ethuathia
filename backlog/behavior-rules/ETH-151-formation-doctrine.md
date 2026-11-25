---
id: ETH-151
title: Formation tactic - Stick together, Loose or Spread out
type: feature
status: idea
priority: P2
milestone: M3
epic: behavior-rules
size: S
depends_on: [ETH-145, ETH-162]
created: 2026-11-24
updated: 2026-11-25
---

## Summary
Make party cohesion the **formation** axis of tactics (`CLAUDE.md` §5.2) instead of the fixed `PARTY_LEASH` constant the baseline AI got in ETH-145.

## Why
ETH-145 found that 75% of deaths in a progressed party of 4 happened with no ally within 6 tiles, so the baseline got a fixed regroup leash. Spreading out explores faster and suits a strong or ranged party; sticking together is safer. That trade-off is the player's decision (`CLAUDE.md` §1).

## Acceptance criteria
- [ ] `tactic.*` formation defs:
  - *Stick together* (today's leash, the default)
  - *Loose* (a wider leash)
  - *Spread out* (a much looser leash or none)
- [ ] `PARTY_LEASH` is read through the formation in `AiCtx`, defaulting to today's value, so balance numbers don't move under the default.
- [ ] The regroup trace names the formation ("regrouping: formation is Stick together").
- [ ] Codex and tooltip text explain the trade-off, with harness numbers for each setting.
- [ ] Sim tests on a fixed seed and hand-built map for each setting. The party-size ordering (ETH-145) holds under the default. `npm run check` passes.

## Notes
- *Stick together* is free; the others are Library unlocks (ETH-163).

## Log
- 2026-11-24: Created during ETH-145 (Nate chose a new M3 item over extending ETH-071).
- 2026-11-24: Nate: doctrines are unlocked through building trees. *Spread out* is unlocked by a Library node (ETH-163); *Stick together* stays the default.
- 2026-11-25: Rewritten for the tactics design: formation is a tactics axis with three options. Depends on ETH-162 instead of ETH-071.
