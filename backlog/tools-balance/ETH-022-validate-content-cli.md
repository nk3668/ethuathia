---
id: ETH-022
title: "Run content validation as a tsx command"
type: chore
status: idea
priority: P3
milestone: M1
epic: tools-balance
size: S
depends_on: [ETH-016]
created: 2026-11-16
updated: 2026-11-16
---

## Summary
Make `npm run validate:content` a real command-line script run with `tsx`, like `npm run sim`,
instead of a Vitest file, while keeping the check in `npm test`.

## Why
ETH-015 ran content validation through Vitest because the repo had no TypeScript runner.
ETH-016 added `tsx` for `npm run sim`, so the two tools could work the same way: plain console
output and an exit code a script or CI can use. See `docs/ARCHITECTURE.md` §1.1 and §5.

## Acceptance criteria
- [ ] `npm run validate:content` runs `tools/validate-content.ts` with `tsx`, prints the report and exits non-zero when there are problems
- [ ] `npm test` still fails on bad content

## Notes
Low value on its own; worth doing when the balance harness (M1) touches these tools anyway.

## Log
- 2026-11-16: Created while doing ETH-016.
