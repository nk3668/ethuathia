---
id: ETH-149
title: Tooling hygiene: formatter policy, line endings and worktree-safe tests
type: chore
status: done
priority: P3
milestone: M1.6
epic: tools-balance
size: S
depends_on: []
created: 2026-11-24
updated: 2026-11-24
---

## Summary
Three small papercuts that slow down agent-driven work: no formatter policy, LF/CRLF warnings on
every git command, and a test that fails in git worktrees.

## Why
Found by the agents implementing ETH-142, ETH-143 and ETH-144 in isolated worktrees.

## Acceptance criteria
- [x] **Formatter:** either add a prettier config matching the current style (and a `format` script),
      or document in `CLAUDE.md` §9 that prettier is not used. Running `npx prettier --write` today
      reformats whole files.
- [x] **Line endings:** add a `.gitattributes` that pins text files to one line ending, so the
      "LF will be replaced by CRLF" warnings stop. Renormalize in a single dedicated commit.
- [x] **Worktree-safe tests:** `test/ui/fonts.test.ts` resolves `node_modules/@fontsource/...` relative
      to the repo root, so it fails in agent worktrees whose `node_modules` lives in the main checkout.
      Resolve the package the way Node does (e.g. `createRequire(...).resolve`), so it passes in both.
- [x] **`--compare` in worktrees:** `tools/compare.ts` runs the ref's harness with this checkout's
      `node_modules/tsx`, which is missing in a worktree. Resolve `tsx` by walking up, or document the
      limitation in `docs/ARCHITECTURE.md` §11.4.
- [x] `npm run check` passes in the main checkout and in a fresh `git worktree`.

## Log
- 2026-11-24: Created from agent reports during the M1.5/M1.6 fan-out (Nate approved filing).
- 2026-11-25: Started. Formatter: documented 'prettier is not used' in CLAUDE.md section 9 (default prettier would reformat 403 of src/test/tools). .gitattributes added (* text=auto eol=lf); renormalization deferred to the orchestrator. fonts test and runRef now resolve packages via createRequire; ARCHITECTURE 11.4 notes it.
- 2026-11-25: Reviewed and merged into m1.5-living-dungeon by the orchestrator (a65d50f); npm run check green in the main checkout (1194 tests) and in the agent's worktree. Renormalization is a near no-op (index already LF); the orchestrator runs it once no branches are open.
