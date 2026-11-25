---
id: ETH-194
title: Habits and habit slots - several per adventurer, with exclusive pairs
type: feature
status: idea
priority: P1
milestone: M3
epic: behavior-rules
size: M
depends_on: [ETH-162, ETH-192]
created: 2026-11-25
updated: 2026-11-25
---

## Summary
Ship the **habit** axis (`CLAUDE.md` §5.2). Habits are small behaviors an adventurer can stack, limited by habit slots: 1 to start, up to about 3 through upgrades. The Guild Hall's Rule Clerk becomes a habit-slot node.

## Why
Habits give each adventurer a personality on top of their role. The slot count is the main progression lever for tactics, and Nate wants it tuned by experiment.

## Acceptance criteria
- [ ] Habit defs, each with rule rows built by ETH-162:
  - *Avoids combat* (steers around known threats)
  - *Treasure hunter* (detours for visible or remembered items; there are no secrets or chests until M8)
  - *Finisher* (goes for wounded foes)
  - *Bodyguard* (stays near the party's healer)
  - *Sparing with potions* and *Quick to quaff*, an exclusive pair (different healing thresholds)
  - *Curious* (tests unknown items when safe)
- [ ] *Softens targets* (debuff before attacking) is listed here but ships with ETH-195, which adds the first debuff sources.
- [ ] Habit slots are `capacity(profile, 'habitSlots', 1)`. The Guild Hall's **Rule Clerk** is renamed and re-texted as a habit-slot node, and the `ruleSlots` key becomes `habitSlots` with a save migration.
- [ ] The sim refuses more habits than slots, or both habits of an exclusive pair, and says why.
- [ ] Trace, tooltip, Codex and log text. Hand-map sim tests per habit on a fixed seed. `npm run check` passes.

## Notes
- *Ambusher* waits for sleeping monsters and stealth (ETH-097, M5), and *Secret seeker* for secrets in M8 (Nate, 2026-11-25).

## Log
- 2026-11-25: Created from the tactics design (Nate, 2026-11-25).
