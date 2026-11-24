---
id: ETH-151
title: Formation doctrine: stick together or spread out
type: feature
status: idea
priority: P2
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-145, ETH-071]
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Make the party's cohesion a doctrine choice (`CLAUDE.md` §5.2: formation, stick together / spread
out) instead of the fixed `PARTY_LEASH` constant the baseline AI got in ETH-145.

## Why
ETH-145 found that 75% of deaths in a progressed party of 4 happened with no ally within 6 tiles,
and gave the baseline a fixed regroup leash so it would stop dying scattered. Spreading out explores
faster and suits a strong or ranged party; sticking together is safer. That trade-off is a decision
the player should make (`CLAUDE.md` §1, "Idle decisions matter").

## Acceptance criteria
- [ ] A party-wide doctrine setting with at least *Stick together* (today's leash) and *Spread out*
      (a much looser leash or none), chosen on the Prepare screen alongside ETH-071's doctrine.
- [ ] `PARTY_LEASH` is read through the doctrine, defaulting to today's value, so existing balance
      numbers don't move with the default choice.
- [ ] The regroup trace names the doctrine ("regrouping: formation is Stick together").
- [ ] Codex and tooltip text explain the trade-off, with harness numbers for both settings.
- [ ] Sim tests on a fixed seed and hand-built map for each setting. The party-size ordering (ETH-145)
      holds under the default. `npm run check` passes.

## Notes
- Related: ETH-071 (clear floors vs head for stairs), the other half of party doctrine.
- Check with Nate whether this is unlocked through the Guild Hall or available from the start.

## Log
- 2026-11-24: Created during ETH-145 (Nate chose a new M3 item over extending ETH-071).
