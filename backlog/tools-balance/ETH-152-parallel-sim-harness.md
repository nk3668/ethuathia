---
id: ETH-152
title: Run harness seeds in parallel across CPU cores
type: chore
status: idea
priority: P2
milestone: M1.6
epic: tools-balance
size: S
depends_on: []
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Run `npm run sim` seeds in parallel worker threads, so a T3 sweep (200 seeds per configuration,
`docs/DIFFICULTY_PHILOSOPHY.md` §9) takes about as long as a T1 run does today, with identical results.

## Why
The harness runs seeds one after another. One 200-seed configuration takes 3–4.5 minutes, so a full
milestone sweep (2 presets × party sizes 1–4) takes about 30 minutes, and `--compare` doubles that.
Every seed is independent and deterministic, so they parallelize cleanly. Cutting wall time is the
alternative to cutting seeds, which would cost reliability (§9 "Seed tiers").

## Acceptance criteria
- [ ] `npm run sim` takes `--jobs N` (default: CPU cores − 1; `--jobs 1` keeps today's serial run).
- [ ] The report is byte-identical for `--jobs 1` and `--jobs N` on the same seeds (same per-seed
      results, same order, same summary), with a test proving it on a small seed set.
- [ ] `--compare` runs the ref's harness with the same `--jobs` when that ref supports the flag, and
      falls back to serial for older refs.
- [ ] The sim stays DOM-free and uses no `Math.random()`. Workers only take seeds and return
      `SeedResult`s.
- [ ] `docs/ARCHITECTURE.md` §11.4 documents the flag. `npm run check` passes.

## Notes
- Node `worker_threads` running `tools/headless.ts` per seed batch; `tsx` needs a loader in workers.
- Related: ETH-149 (making `--compare` work inside git worktrees).

## Log
- 2026-11-24: Created after Nate asked whether 200-seed sweeps could be cut (approved filing).
