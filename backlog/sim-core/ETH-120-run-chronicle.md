---
id: ETH-120
title: Run chronicle: a durable list of a run's notable events, kept apart from the event buffer
type: feature
status: done
priority: P1
milestone: M2
epic: sim-core
size: M
depends_on: [ETH-047, ETH-048, ETH-062]
created: 2026-11-19
updated: 2026-11-19
---

## Summary
A run tracker, `track.chronicle`, keeps every notable moment of a run (a boss engaged, a level-up,
a contract complete, a near death, a fall) as compact plain-data entries for the whole run. The
Highlights view, the run summary, epitaphs, ballads and history read it, instead of the UI's
rolling event buffer, which currently loses early highlights.

## Why
`simStore` keeps only the last `EVENT_BUFFER_SIZE` (500) events, and the log's Highlights filter
(ETH-047) reads that buffer, so after a few hundred turns the run's first highlights are gone.
Nothing durable lists "what happened this run", yet the run summary, epitaphs (ETH-068), ballads
(ETH-103), the nemesis (ETH-101), run history (ETH-048) and the time-away summary all need it.
See `CLAUDE.md` §2 (Run summary) and the "Shared systems" list in `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [x] Sim: `ChronicleEntry = { kind (a highlight id), turn, floor, pos, depth, actors: EntityId[],
      ids: string[] (content ids) }` (plain data, no wording: the UI words it from the kind).
      Each domain says which events are notable in `SimDomain.chronicle`, a map typed per event
      type like `discoveries` (`event → ChronicleEntry | null`), joined into `CHRONICLE_RULES`
      (`registries.ts`) in domain order.
- [x] `track.chronicle` (run domain) reduces events through `CHRONICLE_RULES` into
      `{ entries }`, capped at `CHRONICLE_LIMIT` (default 200) by dropping the lowest-priority
      kind first, never the run's first or last entry. Its extras, `RunResult.extras
      ['track.chronicle']`, are the entries. Invariant `run.chronicle` (sorted by turn, known
      kinds). `STATE_VERSION` + 1.
- [x] Every log-text entry that names a `highlight` has a matching chronicle rule; a test walks
      `LOG_TEXT` and fails on a highlighted event type with no rule (so the two never drift).
- [x] UI: `simStore` reduces incoming events with the chronicle tracker into `chronicle` (as it
      does `discoveries`), and the Highlights filter shows the chronicle, so a highlight from
      turn 5 is still there at turn 5,000. `EVENT_BUFFER_SIZE` stays for the full log.
- [x] The run summary shows a short "Moments" list from the chronicle; the `history` slice keeps
      the top few entries per run (slice version + 1, migration fills `[]`).
- [x] Tests: a fixed-seed run longer than 500 events keeps its first highlight in
      `simStore.chronicle` and in `RunResult.extras`; the cap drops low-priority entries first;
      app-boot smoke test stays green.

## Notes
Who uses it and how:
- **Highlights (ETH-047, done):** the filter reads the chronicle; this item fixes the lost early highlights.
- **Run summary / ETH-048 history:** "Moments" in the summary and kept per run.
- **ETH-068 epitaphs:** the fallen adventurer's last entries feed the epitaph (with ETH-122).
- **ETH-103 ballads:** a ballad is generated from a run's chronicle.
- **ETH-101 nemesis:** the killer and the moment of death come from the chronicle.
- **Time-away** (no item yet): the "While you were away" summary lists chronicle entries from the
  simulated runs.

Open decisions:
- (default) Notability is declared in the sim (`SimDomain.chronicle`) and checked against the UI
  highlight tags by a test — alternative: move the highlight tags themselves into the sim and
  derive both from one place.
- (default) `CHRONICLE_LIMIT` 200 entries per run, priority by kind — alternative: no cap.
- (default) The history slice keeps 5 entries per run — alternative: all, or none.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for Highlights, the run summary, ETH-068, 101, 103 and time-away; fixes the rolling-buffer loss of early highlights).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
- 2026-11-19: Started.
- 2026-11-19: Built. `run/chronicle.ts` (`ChronicleEntry`, `defineChronicleKind`, `momentAt`, `CHRONICLE_TRACKER`, cap, `topMoments`), `SimDomain.chronicle` / `chronicleKinds` joined into `CHRONICLE_RULES` / `CHRONICLE_KINDS`, invariant `run.chronicle`, `STATE_VERSION` 22; `simStore.chronicle` feeds the Highlights filter; run summary "Moments"; `history` v4 keeps 5 moments per run. Docs: ARCHITECTURE "Run chronicle (ETH-120)", shared-systems row built; VISUAL-DESIGN §3.3 and §6.2.
- 2026-11-19: (default) Entries carry an optional `amount` (level reached, HP left, item value, share lost) so the UI can word a moment from the entry alone — alternative: keep the spec's exact shape and word moments without numbers.
- 2026-11-19: (default) `earningsLost` is a chronicle-only kind (not a log highlight or auto-pause option) with `floor`/`pos` null; the event gained `depth` — alternative: make it a log highlight too, or leave it out of the chronicle.
- 2026-11-19: (default) Priorities: adventurerFell 100, contractComplete 90, earningsLost 80, leveledUp 60, valuableFind 40, nearDeath 30, stuck 10 — alternative: any other order.
- 2026-11-19: (default) The run summary shows as many moments as the history keeps (5) so a past run's summary matches — alternative: show more live (e.g. 10) than are kept.
- 2026-11-19: (default) A run loaded from a mid-run save starts the UI chronicle empty (as `simStore.discoveries` does) — alternative: send the chronicle in the snapshot.
