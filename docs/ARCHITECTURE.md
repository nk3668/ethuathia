# Ethuathia architecture

The technical design for the game described in [`../CLAUDE.md`](../CLAUDE.md). The look of the
game is in [`VISUAL-DESIGN.md`](VISUAL-DESIGN.md).

Two goals shape everything here:

- **Extensible:** adding a monster, Omen, rule condition, upgrade or floor type should be a
  data entry, not a code change.
- **Reuse:** a small set of shared building blocks (§2) is built once and used by every feature.

Type sketches in this document show intent. Exact names and fields are settled in the backlog
item that builds each piece.

---

## Contracts

The rules every feature item follows, so that many items can be built in parallel without
editing the same files (ETH-055). Read this section before starting an item; the numbered
sections below explain each system in depth. The gates every PR passes are in
[§11 Invariants and gates](#11-invariants-and-gates).

### Domain modules

Sim feature code lives in a **domain**, a folder under `src/sim/`:

| Domain | Folder | Owns | Built by |
|---|---|---|---|
| core | `src/sim/core*.ts`, `state.ts`, `ai/`, `gen/` | turns, movement, doors, perception, the AI engine, the AI trace | M0 |
| stats | `src/sim/stats/` | stat ids, `getStat`, bundles on actors, statuses, attributes, XP | ETH-057, ETH-033, ETH-034 |
| floors | `src/sim/floors/` | dungeon depth, stairs, lazily built floors, descending | ETH-058 |
| combat | `src/sim/combat/` | monsters as actors, attacks, damage, death | ETH-060, ETH-040 |
| items | `src/sim/items/` | items, inventory, equipment, enchantment, identification | ETH-061, ETH-043, ETH-044 |
| quests | `src/sim/quests/` | contracts, bounties, the return trip | ETH-024, ETH-025 |
| run | `src/sim/run/` | run end, run trackers, at-risk rewards | ETH-062 |

The core domain has no folder: its definitions are `coreEvents.ts`, `coreActions.ts`,
`coreCommands.ts`, the top-level fields of `RunState`, the core conditions and rule actions in
`ai/` and the room steps in `gen/`. A new domain is rare; it is one row in `DomainTypes`
(`domain.ts`), one in `DOMAINS` (`domains.ts`), one `extends` entry each on `Entity` and
`RunConfig` (`state.ts`), and one log-text file.

**What a domain's `index.ts` exports** (the six folders start with this template, all empty):

```ts
import { registerInvariant } from '../invariants';

export type CombatEvent = { type: 'attacked'; actor: EntityId; target: EntityId; damage: number } | …;
export type CombatRequest = { id: 'attack'; dir: Pos } | …;          // action requests
export type CombatCommand = never;                                   // UI commands, if any
export interface CombatState { … }      // slice at state.domains.combat (plain data)
export interface CombatSnapshot { … }   // slice at snapshot.domains.combat (plain data)
export interface CombatParts { monster?: MonsterPart }   // optional Entity parts
export interface CombatConfig { … }     // optional RunConfig fields
export interface CombatTypes { event: CombatEvent; request: CombatRequest; command: CombatCommand;
                               state: CombatState; snapshot: CombatSnapshot }

export const COMBAT_ACTIONS: ActionRecord<CombatRequest> = { attack: { … } };  // exhaustive
export const COMBAT_COMMANDS: CommandRecord<CombatCommand> = {};
export function initCombat(config: RunConfig): CombatState { … }
export function combatSnapshot(ctx: SnapshotCtx): CombatSnapshot { … }

registerInvariant('combat.hpRange', (state) => …);   // §11.1: namespaced, at import time

export const COMBAT_DOMAIN: SimDomain<CombatTypes> = {
  actions: COMBAT_ACTIONS, commands: COMBAT_COMMANDS, init: initCombat, snapshot: combatSnapshot,
  conditions: [COND_ENEMY_ADJACENT],   // → CONDITIONS
  ruleActions: [ACT_ATTACK_NEAREST],   // → RULE_ACTIONS
  genSteps: [GEN_POPULATE],            // → GEN_STEPS
  trackers: [KILLS_TRACKER],           // → RUN_TRACKERS (RunTracker<S>, below)
};
```

Split it into more files as it grows (`combat/actions.ts`, `combat/rules.ts`, …) and re-export
from `index.ts`. `src/sim/index.ts` re-exports every domain with `export *`, so new exports
need no edit there.

**The root files only compose**, one line per domain, and feature items don't edit them:

| Root | Composes |
|---|---|
| `domain.ts` | `DomainTypes`, the table of every domain's `<Domain>Types`; `SimDomain`, `SnapshotCtx`, `RunTracker` |
| `events.ts` | `SimEventBody = CoreEvent \| DomainTypes[DomainKey]['event']` |
| `actions.ts` | `ActionRequest` the same way; `ActionDef`, `ActionRecord` and the pipeline (`parseRequest`, `validateAction`, `performAction`) |
| `commands.ts` | `Command` the same way; `CommandDef`, `CommandRecord` and `applyCommand` |
| `state.ts` | `RunState.domains` (`DomainStates`); `Entity extends <Domain>Parts…`; `RunConfig extends <Domain>Config…` |
| `snapshot.ts` | `Snapshot.domains` (`DomainSnapshots`) |
| `domains.ts` | the hub: `DOMAINS` in domain order; `ACTIONS` and `COMMANDS`; fills `CONDITIONS`, `RULE_ACTIONS`, `GEN_STEPS`; `RUN_TRACKERS`; `initDomains`, `domainSnapshots` |
| `registries.ts` | the empty code registries the hub fills |

Rules:

- **State:** a domain's run-wide state goes in its slice (`state.domains.items`), never in a new
  top-level `RunState` field. Per-entity state goes in an optional part declared in its
  `<Domain>Parts`; two domains declaring the same part name fail to compile. Slices and parts
  are plain data (§3.1), and each slice gets invariants (§11.1).
- **Config:** new `RunConfig` fields go in `<Domain>Config` and are optional, so tests and older
  configs need no change. `init` builds the slice from the config and returns fresh data.
- **Snapshot:** a domain's snapshot builder returns fresh plain data sharing nothing with the
  state. Per-member data (statuses, inventory) goes in its slice keyed by entity id, not in
  `PartyMemberView`. UI tests that hand-build a `Snapshot` take `domains` from
  `fixtureDomains()` (`test/ui/fixtures.ts`), so they survive new snapshot fields.
- **Exhaustive at compile time:** `ActionRecord<R>` and `CommandRecord<C>` need exactly one
  definition per request id or command type, and `LogTextRecord<E>` one formatter per event
  type. Since every root union is built from the domain unions and each domain record is
  exhaustive over its own, `ACTIONS`, `COMMANDS` and the log's `LOG_TEXT` are exhaustive too.
- **Ids are global:** action ids, command types and event types must not repeat across domains
  (the hub throws on a duplicate action, command or tracker). Registry ids are namespaced:
  `cond.*`, `act.*`, `gen.*`; invariants `<domain>.*`; trackers e.g. `track.kills`.
- **Load order (determinism and import cycles):** `src/sim/index.ts` loads `domains.ts` first.
  The hub is the only module whose load-time code reads the domains, so registration order is
  the fixed order of `DOMAINS` (core lists first), never the order modules happened to load.
  A domain module must therefore **never import `domains.ts` or `index.ts`**, and never read
  `ACTIONS`, `COMMANDS` or a registry at load time (looking things up inside a function is fine:
  `RULE_ACTIONS.get(id)` from `registries.ts`). It may import values from leaf modules: `core`,
  `content`, `state`, `entities`, `perception`, `goalMap`, `fov`, `floorText`, `coreActions`
  (`isStep`, `stepBlocker`), `registries`, `invariants`, `ai/types`, `ai/navigate`, `gen/*`, and
  the pipeline functions in `actions.ts` and `commands.ts`. Outside the sim, import only from
  `src/sim/index.ts`.

### Where new things go

| To add… | Put it in |
|---|---|
| An event | the domain's `<Domain>Event` union, plus its wording in `ui/shell/logText/<domain>.ts` |
| An action | the domain's `<Domain>Request` union and `<DOMAIN>_ACTIONS` record |
| A command | the domain's `<Domain>Command` union and `<DOMAIN>_COMMANDS` record |
| Run-wide state | the domain's `<Domain>State` and `init<Domain>`, plus invariants; bump `STATE_VERSION` |
| An entity part | the domain's `<Domain>Parts`, plus invariants; bump `STATE_VERSION` |
| A run setting | the domain's `<Domain>Config` (optional field) |
| UI data | the domain's `<Domain>Snapshot` and its builder |
| A rule condition / rule action | `defineCondition` / `defineRuleAction` in the domain, listed in its `conditions` / `ruleActions` (§4) |
| A generation step | `defineGenStep` in the domain, listed in `genSteps`; a floor type names it in content (§3.6) |
| A run tracker | a `RunTracker<S>` listed in the domain's `trackers` |
| A Codex discovery | one line in the domain's `discoveries` map: event type → content ids and marks (see "Codex discoveries") |
| A Codex view of a content kind | a renderer file `src/ui/codex/renderers/<kind>.tsx` (§8.5) |
| Data kept between runs | a profile slice in `src/meta/slices/`, one line in `PROFILE_SLICES` (see "Profile slices") |
| An invariant | `registerInvariant('<domain>.name', …)` in the domain module (§11.1) |
| A stat derivation (attributes, level) | a `StatProvider` in the domain's `statProviders` (Contracts, "Stats") |
| Bundles from a new place (gear, Omens) | a `BundleSource` in the domain's `bundleSources` |
| A trigger kind | a `TriggerKindDef` in the domain's `triggers`, fired with `fireTrigger` |
| Work at the start or end of every actor's turn | the domain's `turnStart` / `turnEnd` hook |
| An effect kind | `Effect` and `effectSchema` in `content/bundles.ts`, one case in `runEffect` |
| A status | `defineStatus` in `src/content/statuses.ts` (data only) |
| Content data | the kind's file in `src/content/` (§5) |

### Log text

`ui/shell/text.ts` holds `LOG_TEXT`, a `LogTextRecord<SimEvent>` joined from one file per
domain, `ui/shell/logText/<domain>.ts` (core included). Each entry is
`{ category, quiet?, text(event, nameOf) }`: `category` is the log filter, `quiet` leaves the
event out of the log (moves and waits), and `text` is the sentence. An event type without an
entry fails to compile. Every new mechanic needs log text (CLAUDE.md §9), and this is where it
goes.

`logLines(events, nameOf)` turns events into `LogLine`s: it drops quiet events, shows a
`ruleFired` only when the adventurer's goal changes, and folds identical consecutive decisions
into the shown line's `repeat: { count, lastTurn }` (ETH-073, docs/VISUAL-DESIGN.md §3.3).
Filters (Highlights, later categories) apply to its output.

**Highlights (ETH-047).** A notable moment (a boss engaged, near death, an heirloom found, a
contract complete, a level-up) is tagged on its log-text entry, not in a central list:

1. Declare the kind once in the domain's log-text file:
   `export const HIGHLIGHT_BOSS = defineHighlight({ id: 'bossEngaged', label: 'A boss is engaged', description: '…' })`.
   `id` is unique across domains (it is saved in the player's auto-pause choices, so never
   rename one); `label` and `description` are the Options text.
2. Name it on each event entry that is that moment: `{ category: 'combat', highlight: HIGHLIGHT_BOSS, text }`.
   Add `highlightWhen(event)` when only some events of the type count (damage that leaves an
   adventurer under 25% HP).
3. The event must say where it happened: it carries `floor: FloorId` and `pos: Pos`. `highlight`
   is a type error on an event without them. Clicking the line centers the map there.

`HIGHLIGHT_KINDS` (`ui/shell/text.ts`) is collected from `LOG_TEXT`, so the log's Highlights
filter and the Options auto-pause list pick up a new kind with no other edit. Auto-pause choices
are all off by default and live in `uiStore.autoPause` for now. The profile has had a
`settings` slice since ETH-062; moving them there is a follow-up.

### Rule conditions, rule actions, generation steps and trackers

Each is a list on the domain's `SimDomain` (see the template). The hub registers the core lists
and then each domain's in domain order, into `CONDITIONS`, `RULE_ACTIONS` and `GEN_STEPS` (in
`registries.ts`) and `RUN_TRACKERS`, so no shared list is edited and the order is fixed. Build
conditions and rule actions with `defineCondition` / `defineRuleAction` from `ai/types.ts`, and
generation steps with `defineGenStep` from `gen/types.ts`.

A run tracker is the interface from §2.4 and §6.4:

```ts
interface RunTracker<S> {
  id: string; init(): S; reduce(state: S, event: SimEvent): S;
  rewards?(state: S): RewardAmounts;   // at-risk currency this state is worth
  extras?(state: S): unknown;          // RunResult.extras[id]; default: the state itself
}
```

`reduce`, `rewards` and `extras` are pure (no randomness, no change to `state` in place). The
framework (ETH-062, `src/sim/run/trackers.ts`):

1. `createRun` starts every tracker at `init()` in `state.domains.run.trackers[id]`.
2. At the **end of each step**, `reduceTrackers` folds that step's events, in order, into each
   tracker's state (tracker order = `RUN_TRACKERS`, domain order). A run's last step includes
   its `runEnded`. Then `rewards.atRisk` is recomputed as the sum of every tracker's
   `rewards(state)` (amounts of 0 left out). Nothing else writes it; the `run.rewardsAtRisk`
   invariant checks that.
3. **At run end `RunResult.extras[tracker.id]` gets `extras(state)`, by default the final
   state**, which is how profile slices read tracker output (the `codex` slice reads
   `extras['track.codex']`). The run domain adds `extras['run.end']`, the `RunEnd`.

A tracker's state is plain data, part of the run state (saved with it) and must not keep
references to event objects. The base trackers are `track.depth` (Renown per floor reached below
the first, `RENOWN_PER_FLOOR` 10), `track.turns` (one Renown per `TURNS_PER_RENOWN` 50 game
turns), `track.kills` (Trophies; a placeholder until ETH-060 adds a kill event, then
`trophiesForKill(difficulty)` per kill) and `track.deaths` (who fell, from `fell` events).

### Run end (ETH-062)

All in `src/sim/run/`:

- **State:** `state.domains.run` holds `rewards.atRisk`, `trackers`, `started`, `leaving`
  (`{ turn, reason: 'ordered' | 'rule', by, announced }` once the party turns back), `fallen`
  (party ids in the order they fell) and `end` (`null` while running, then
  `RunEnd { outcome, turn, cause, depth }`). Once `end` is set, `step` returns `[]` and changes
  nothing.
- **Events:** `runStarted { party: { actor, name, classId, raceId }[], depth }` is the first
  event of the first step (the Codex discovers the party's classes and races from it);
  `turnedBack { actor | null, reason }`; `fell { actor, name, floor, pos, depth }` when a party
  member's HP reaches 0 by any cause (a highlight); `runEnded { outcome, cause, depth }`, always
  a run's last event. The floors domain's stairs action emits `leftDungeon { actor, party,
  floor, pos }` when the party walks out of the first floor's up stairs, which are refused unless
  every living member is gathered there (`stairsGathering`).
- **Ending:** `step` calls `settleRun` after the commands and after every action. It notices the
  party turning back (a `retreat` command, or any `ruleFired` for `act.retreat_run`), new falls,
  `leftDungeon` (a **victory** if at least one victory check applies and all that apply are met,
  else a **retreat**) and nobody alive (a **wipe**).
- **Victory checks** are a registry like the rule registries: `SimDomain.victoryChecks`, joined
  into `VICTORY_CHECKS`. A `VictoryCheck` is `{ id, check(state) → { applies, met, detail } }`.
  Contracts (ETH-024) add theirs; with none registered (now), walking out is a retreat.
- **Result:** `runResult(state)` builds the `RunResult` (a fresh copy); `runReport(state)` is
  `{ result, end }`, what the hosts hand the UI. `lost` stays empty until ETH-023.
- **Heading out:** `cond.heading_out` holds once `leaving` is set; `act.retreat_run` climbs to
  the remembered stairs up and takes them once the floor's living members are gathered (at the
  exit, the whole party); `act.gather { dir: 'up' }` waits. `act.descend` and the down
  `act.gather` refuse while heading out.

### Codex discoveries

The Codex (ETH-065) fills in from sim events. `src/sim/run/codex.ts` defines it:

- A discovery is `{ id, mark }`: a **content id** and how it was met, `seen`, `killed` or `used`.
  `CodexDiscoveries` is `Record<content id, CodexMark[]>`, marks in `CODEX_MARKS` order without
  repeats; the run's tracker state and the profile's `codex` slice share the shape.
- Each domain says which of its events discover what in `SimDomain.discoveries`, a
  `DiscoveryRules` map typed per event type, e.g.
  `discoveries: { monsterSighted: (e) => [{ id: e.monster, mark: 'seen' }] }`. Core's map is
  `CORE_DISCOVERIES` (`coreEvents.ts`: an opened door). The hub joins them into
  `DISCOVERY_RULES` (`registries.ts`), in domain order.
- So an event that should discover something must carry the content id (not only an entity id):
  the rule sees the event alone.
- `CODEX_TRACKER` (`track.codex`, in the run domain's `trackers`) reduces events with those
  rules. The UI also runs it over every event it receives (`simStore.discoveries`), so the Codex
  shows the current run's finds before the run ends.

### Stats

`StatId` is fixed in `src/sim/stats/statIds.ts`: `hp`, `mp` (the maxima; current HP and MP
stay on the actor part), `accuracy`, `evasion`, `damage`, `armor`, `speed`, `sight`, `carry`.
`STAT_IDS` lists them and `isStatId` checks one.

`STAT_INFO` gives each one a label, tooltip text, a `base` (sight 8, all others 0) and a `min`
(max HP 1, all others 0).

**Reading a stat (ETH-057).** Never read a maximum, speed or sight from a field: `ActorPart` holds
only current `hp` and `mp` (plus energy, faction, queued).

- `statValue(state, entity, stat): number` for hot paths (scheduler, AI, combat rolls).
- `getStat(state, entity, stat): StatResult` = `{ stat, value, parts }`, each part
  `{ op: 'add' | 'mul', value, source: { id, label } }` (content id and display name, e.g.
  `{ id: 'race.human', label: 'Human' }`), ready for a tooltip. `getStats` returns all nine.
  Parts that change nothing are left out. Both give the same number.
- **Formula:** value = (sum of `add` parts) × (product of `mul` parts), `Math.round`ed, clamped
  to `STAT_INFO[stat].min`. Parts come from, in order:
  1. **Stat providers** (`STAT_PROVIDERS`): `stats.base` (the entity's `stats.base[stat]`, or
     `STAT_INFO` base, labeled "Base"), then `stats.class_race` (the race's speed), then
     `stats.attributes` (ETH-033, below). **ETH-034 level adds a provider** (`StatProvider`:
     `{ id, contribute(state, entity, stat, sink) }`, calling `sink(op, value, sourceId, label?)`)
     to the end of `STATS_DOMAIN.statProviders`; another domain lists it in its own
     `statProviders`. They run in domain order, then list order.
  2. **Bundle sources** (`BUNDLE_SOURCES`): every active bundle's `modifiers` for that stat, scaled
     by potency (`add`: value × potency; `mul`: 1 + (value − 1) × potency). The stats domain has
     `stats.attached` (`stats.bundles`) and `stats.statuses`. **Gear (ETH-043), run-wide Omens and
     blessings (ETH-067/070) add a `BundleSource`** (`{ id, visit(state, entity, visit) }`, calling
     `visit(bundle, sourceId, potency)`) in their domain's `bundleSources`, so their triggers fire
     too.
- After anything that may lower a maximum, call `clampVitals(state, entity)`; the attach,
  detach, status and expiry helpers already do. `fillVitals` sets HP and MP to full.
- Entities that act carry a `stats` part (`newStatsPart(base?)`): `{ base, bundles, statuses }`.
  A monster sets its numbers in `base` (`newStatsPart({ hp: 6, speed: 120, damage: 2 })`) or
  through a provider reading its def. An actor without the part gets `STAT_INFO` bases only
  (speed 0: it never acts).
- **Attributes (ETH-033) are not stats.** They are inputs that derive these ids. There are four,
  with original names: **Brawn**, **Finesse**, **Wits** and **Grit** (`ATTRIBUTE_IDS` in
  `src/content/attributes.ts`, keys `brawn`… ; each has an `attribute.<key>` def with its name,
  three-letter `abbr` and Codex text, and the Codex shows them always). A class sets all four
  (`ClassDef.attributes`), a race adjusts some (`RaceDef.attributes`, may be negative), and the
  actor's own points sit in `stats.attributes` (optional; leveling raises it; for an actor with
  no class, e.g. a monster, it is the whole value). `attributeValue(entity, attr)` sums them;
  `getAttribute` / `getAttributes` give the parts (class, race, "Trained"/"Base").
  The `stats.attributes` provider applies **`ATTRIBUTE_FORMULAS`** (`src/sim/stats/attributes.ts`,
  the one table of tunable constants): each row adds `(attribute − from) × perPoint` to a stat,
  credited to `attribute.<key>` and labeled with name and value ("Grit 14"). Max HP = Grit + ½
  Brawn, MP = Wits, carry = 2 × Brawn (from 0); accuracy and evasion = Finesse − 10, damage =
  ½ (Brawn − 10) (from `ATTRIBUTE_NEUTRAL` 10, so an average attribute adds nothing and a low one
  subtracts). An entity with no adventurer part and no `stats.attributes` gets no attribute parts,
  so monsters built from `stats.base` alone are unaffected. The snapshot's
  `domains.stats.members[id].attributes` carries each `AttributeResult`.
- Content names stats by id string; `checkGame` checks refs of kind `stat` against `STAT_REFS`.
  A new stat is one entry in `STAT_IDS` and `STAT_INFO`.

### Bundles, effects, triggers and statuses

The API every later item uses (ETH-057, §2.2):

- **Data** (`src/content/bundles.ts`): `Bundle = { modifiers?, effects?, triggers? }`, Zod
  `bundleSchema`, and `bundleRefs(path, bundle)` for a kind's `refs` (stat, status and trigger
  ids). Any def that carries a bundle has a `bundle` field (status, `bundle.*` defs; later items,
  food, Omens), and `bundleOf(id)` finds it. A def kind that embeds one adds `bundle: bundleSchema`
  to its schema and `bundleRefs('bundle', def.bundle)` to its `refs`.
- **Attaching:** `attachBundle(state, entity, bundleId, source?)` and
  `detachBundles(state, entity, source)`; saves keep ids only. `StatsConfig.partyBundles` attaches
  bundles to every party member at the start of a run.
- **Effects:** `runEffect(ctx, effect)` / `runEffects` with `EffectCtx = { state, emit, self,
  other?, source, potency }`. Kinds: `heal`, `damage`, `applyStatus`; each may say
  `to: 'other'` (default `self`). Effects on a missing or dead target do nothing. **A new kind** is
  one member of `Effect` and one option in `effectSchema` (`content/bundles.ts`) and one case in
  `runEffect` (`sim/stats/effects.ts`). The `damage` effect only lowers HP (never below 0, clears
  a queued action at 0) and emits `damaged`; **death is ETH-060's**: combat should handle an actor
  at 0 HP after a `damaged` event, or route this case through its damage pipeline.
- **Triggers:** content writes `{ on: 'trigger.some_kind', effects }`. A trigger kind is a
  `TriggerKindDef` (`{ id: 'trigger.*', name, description, tags }`) listed in the firing domain's
  `triggers`, which the hub registers in `TRIGGERS` (validation checks `on` against it). **To fire
  one**, the domain that owns the moment calls
  `fireTrigger(state, entity, 'trigger.hit', emit, otherId?)` at that moment: it runs every
  matching trigger in the bundles active on `entity`, in bundle-source order, at each bundle's
  potency. For example combat lists `trigger.hit` / `trigger.struck` and fires them after an
  attack lands (attacker and target as each other's `other`). Nested firing stops at
  `MAX_TRIGGER_DEPTH`. The stats domain owns `trigger.turn_start` and `trigger.turn_end`.
- **Turn hooks:** `SimDomain.turnStart` / `turnEnd(ctx: TurnCtx)` run around every actor's turn
  (`step.ts`, via the hub's `runTurnStart` / `runTurnEnd`). An actor left at 0 HP by `turnStart`
  skips its action. The stats domain fires `trigger.turn_start` at the start, and at the end fires
  `trigger.turn_end` and ticks statuses.
- **Statuses** are content (`STATUSES`, `status.*`): `{ bundle, stacking, group?, maxStacks?,
  harmful, glyph }`. `applyStatus(state, entity, statusId, turns, emit, potency = 1)`,
  `removeStatus(state, entity, statusId, emit)` (the whole group), `tickStatuses`. Stacking is per
  def, within a `group` (default: its id): `refresh` keeps one, with the longer remaining turns
  and the stronger potency (the stronger status replaces the weaker); `extend` keeps one and adds
  the turns; `stack` keeps separate instances up to `maxStacks` (default 5), then replaces the
  one with the fewest turns left. **Food buffs (ETH-054)** are `refresh` statuses with one group
  per effect type. Remaining turns count down at the end of each of the holder's turns; at 0 the
  status expires (`statusExpired`). One applied during the holder's own action counts that turn.
  `StatsConfig.partyStatuses` starts the party with statuses.
- **Events** (log text in `logText/stats.ts`): `statusApplied` (with `mode`: `new`, `refreshed`,
  `extended`, `stacked`), `statusExpired`, `statusRemoved`, `healed`, `damaged` (each with
  `source`, a content id).
- **Snapshot:** `snapshot.domains.stats.members[id]` = `{ statuses: [{ status, remaining,
  potency }], stats: Record<StatId, StatResult> }` for each party member. The party card shows
  the statuses as badges; stat tooltips can read `stats`.
- **Codex:** `STATS_DISCOVERIES` marks a status `seen` on `statusApplied`;
  `ui/codex/renderers/status.tsx` shows its effect, stacking rule and whether it is harmful.
- **Invariants:** `stats.values` (every stat finite, max HP ≥ 1) and `stats.parts` (known stat
  ids with finite bases, known bundles, known statuses with whole turns above 0 and potency
  above 0); `core.actors` checks HP and MP against the maxima from `statValue`.

### Rewards

The reward flow, end to end. The sim never touches banked currency.

```
sim events ──► RunTrackers ──► state.domains.run.rewards.atRisk ──► RunResult ──► meta applyRunResult
(step)         (reduce)        (currency id → amount, this run)     (run end)     (banks it; a wipe loses 25%,
                                                                                    then the Omen multiplier)
```

- Trackers turn events (kills, depth reached, conducts kept) into at-risk amounts. Nothing else
  writes `rewards.atRisk`.
- **Currency ids** (ETH-059): `renown`, `trophies`, and `favor:<deity id>` for each deity's
  Favor (`favorKey('deity.dawn')` builds it, `favorDeity(key)` reads it back; both in
  `src/sim/run/result.ts`). Absent means 0.
- At run end the run domain puts the at-risk totals in the `RunResult` (ETH-062). The type is in
  `src/sim/run/result.ts` and is plain data:
  `{ outcome: 'victory' | 'retreat' | 'wipe', atRisk, lost, turns, deepestDepth, extras }`.
  `atRisk` and `lost` are `RewardAmounts` (currency id → amount); `lost` is what a wipe took
  (ETH-023 fills it; empty otherwise) and is never more than `atRisk`. `extras` is an open
  record that later trackers write under their own id (`'track.kills'`).
- `applyRunResult` in meta (§6.4) checks the result (it throws a `RangeError` on a malformed
  one), then runs each profile slice's `onRunResult` step: the `currencies` slice banks
  `atRisk - lost`, the `history` slice records the run. The Omen multiplier is not applied yet;
  ETH-067 adds it, either as a field on `RunResult` or by multiplying in the trackers.
- **Run end to profile (ETH-062):** the host calls `onRunEnded(report)` once, right after the
  update with the run's last events (`HostMessage` `runEnded` from the worker). `App` then calls
  `profileStore.applyRunResult(report.result)`, saves, and opens the run summary through
  `runStore`.

### Profile slices

The `Profile` (§6.1) is composed from slices the way `RunState` is composed from domains. A
feature that keeps data between runs (town, codex, roster, graveyard, presets, settings, Omens,
deities) adds:

1. `src/meta/slices/<feature>.ts` exporting `defineSlice<S>({ version, schema, init, migrations?,
   onRunResult? })`: its type, a Zod schema that validates it on load, its default, its
   migration steps and its step in the `applyRunResult` pipeline.
2. One line in `PROFILE_SLICES` (`src/meta/slices/index.ts`). The `Profile` type, `newProfile`,
   `applyRunResult`, `checkProfile` and the save format follow from it. The order of the record
   is the pipeline order.

Each slice is versioned on its own: change a slice's stored shape by bumping its `version` and
adding `migrations[newVersion]`. A save without the slice starts it at `init()`, so a new slice
needs no migration. The save envelope's own `SAVE_VERSION` changes only if the envelope layout
does (§6.5). Slices are plain data and change only through pure functions that return a new
slice.

The `settings` slice (ETH-062, `src/meta/slices/settings.ts`) holds game settings kept with the
save: `autoRestart` (default `false`) so far. `profileStore.updateSettings(changes)` changes it.

### State version

`STATE_VERSION` (`src/sim/state.ts`) changes whenever the shape of `RunState` changes, entity
parts and domain slices included. **A PR that changes the shape sets it to the version on main
plus one when it rebases**, so two branches never ship different shapes under one number. If
main moved past your version while your PR waited, rebase and bump again. ETH-055 made it 4,
then 5 on main, ETH-058 (the floors slice) 6, ETH-057 7 (the `stats` part; `speed`,
`maxHp` and `maxMp` left `ActorPart`), ETH-033 8 (`stats.attributes`), ETH-062 9 (the run
slice's trackers and run end), ETH-072 10 (the `fountain` feature part), and ETH-061 11
(the `item` and `inventory` parts and the items slice).

### Floors and arrival (ETH-058)

What later items build on, all exported from `src/sim/floors/`:

- **Floors:** `ensureFloor(state, floorId)` returns a floor, building it first if nobody has
  been there. `planFloor` gives its plan without building. Floor ids are `floorIdAt(depth)`
  (`d1` … `dN`); `floorNode`, `stairsTarget(state, floor, dir)`, `isBottomFloor`, `dungeonDepth`
  and `stairsOn` read the graph and the stairs. Each floor's RNG is `floorRngState(seed,
  floorId)`, never a shared stream, so floors don't depend on the order they are reached in.
- **Config:** `depth` (default `DEFAULT_DEPTH`, 10), `floorTexts` (hand-built floors by depth)
  and `floorTurnCap` (default `FLOOR_TURN_CAP`).
- **Arrival hook:** the `stairs` action emits `tookStairs` then `floorEntered { actor, floor,
  depth, firstVisit }`. React to arrivals (depth rewards, contracts, run end at the exit) with
  a run tracker or trigger on `floorEntered`, not by editing the stairs action. The run's first
  floor gets no `floorEntered`.
- **State:** `state.domains.floors` holds `deepest` and `arrived` (the turn the party first
  reached each floor).
- **Party:** `gatheringAt(state, floor, pos)` says who is gathered at a place (chained within
  `GATHER_RADIUS`) and who is missing; `partyOnFloor` lists the living members on a floor.
- **Fountains (ETH-072, `floors/fountains.ts`):** a core feature part
  `{ kind: 'fountain', draughts: string[] }`, the draught ids still in it (drunk from the front;
  empty is dry), rolled by `gen.fountains` from the floor's RNG, so drinking draws nothing. The
  `drink` action (standing on it) emits `drankFountain { actor, fountain, draught, left, floor,
  pos }`, runs the draught's `bundle.effects` on the drinker (source: the draught id), then
  `fountainRanDry` when the last one is gone. Content: `feature.fountain` (states `flowing`,
  `dry`) and the `draught` kind (`draughts.ts`: `weight`, `bundle`, `outcome`). In floor text
  `{` is a fountain holding `TEXT_FOUNTAIN_DRAUGHTS`. **`RunConfig.maxFountains`** caps
  fountains per floor after generation (the first ones kept; nothing else on the floor changes):
  the Dry Wells Omen (ETH-067) sets 0. `carriesHealingPotion(state, actor)` (any pack entry with a `heal` effect, ETH-061) is
  what the baseline's `cond.hurt_no_healing` asks.
- **Loot RNG (ETH-061):** `lootRngState(seed, floorId)` is a second per-floor RNG, used only for
  the items a floor starts with. `generateFloor(type, rng, { depth, loot })` gives it to the steps
  as `FloorDraft.loot` (with `FloorDraft.depth`), so changing loot never moves a wall.

### Items (ETH-061)

All in `src/sim/items/`; content in `src/content/items.ts`.

- **Content:** `ItemDef` = `{ glyph, category, weight, value, stack?, bundle?, loot? }`.
  Categories (`ITEM_CATEGORIES`): `potion`, `scroll`, `food` (ETH-054 fills it), `weapon` and
  `armor` (ETH-043 adds slots), `relic` (ETH-024; never dropped), `gold` (goes to the purse),
  `junk`. `isJunk(def)` (category `junk` or tag `junk` / `corpse`), `isUsable(def)` (its bundle
  has `effects`) and `healAmount(def)` read a def. `bundle.effects` run on use; `bundle.modifiers`
  and `triggers` are for gear (ETH-043 makes equipped items a `BundleSource`). `bundleOf(itemId)`
  works, since the field is called `bundle`.
- **Instances:** `ItemInstance = { def, qty }`, plain data. Later features **add optional
  fields** (equipped slot, enchantment, identified, affixes, heirloom history): no migration, and
  `canStack(a, b)` compares every field but `qty`, so a new field keeps items apart by itself.
  `addToStacks` merges up to the def's `stack`.
- **Where items are:** on a floor, an entity whose `def` is the item id with an `item` part (the
  instance); `placeItem(state, floor, pos, item)` adds one (merging), `itemsAt` / `floorItems`
  find them. Carried, an entry of the actor's `inventory: { items: ItemInstance[] }`
  (`ensureInventory`, `inventoryOf`, `addToInventory`, `takeFromInventory`). Adventurers get the
  part on their first pickup. A `FloorPlan` may list `items`; `addFloor` creates them.
- **Weight:** `carryWeight(state, entity)` against `carryLimit` (the `carry` stat, from
  attributes); `isOverloaded`.
- **Value:** `itemValue(state, item)` (whole stack) and `unitValue` (one) are the only scoring
  function. They start from the def's `value` and apply `ITEM_VALUE_HOOKS` (`value.ts`) in
  order: enchantment, affixes and identification add a hook there.
- **Wanting and dropping:** `wantsItem(state, actor, item)`: never junk; always gold and relics;
  otherwise only if it would survive dropping the least valuable things (`lowestValueIndex`: the
  lowest unit value, the latest entry on a tie) until the pack is within `carry`. So the AI never
  picks up what it would drop, nor drops what it would pick up again.
- **Actions:** `pickup { item? }` (an entity id, default the top item on the tile; gold goes to
  `state.domains.items.gold`), `drop { index, qty? }`, `use { index }` (runs the bundle's effects
  through `runEffects`, source = the item id). Events: `itemSighted`, `pickedUp` (with `value`),
  `goldPickedUp`, `dropped`, `used`; all carry `floor` and `pos`. A `pickedUp` worth at least
  `NOTABLE_ITEM_VALUE` is the `valuableFind` highlight.
- **Memory:** the party remembers items it has seen in `state.domains.items.known[floor][tile]`
  (`KnownItem { def, qty }` lists, stale copies like remembered features). The items
  `turnStart` hook updates it for each party member before it decides (`noticeItems`, emitting
  `itemSighted`); pickup and drop refresh their tile (`rememberTile`). The AI plans on it.
- **Generation:** `gen.loot` (in Hewn Halls after `gen.stairs`) puts `minItems`–`maxItems` items
  on free room tiles, chosen from `lootTable(depth)` by `loot.weight`; gold piles are multiplied
  by the depth.
- **Snapshot:** `snapshot.domains.items` = `{ gold, members[id]: { items: ItemView[], weight,
  carry }, floor: FloorItemView[] }`; `floor` lists items in view now and remembered ones out
  of view, bottom first per tile. The map draws them over features; the selected party card shows
  the pack and the gold.
- **Codex:** `itemSighted` and `pickedUp` mark an item `seen`, `used` marks it `used`.

### Content kinds

Besides terrain, features, classes, races and floor types, these kinds exist as placeholders
with a registry, a minimal schema (the `Def` fields only), a `KIND` in `CONTENT_KINDS` and a
`define*` helper, but no defs: `monster` (`src/content/monsters.ts`),
`contract` (`contracts.ts`), `bounty` (`bounties.ts`), `omen` (`omens.ts`) and `deity`
(`deities.ts`). The owning item extends the def type and the schema together and adds the
defs. `src/content/index.ts` re-exports them with `export *`.

`doctrine` (`src/content/doctrines.ts`, ETH-063) is a placeholder too: party-wide behavior
options that upgrades unlock (below). `building` and `upgrade` (`src/content/upgrades.ts`,
ETH-063) are full kinds; each building's
defs live in `src/content/town/<building>.ts` (§6.2). A kind may add `check(defs)` for rules
that span several defs (`checkKinds` runs it after the ref checks).

ETH-057 added two real kinds: `bundle` (`bundles.ts`, `bundle.*`: a stand-alone bundle such as
a trait or blessing) and `status` (`statuses.ts`, `status.*`, with four first defs: Hasted,
Regenerating, Poisoned, Dazzled; ETH-072 added Keen-eyed and Queasy). ETH-072 added `draught`
(`draughts.ts`, `draught.*`): the fountain table (Mending, Bright, Brackish and Still water).

---

## 1. Layers

```
src/
  core/      seeded RNG, Grid, Registry, ids, number formatting   imports: nothing
  content/   typed data definitions and validation               imports: core
  sim/       deterministic simulation, no DOM                    imports: core, content
  meta/      profile, town, rewards, saves, time-away            imports: core, content, sim
  platform/  storage and window adapters                         imports: core, meta (types)
  ui/        React app, canvas map, input                        imports: everything above
tools/       balance harness, content validation
test/
```

**Rule: imports only point downward.** Two mechanisms enforce it:

1. ESLint `no-restricted-imports` zones per folder, generated from the `LAYERS` table in
   `eslint.config.js`. `platform` may use `import type` from `meta` but not import values.
2. A separate `tsconfig.sim.json` covering `core`, `content`, `sim` and `meta` with
   `lib: ["ES2022"]`, `types: []` and no DOM types. A `document`, `window` or `setTimeout`
   reference in those folders fails to compile.

`test/lint-rules.test.ts` checks the lint rules against the table above, so a change to the
layers must update this section, `eslint.config.js` and that test together.

Because of this rule the simulation runs unchanged in a Web Worker, in tests, in the balance
harness and in time-away catch-up.

### 1.1 Tooling

- **Type-checking** is split into four projects that `tsc -b` runs together: `tsconfig.sim.json`
  (lower layers, no DOM), `tsconfig.app.json` (all of `src/` with DOM types),
  `tsconfig.test.json` (`test/`) and `tsconfig.node.json` (`vite.config.ts` and `tools/`).
  Shared strictness options live in `tsconfig.base.json`.
- **TypeScript is pinned to 6.0.x.** `typescript-eslint` does not support TypeScript 7 yet;
  move up when it does.
- **Tests** live in `test/`, mirroring `src/`, and run in Node. Component tests opt into a DOM
  with a `// @vitest-environment jsdom` comment at the top of the file and use Testing Library
  (`@testing-library/react`, `@testing-library/user-event`).
- **Offline enforcement:** production builds get a `Content-Security-Policy` meta tag
  (`default-src 'self'`, set in `vite.config.ts`) so the browser or webview refuses any request
  to another origin. It is left off the dev server, whose hot reload needs inline scripts.
  Tauri's IPC will need its own `connect-src` entry when packaging is added (§8.4).
- **Fonts** come from `@fontsource` npm packages, so Vite bundles the files. A build plugin
  in `vite.config.ts` copies their OFL license texts to `dist/licenses/`.
- **Commands:** `npm run dev`, `build`, `preview`, `typecheck`, `lint`, `test`, and `check`
  (type-check, lint and test in one go). `npm run sim -- --seeds N` runs headless floors (§10).
- **Command-line tools** in `tools/` run with `tsx` (a dev dependency), which loads the
  TypeScript sources as they are. Node's own type stripping can't, because the sources use
  extensionless imports. `npm run validate:content` is one too (ETH-022): it prints its report
  and exits 1 on problems, and its test runs the same checks in `npm test`.

---

## 2. Shared building blocks

| Building block | What it is | Reused by |
|---|---|---|
| **Registry** | Id-keyed store of content definitions, validated at load | Every content type, Codex, tooltips, saves |
| **Modifiers** | Sourced stat changes; a stat is its base plus all active modifiers | Race, class, gear, statuses, traits, blessings, Omens, upgrades, veteran jobs |
| **Effects** | Data primitives run by one interpreter | Items, spells, traps, altars, blessings, taboo punishments |
| **Triggers** | "When this event happens, run these effects" | Statuses, Omens, heirloom perks, blessings |
| **Actions** | The only way anything changes the world | Baseline AI, behavior rules, monster AI, possession |
| **Sim events** | Typed stream of everything that happened | Log, AI trace, conducts, currencies, Codex discovery, run summary, map animation |
| **Goal maps** | Dijkstra distance maps over a floor | Exploring, fleeing, stairs, regrouping, looting, monster chase |
| **Upgrade engine** | Generic tree of nodes with costs, prerequisites and grants | All town buildings, deity devotion trees |

### 2.1 Registry

```ts
interface Def { id: string; name: string; description: string; tags: string[] }

class Registry<T extends Def> {
  constructor(kind: string)       // e.g. 'monster', used in error messages
  register(def: T): T             // throws on a duplicate id
  get(id: string): T              // throws on an unknown id
  has(id: string): boolean
  all(): readonly T[]             // registration order
}
```

- Ids are namespaced strings: `monster.cave_rat`, `omen.gloom`, `cond.hp_below`.
- Shape is validated with Zod schemas (bundled). After all content is registered, a
  cross-reference pass checks that every id mentioned by another def exists.
- Saves and sim state store **ids only**, never copies of definitions. Content can then change
  between versions without rewriting saves.

### 2.2 Modifiers, effects and triggers: the "bundle"

```ts
interface Modifier { stat: StatId; op: 'add' | 'mul'; value: number; source: string }

type Effect =
  | { kind: 'damage'; amount: Dice; damageType: DamageType }
  | { kind: 'heal'; amount: Dice }
  | { kind: 'applyStatus'; status: string; turns: number }
  | { kind: 'teleport' | 'reveal' | 'spawn'; /* … */ }

interface Trigger { on: SimEvent['type']; filter?: TriggerFilter; effects: Effect[] }

interface Bundle { modifiers: Modifier[]; triggers: Trigger[] }
```

- `getStat(entity, stat)` returns the value **and** the list of contributing modifiers. The
  `source` on each one ("Dwarf", "Iron helm", "Omen: Gloom II") is what the UI shows in the
  number's tooltip, so "every number has a tooltip" costs nothing extra per feature.
- A status effect, a trait, a deity blessing, an Omen rank and an heirloom perk are all a
  `Bundle`. Attaching one to an actor, the party or the run is the same operation.
- New effect kinds are added to the interpreter once and are then available to every item,
  spell and trigger.

As built (ETH-057), the full API is in Contracts ("Stats" and "Bundles, effects, triggers and
statuses"). Differences from the sketch above:

- A content `Modifier` has no `source`: whoever holds the bundle is the source (an attached
  bundle's `source` id, the status id, later the item). `getStat` parts carry
  `source: { id, label }`.
- `getStat(state, entity, stat)` takes the state too, since providers read content and other
  parts; `statValue` is the cheap form.
- `Bundle` also has `effects` (run once by whoever uses it, e.g. a potion), and `Trigger.on` is
  a registered trigger kind id (`trigger.turn_start`), not a `SimEvent` type: the domain that
  owns a moment fires it with `fireTrigger`, so triggers never scan the event stream.
- `heal` and `damage` amounts are whole numbers for now; dice arrive with combat (ETH-060) as
  new fields or a new effect kind.
- Timed statuses are a content kind holding a bundle plus a stacking rule; `runBundles` (§3.1)
  will be a `BundleSource` of the run (ETH-067).

### 2.3 Actions

```ts
interface ActionDef<P> {
  id: string
  validate(ctx: ActionCtx, params: P): Validity   // ok, or a reason it can't be done
  execute(ctx: ActionCtx, params: P): void        // mutates state, emits events
}
```

Move, attack, quaff, pick up, pray, take stairs: each is one `ActionDef`. AI, rules, monsters
and a possessed adventurer all produce actions and submit them through the same pipeline, so a
possessed character can never do something the AI could not, and the reverse.

As built in `src/sim/actions.ts` (ETH-005):

- **Requests are a typed union** keyed by `id` (`wait`, `move`, `openDoor`, `swap`). Move, open
  door and swap take a one-tile step `dir` (`{ x, y }`, each -1, 0 or 1, as in `DIRS_8`).
- **Swap** (ETH-017) trades places with the creature on the next tile. Both must be of faction
  `party` (monsters and neutrals are never swapped with), and `stepBlocker` must allow the step
  both ways. Only the actor spends energy. It emits `swapped { actor, other, from, to }`. The
  action itself doesn't ask whether the other member is willing: the AI decides that (§4), and
  manual control may later let the player swap freely.
- **Definitions live in exhaustive records, not a `Registry`.** Actions are code, not data.
  Since ETH-055 each domain has an `ActionRecord<R>` over its own request union (the core
  actions are `CORE_ACTIONS` in `coreActions.ts`) and the hub joins them into `ACTIONS`
  (Contracts): a request type without a def, or a def without a request type, fails to
  compile. `ActionDef<R>` is generic over the request type. Each `ActionDef` has `name` and `description` (Codex
  and tooltip text), an energy `cost`, and three functions: `parse` builds a clean request from
  untyped data, `validate` returns a reason or `null` and changes nothing, and `execute`.
- **Entry points:** `parseRequest` (for anything crossing into the sim, such as a
  `playerAction` command), `validateAction` (for the AI to check an action before choosing it)
  and `performAction` (for the scheduler, which charges the returned cost). An invalid request
  emits `actionFailed` with the reason and becomes a wait.
- **Movement rules** live in `stepBlocker(state, floor, from, dir)` (`coreActions.ts`), which ignores creatures so
  goal maps can share it: the target must be in bounds and not a wall, a closed door blocks, and
  a doorway (a tile with a door, open or closed) can only be entered or left orthogonally. Move
  adds that another actor's tile is blocked. Diagonal steps are otherwise allowed, including
  between two walls.

### 2.4 Sim events

```ts
type SimEvent =
  | { type: 'moved'; actor: EntityId; from: Pos; to: Pos }
  | { type: 'attacked'; actor: EntityId; target: EntityId; damage: number; hit: boolean }
  | { type: 'died'; actor: EntityId; cause: DeathCause }
  | { type: 'ruleFired'; actor: EntityId; rule: RuleRef; detail: string }
  | /* … */
```

Events are the sim's only output besides snapshots. Consumers:

- **Log:** one formatter per event type, in `ui/shell/logText/<domain>.ts` (Contracts, "Log
  text").
- **AI trace:** `ruleFired` drives the party card intent line and the rules editor counters.
- **Rewards and conducts:** reducers over the stream (§6).
- **Codex:** first sighting of an id marks it discovered.
- **Triggers:** bundles subscribe to events inside the sim.

### 2.5 Goal maps

`buildGoalMap(paths, goals)` gives the cost from every tile to the nearest goal. Stepping
"downhill" approaches the goal; stepping downhill on a flee map gets away from it. Exploration
uses frontier tiles as goals; retreat uses the up stairs; regroup uses allies.

As built in `src/sim/goalMap.ts` (ETH-008):

- **`PathGrid`** is the passability rule as data: a `Uint16Array` cost to step onto each tile
  (0 = can't be entered) and a `Uint8Array` of doorways. `floorPathGrid` builds it from the real
  floor (monsters, tests); `memoryPathGrid` from the party's memory (§3.7), where unseen tiles
  can't be entered and doors are as last seen, so adventurers never path on knowledge they
  lack. Both take `{ closedDoorCost }`: `null` (the default) blocks closed doors like the move
  action does; `OPEN_DOOR_COST` (2: open, then step) lets the AI plan through them and open them
  on the way. Callers may raise costs on the grid before building a map.
- **Step rules match `stepBlocker`** (§2.3): an orthogonal or diagonal step costs the target's
  cost, and a diagonal step can't enter or leave a doorway. `canStep` is the fast version; a
  test compares it with `stepBlocker` for every tile and direction on hand-built and generated
  floors, and another checks every map is a true fixed point under `canStep`.
- **Maps are `i32` `Grid`s**, not `i16`: costs above 1 could overflow 16 bits on a large floor.
  `UNREACHABLE` (the `i32` maximum) marks tiles no goal can be reached from, walls included.
  The algorithm is Dijkstra with a binary heap; distances don't depend on goal order.
- **`stepToward(paths, map, from)`** returns the step (a `DIRS_8` entry) onto a cheapest route:
  the neighbor minimizing value + cost to step there, always lower than `from`. Ties go to the
  first in `DIRS_8` order, so straight steps win. `null` at a goal or where nothing is reachable.
  `pathAlong` repeats it, for previews and tests.
- **Fleeing:** `buildFleeMap(paths, toward)` scales a goal map by `FLEE_FACTOR` (-1.2) and
  relaxes it again, so the walker heads for open ground instead of the nearest dead end, which
  naive "uphill" stepping picks.
- **Speed** (`npm run bench`, 80×40 floor): about 0.36 ms for an open room (the worst case),
  0.08 ms for a rooms-and-corridors floor and 0.6 ms for a flee map, including building the
  path grid. That is cheap enough to rebuild every turn, so there is no cache yet; add one
  (keyed on floor, memory and door changes) when profiling asks for it.

---

## 3. Simulation (`src/sim/`)

### 3.1 State

One `RunState` object, plain data only: no class instances, closures, `Map` or `Set`.

```ts
interface RunState {
  version: number
  rng: Record<RngStream, RngState>     // 'dungeon' | 'combat' | 'loot' | 'ai'
  turn: number
  config: RunConfig                    // party, omens, patron, dungeon variant
  dungeon: DungeonGraph                // floor nodes and their connections
  floors: Record<FloorId, Floor>       // generated lazily on arrival
  entities: Record<EntityId, Entity>
  party: EntityId[]
  runBundles: Bundle[]                 // Omens, blessing: apply to the whole run
  nextEntityId: number
}
```

Inside `step` the state is mutated in place for speed. Determinism is the contract:
**the same seed and the same command sequence always produce the same state.**

As built in `src/sim/state.ts` (ETH-003):

- **Plain data** is defined by `findNonPlain` in `src/core/plain.ts`: `null`, booleans,
  strings, finite numbers, arrays without holes, plain objects, and integer typed arrays. It
  must also be a tree, so no object appears twice: a shared reference would split into two
  copies after a save and load. `undefined`, `NaN`, `Map`, `Set`, class instances and functions
  are rejected. Leave optional fields out rather than setting them to `undefined`.
- **Grids are stored as `GridBuffer`s**: `{ width, height, kind, cells }` with the typed array
  itself. Code that needs the methods calls `Grid.wrap(buffer)`, which shares the cells (like
  `new Rng(state)` for RNG state), so there is no copy or write-back. Typed arrays count as
  plain data because structured clone copies them for the worker. `serialize` writes every
  `GridBuffer` in the state as `{ "$grid": GridData }` (the run-length encoding) and
  `deserialize` turns it back, so a new grid anywhere in the state needs no serializer change.
- `serialize` checks the state is plain data and throws with the offending path. `deserialize`
  throws on another `STATE_VERSION`; migrations belong to the save layer (§6.5).
- `seed` is kept in the state for display and bug reports. `runBundles` is added when bundles
  are built.
- **Floors and terrain:** a `Floor` holds a `u8` terrain grid of `Terrain` codes (`0` wall,
  `1` floor; `TERRAIN_IDS` maps each code to its content id) and the ids of the entities on it.
  Doors and stairs are feature entities on floor tiles, not terrain.
- **Hand-built floors** are written as text (`#` wall, `.` floor, `+`/`'` closed and open door,
  `<`/`>` stairs, `@` party start) and read by `parseFloorText`. `floorToText` prints a floor
  back for tests, and `planToText` prints a generated `FloorPlan`. `RunConfig.floorText`
  supplies a hand-built first floor and `floorTexts` hand-built floors by depth; the rest are
  generated (§3.6).
- **Party memory:** `RunState.memory` holds what the party has seen of each built floor, keyed
  like `floors` (§3.7). `STATE_VERSION` went to 2 when it was added, and to 3 when entities got
  the `ai` part (§4).
- **Domain slices (ETH-055):** `RunState.domains` holds one slice per domain
  (`state.domains.quests`), built by `initDomains(config)` in `createRun` (`createRun.ts`,
  formerly `run.ts`, renamed because `src/sim/run/` is now the run domain). `STATE_VERSION`
  went to 4. See Contracts for where state goes and the version-bump rule.
- **Planned: quest state.** Contracts and bounties (CLAUDE.md §6, Quests) will add quest
  state in the quests domain's slice: the selected contracts and accepted bounties with
  per-quest progress, stored as ids and plain data. The shape is decided in ETH-024.

### 3.2 Entities

```ts
interface Entity {
  id: EntityId
  def: string                 // content id
  floor: FloorId
  pos: Pos
  actor?: { energy: number; speed: number; hp: number; mp: number; faction: Faction }
  stats?: { base: Record<StatId, number>; bundles: AttachedBundle[] }
  inventory?: { items: EntityId[]; equipped: Record<Slot, EntityId | null> }
  ai?: { rules: RuleSet; memory: AiMemory; possessed: boolean }
  item?: { count: number; identified: boolean; cursed: boolean }
  feature?: { kind: 'door' | 'stairs' | 'altar' | 'grave' | 'fountain'; /* … */ }
}
```

This is not a full entity-component system: just one entity type with optional parts, and
systems written as functions over `RunState`. Adventurers and monsters are both actors, so
combat, statuses and inventory are written once.

As built (ETH-003), parts are added by the item that first needs them. So far: `actor`
(energy, current HP and MP, faction), `adventurer` (name, class id, race id), `feature` (door
with `open`, or stairs with `dir`), `ai` (rules and decision memory, ETH-009, §4) and `stats`
(base values, attached bundles and timed statuses, ETH-057; maxima, speed and sight are read
with `getStat` / `statValue`). Adventurers have the def `actor.adventurer`.

- **Ids** are positive integers from `nextEntityId`, never reused in a run. As keys of
  `entities` they iterate in ascending order.
- **Helpers** in `src/sim/entities.ts`: `addEntity` (assigns the id and deep-copies its input, so
  a template object is never shared), `removeEntity` (also drops the id from its floor and the
  party), `moveEntity` (within or between floors), `getEntity`, `getFloor`, `addFloor`,
  `entitiesOnFloor`, `entitiesAt`, `actorAt` and `featureAt`.
- Each floor's `entities` list is the only index. Only the helpers change which floor an entity
  is on, which keeps the list in step. Position lookups scan the floor's list, which is fast
  enough for M0's entity counts; add a position index if profiling says so.
- An entity's `pos` is replaced, never mutated, so two entities never share a position object.

### 3.3 Time

Each tick every actor gains `speed` energy. An actor with at least 100 energy takes one
decision (§4), pays the action's energy cost, and the scheduler moves on. One `step` call
advances the sim until every party member has acted once (a "party turn"), which is the unit
the UI and speed controls work in.

As built in `src/sim/step.ts` (ETH-004):

- **`RunState.turn` counts ticks**, so it is game time: a speed-100 actor acts once per turn,
  a speed-200 actor twice, whatever the party's speed. `ENERGY_THRESHOLD` is 100 and each
  action's cost is its `ActionDef.cost` (100 for wait, move and open door so far). Energy left over carries to the next turn.
- **Order:** actors go in passes in ascending entity id, each acting at most once per pass;
  passes repeat while anyone has enough energy, then the next tick starts. Only actors on a
  floor with a party member are scheduled; other floors stay frozen. Actors with speed 0 or
  HP 0 neither gain energy nor act.
- **A step stops right after the last party member's action**, so actors later in the order
  act at the start of the next step. Party members removed during a step stop being waited for,
  and a party with nobody able to act returns straight after applying the commands.
- **`decide` is pluggable:** `step(state, commands, { decide })` takes a
  `Decide = (ctx: DecideCtx) => ActionRequest`, where the context holds the state, the actor and
  `emit`. The default is the decision engine, `ruleDecide` (§4); `waitDecide` always waits, for
  tests of the scheduler itself. A queued player action (below) takes the place of one decision.
- **A decision that can't be done never stalls the loop:** it emits `actionFailed` and the
  actor waits, paying the wait cost.
- **Party members perceive** before deciding and after acting (§3.7).
- **Turn hooks (ETH-057):** each domain's `turnStart` runs after that first look and before
  deciding (an actor it leaves at 0 HP skips the turn), and `turnEnd` after the action. Energy
  per tick is the `speed` stat (`statValue`), and an actor with speed 0 or HP 0 is not scheduled.

### 3.4 RNG

`sfc32`, seeded from the run seed, with its four-word state stored in `RunState`. The run seed
is split into named streams so that, for example, adding a monster to the spawn table does not
change the dungeon layout for the same seed. `Math.random()` is banned in the lower layers by
a lint rule.

As built in `src/core/rng.ts`:

- `RngState` is a plain `[number, number, number, number]` of unsigned 32-bit words.
  `seedStreams(seed, names)` derives one per stream by mixing the seed with a hash of the
  stream's name, so a stream never depends on which other streams exist.
- `new Rng(state)` wraps a state **without copying it**: drawing advances the array in place,
  so `new Rng(state.rng.combat)` keeps the run state current with no write-back step.
- Helpers: `int(min, max)` (inclusive, unbiased), `float()`, `chance(p)` (always exactly one
  draw, so tuning a probability doesn't shift the rest of the stream), `pick`, `shuffle` (in
  place), `saveState` and `restoreState`.
- A test pins the first outputs for seed 1. Changing the generator or the seeding changes every
  existing seed, so it needs a save migration.

`src/core/grid.ts` holds the `Grid` used for terrain, memory and goal maps: a typed array
(`u8`, `u16`, `i16` or `i32`) whose `get`/`set` throw on out-of-bounds coordinates and on
values that don't fit the cell type. Hot loops use `cells` directly. `toData()` gives a
run-length-encoded `GridData` for saves, and `Grid.fromData` validates it on the way back.
`toBuffer()` and `Grid.wrap` convert to and from the plain `GridBuffer` that run state stores
(§3.1).
Neighbors come in a fixed order, orthogonal steps first (`DIRS_4`, `DIRS_8`).

### 3.5 Public API

```ts
createRun(config: RunConfig, seed: number): RunState
step(state: RunState, commands: Command[]): SimEvent[]
snapshot(state: RunState, viewer: ViewOptions): Snapshot
serialize(state: RunState): string
deserialize(text: string): RunState

type Command =
  | { type: 'setRules'; actor: EntityId; rules: RuleSet }
  | { type: 'setDoctrine'; doctrine: Doctrine }
  | { type: 'possess' | 'release'; actor: EntityId }
  | { type: 'playerAction'; actor: EntityId; action: ActionRequest }
  | { type: 'retreat' }
```

As built (ETH-004): `step` takes an optional third argument, `{ decide }` (§3.3). Events
(`src/sim/events.ts`) are returned as a plain array, never sent on a global bus, and each one is
stamped with the `turn` it happened on; code inside a step records them through an `emit`
function. Commands (`src/sim/commands.ts`) are applied in order before time advances. Because
they can arrive from a worker or a file, each is checked at run time, and a bad one (unknown
`type`, missing actor, unknown action) produces a `commandRejected` event and changes nothing; it
never throws. The only command so far is `playerAction`, which stores the request in the actor's
`queued` field to run in place of its next decision. The others are added with their features.
Since ETH-055 each command is a `CommandDef` (`{ type, apply(state, raw) }`, which returns a
reason or `null` and checks everything before changing anything) in its domain's exhaustive
`CommandRecord`; `playerAction` is in `CORE_COMMANDS` (`coreCommands.ts`), and the hub joins
them into `COMMANDS`. A snapshot also has `domains`, one slice per domain (Contracts).

A `Snapshot` is a read-only view built for the UI: the current floor as the party knows it
(glyph ids, visibility, memory), party summaries with computed stats and current intent, and
run counters. The UI never sees `RunState`.

As built (ETH-010), in `src/sim/snapshot.ts`: `snapshot(state, view?)` where `ViewOptions` is
`{ floor?, follow? }`: a floor id, or (ETH-058) an entity whose floor to show, which the UI sets
to the selected adventurer through `SimHost.setView`; the default is the first living party
member's floor. A `Snapshot` has `turn`, `seed`,
`floor` and `party`. `floor` carries `terrain` (a `Uint8Array` copy of the party memory: 0 never
seen, else 1 + the `Terrain` code), `visible` (the `partyVisible` mask), the remembered
`features`, and `actors` standing on tiles in view only. `party` has one card per member (name,
class, race, position, HP/MP, `alive`, and `intent` from the AI memory). `floor.explored` is the
floor's `explored` count (seen and total floor tiles, §3.7), added for the headless run report
(ETH-016) and ready for an "explored" counter in the UI. Terrain is sent as codes;
the renderer maps them through `TERRAIN_IDS`. Everything is a fresh copy and plain data, so a
snapshot shares no object with the state (a test walks both to check) and posts to the UI
thread as it is.

### 3.6 Dungeon generation

```ts
type GenStep = (floor: FloorDraft, params: unknown, rng: Rng) => void

interface FloorTypeDef extends Def {
  size: { w: number; h: number }
  steps: { step: string; params?: unknown }[]   // ids into a GenStep registry
}
```

A floor type is an ordered list of steps: lay out rooms, connect them, place doors, add
features, place stairs, populate, place graves. Caves swap the layout step for cellular
automata; a big room skips connection. Most steps are shared.

The dungeon itself is a small graph of floor nodes (`DungeonGraph`). M0 and M1 use a straight
line; route forks in M6 add branches with no change to the floor code.

As built in `src/sim/gen/` (ETH-006):

- **Floor types are content** (`src/content/floors.ts`, registry `FLOOR_TYPES`): a size and a
  list of `{ step, params? }`. The first is `floor.halls` (Hewn Halls, 64×32). The steps are
  code, in the sim's `GEN_STEPS` registry (`registries.ts`, filled by the hub from `ROOM_STEPS`
  and each domain's `genSteps`), so content names them by id only.
- **A step is a `GenStepDef`** made with `defineGenStep({ id, …, parse, run })`. `parse` checks
  the untyped params (usually with `readParams`, which fills in defaults and rejects unknown
  keys and out-of-range numbers), and `bind(params)` returns the step ready to run, so `run`
  only ever sees checked, typed params.
- **`generateFloor(type, rng)`** binds every step first, so a bad floor type fails before any
  draw, then runs them in order on an all-wall `FloorDraft` (a `FloorPlan` plus the `rooms`
  that later steps read) and returns the `FloorPlan` for `addFloor`. Errors name the floor
  type, the step's position and its id. `checkFloorType` does the binding alone, for validation.
- **Floors are built lazily (ETH-058).** `createRun` builds the whole dungeon graph, a straight
  line of `config.depth` nodes (default 10), but only the first floor. `ensureFloor` builds the
  others when someone first takes the stairs to them. Each floor is generated from
  `new Rng(floorRngState(seed, floorId))`, a state derived from the seed and the floor id alone,
  so the order in which floors are first reached never changes one; generation draws from none
  of the run's streams. Every generated floor is `DEFAULT_FLOOR_TYPE` (Hewn Halls) until floor
  variety (M6), and the bottom floor's stairs down are left out.
- **Stairs (ETH-058):** the `stairs` action (`{ id: 'stairs', dir }`) on matching stairs moves
  the actor to the linked stairs of the floor above or below (the up stairs when going down),
  or the nearest free tile if someone stands there. The first floor's up stairs lead out of the
  dungeon: taking them with the whole living party gathered there emits `leftDungeon` and ends
  the run (ETH-062, "Run end" in Contracts); otherwise they are refused. A floor keeps its layout,
  features and party memory when left; only floors with a party member on them are scheduled
  (§3.3), so the rest stay as they were left.
- **The rooms-and-corridors steps:**
  - `gen.rooms`: tries random rectangles and carves each one that keeps `gap` wall tiles from
    the others, inside a one-tile wall border.
  - `gen.corridors`: joins the rooms along a minimum spanning tree of their centers (Prim's,
    ties to the lowest index) with L-shaped passages between random tiles of each pair, then
    adds a few extra passages for loops. Every floor tile is then reachable orthogonally.
  - `gen.doors`: puts a door (sometimes open) in some room mouths: tiles of the wall ring round
    a room with floor in front and behind and wall on both sides. That shape fits the
    orthogonal-only doorway rule (§2.3), so a door never cuts a route. No two doors touch.
  - `gen.stairs`: up stairs on a random room tile, down stairs in a random room from the half
    farthest from it by walking distance.
  - `gen.fountains` (ETH-072, in the floors domain): `min`–`max` fountains (Hewn Halls: 0–2) on
    free room tiles, one per room while rooms last, each holding `minDraughts`–`maxDraughts`
    draughts rolled from the weighted `DRAUGHTS` table. It runs after `gen.stairs`, so it never
    shifts the earlier steps' draws.
  - `gen.loot` (items domain, ETH-061): items on free room tiles, drawn from the floor's loot RNG
    (`FloorDraft.loot`) by depth (Contracts, "Items").
- A test floods 200 seeds from the up stairs and checks that every floor tile and the down
  stairs are reached. Seed 1's floor is pinned as text, so any change to a step's draws shows.

### 3.7 Perception

Symmetric shadowcasting for field of view. Each adventurer keeps a memory grid (last seen
terrain and items) and the party shares map knowledge. The snapshot's fog comes straight from
these grids.

As built (ETH-007):

- **FOV** (`src/sim/fov.ts`): `computeFov` is Albert Ford's symmetric shadowcasting, pure and
  independent of run state. If one see-through tile is visible from another, the reverse is
  true too; a test checks every pair on hand-built maps and a generated floor. Slopes are
  integer fractions, so no result depends on floating-point rounding. Opaque tiles are seen
  when light reaches them. The radius is the circle `dx² + dy² <= r² + r`.
- **What blocks sight:** walls and closed doors (`sightBlockers`); open doors don't. The edge
  of the floor blocks too.
- **Sight radius** comes only from `sightRadius(state, actor)`, which is the `sight` stat
  (`statValue`, base `BASE_SIGHT_RADIUS` = 8). Gloom, blindness and light sources change it with
  `sight` modifiers in a bundle (the Dazzled status: −3).
- **Memory is the party's, one per floor:** `RunState.memory[floorId]` rather than a grid per
  adventurer, since party members share everything they see. `addFloor` creates it empty.
  `terrain` is a `u8` grid of 0 (never seen) or 1 + the `Terrain` code last seen;
  `features` copies each seen feature (`def` and part) by tile index. Tiles out of view keep
  their last known state, so a door shut behind the party is still remembered open. Monsters
  are never remembered. Items are remembered by the items domain in its own slice
  (`state.domains.items.known`, ETH-061; Contracts, "Items").
- **When it updates:** `createRun` records what the starting party sees, and in `step` each
  party member perceives before deciding (§5.1) and again after acting, so the memory already
  includes what a move revealed when the step returns. Other actors don't perceive yet.
- **Reading it:** `explored(state, floorId)` gives seen and total floor tiles (walls don't
  count) and their fraction, for stuck detection and "floor explored ≥ X%" rules.
  `partyVisible` is the "in view" mask for the snapshot's fog; anything remembered and not in
  view is drawn as memory.

---

## 4. AI: one decision engine

```
decide(actor) = possession input  >  behavior rules, top to bottom  >  baseline rules
```

```ts
interface Rule { condition: { id: string; params: unknown }
                 action:    { id: string; params: unknown }
                 enabled: boolean }

interface ConditionDef extends Def {
  paramSchema: ParamSchema
  evaluate(ctx: AiCtx, params: unknown): { ok: boolean; detail: string }
  describe(params: unknown): string            // "HP below 30%"
}

interface RuleActionDef extends Def {
  paramSchema: ParamSchema
  resolve(ctx: AiCtx, params: unknown): ActionRequest | null   // null: not valid right now
  describe(params: unknown): string            // "quaff best healing potion"
}
```

- The engine walks the rule list and takes the first rule whose condition is true and whose
  action resolves. It then emits `ruleFired` with the condition's `detail`.
- **The baseline is a rule set too.** Explore the frontier, fight adjacent enemies, flee at
  low HP, leave a finished floor, get unstuck: these are built-in rules appended after the
  player's. Nothing is special-cased, and each baseline behavior is also a rule action the
  Library can hand to the player.
- **Monsters use the same engine** with rule sets from their content definitions.
- **The rules editor is generated from the registries.** `paramSchema` describes each
  parameter (percentage, item category, target choice) and `describe` renders the row. A new
  condition appears in the editor as soon as it is registered and unlocked.
- **Stuck detection** lives in `AiMemory`: if position and explored percentage are unchanged
  for N turns, the current goal is dropped, a different one is chosen and the change is logged.
- **Presets and doctrine** are data: a preset is a saved `RuleSet`; doctrine is a small set of
  party-wide parameters that conditions and actions read from `AiCtx`.

As built in `src/sim/ai/` (ETH-009):

- **The engine is `ruleDecide`**, the default `Decide` of `step` (§3.3). An actor is AI-driven
  when it has an `ai` part (`{ rules, memory }`, plain data); adventurers get one in `createRun`
  with no rules of their own. Actors without one (monsters, until they get rule sets in M1)
  wait with no trace.
- **Registries live in the sim, not content:** `CONDITIONS` and `RULE_ACTIONS` are `Registry`s
  of code (they read run state), built with `defineCondition` / `defineRuleAction`, which parse
  the rule's `params` before `evaluate`, `resolve` or `describe` see them (`noParams` for none).
  Ids are `cond.*` and `act.*`. `paramSchema` arrives with the rules editor (M3). Since ETH-055
  the registries live in `registries.ts` and the hub fills them: the core lists
  (`CORE_CONDITIONS`, `CORE_RULE_ACTIONS`) first, then each domain's (Contracts).
- **Walking the rules:** the actor's own rules, then `BASELINE_RULES`. A rule is taken if it is
  enabled, isn't a dropped goal, names a registered condition and rule action with good params,
  its condition holds, and its action resolves to a request that passes `validateAction`.
  Anything else is skipped, never an error. `chooseRule` does the walk without side effects.
- **Trace:** `ruleFired { actor, rule: RuleRef, condition, action, detail }`, where `RuleRef` is
  `{ set: 'own' | 'baseline', index }` and `detail` reads "Explore: heading for unexplored ground
  6 turns away", with the condition's detail in brackets when it has one. The same is kept as
  `ai.memory.intent` for the party card.
- **Baseline rules**, in order (0-based indices, as of ETH-061):
  0 `cond.wounded { percent: 35 } → act.quaff_healing`, 1 `cond.overloaded → act.drop_lowest`,
  2 `cond.stuck → act.back_off`, 3 `cond.heading_out → act.retreat_run`,
  4 `cond.heading_out → act.gather { dir: 'up' }`, 5 `cond.floor_overstayed → act.descend { regroup: false }`,
  6 `cond.hurt_no_healing { below: 50 } → act.drink_fountain`, 7 `cond.always → act.pick_up { maxDetour: 8 }`,
  8 `cond.always → act.explore`, 9 `cond.always → act.descend`, 10 `cond.always → act.gather`,
  11 `cond.bottom_floor → act.retreat_run`, 12 `cond.always → act.wait`. Tests should find an
  index with `BASELINE_RULES.findIndex` rather than hard-code it. So a hurt adventurer drinks
  its own healing potion below 35% HP first, and walks to a fountain below 50% only when it
  carries none. The items ones (ETH-061) are spliced in from `ITEMS_BASELINE_URGENT` and
  `ITEMS_BASELINE_LOOT` (`src/sim/items/rules.ts`): `act.quaff_healing` drinks the healing
  potion that best covers the missing HP; `act.drop_lowest` drops the least valuable droppable
  thing (as many of a stack as it takes to get within carry); `act.pick_up` picks up a wanted
  item on the tile, or walks to the nearest remembered wanted one within `maxDetour` steps.
  `act.drink_fountain` (ETH-072, `src/sim/floors/fountains.ts`) walks to the nearest remembered
  fountain that isn't dry and drinks. The heading-out ones (ETH-062) are in
  `src/sim/run/rules.ts`; the floors ones (ETH-058) in `src/sim/floors/rules.ts`:
  - `act.descend` heads for the remembered stairs down and takes them. With `regroup` (the
    default) a member on the stairs takes them only when every living member on that floor is
    gathered (`gatheringAt`: within `GATHER_RADIUS`, 2, of the stairs or of a gathered member,
    so a queue in a corridor counts), and a gathered member doesn't crowd stairs someone stands
    on. Members on other floors are not waited for. It can't be done before the stairs down
    are seen or on the bottom floor.
  - `act.gather` (`idle`) waits at the stairs meanwhile: "waiting at the stairs down for Mira".
  - `cond.floor_overstayed` holds once the party has been on the floor `floorTurnCap` game
    turns (default `FLOOR_TURN_CAP`, 1000), the safety net: the baseline then heads down
    without exploring further or waiting.
  - `cond.bottom_floor` holds on the bottom floor, where the baseline, with nothing left to
    explore, fires `act.retreat_run`: the party turns back, climbs out and the run ends as a
    retreat (ETH-062; a victory once contracts add victory checks).
  - `act.explore` is frontier-based: the goals are tiles the actor could enter (on the party
    memory's path grid, closed doors at `OPEN_DOOR_COST`) with an unseen neighbor. Standing on one
    always reveals its neighbors, so each goal reached shrinks the frontier, and explored dead
    ends are never goals nor on a shortest route to one. A closed door next on the route becomes
    `openDoor`; another actor on the next tile becomes a wait ("waiting for X to get out of the
    way"), recorded as `memory.waitingFor`, unless it is a party member willing to swap
    (`willingToSwap`, ETH-017): one whose own last decision waited on this actor, or one with no
    decision yet or an `idle` one. Then it becomes a `swap` ("squeezing past X"). A member busy
    heading elsewhere is waited behind, never pushed back the way it came. This lives in
    `followMap`, so every map-following rule action gets it. It returns `null` once no frontier tile is reachable, and the actor settles on
    `act.wait`. Tiles where the actor knows another actor stands (party members, anyone adjacent)
    cost `OCCUPIED_COST` (8) more, so it routes round them when it reasonably can.
  - `act.back_off` follows a flee map away from where the actor got stuck, with occupied tiles
    blocked.
  - `act.wait` is marked `idle`.
- **Stuck detection** runs before the walk. Each decision records the actor's floor, position and
  the party's seen-tile count (`memory.last`). After `STUCK_TURNS` (10) decisions in a row with
  none of them changing while the last rule fired was not `idle`, that rule becomes
  `memory.dropped` and is skipped for `DROP_TURNS` (20) turns, a `stuck` event says why, and
  `cond.stuck` holds meanwhile, so the actor backs off and then waits until the goal comes back.
- **Speed:** a lone adventurer explores a generated Hewn Halls floor in about 200 party turns
  (280 at worst over seeds 1–100), and 100 such floors run in about 3 s in the test suite. A
  ten-floor dungeon takes a lone adventurer about 2,400 turns and a party of four about 1,200.
  `frontier` scans the floor with plain loops (no closures) since it runs at every exploring
  decision.

---

## 5. Content (`src/content/`)

- One folder per type (`monsters/`, `items/`, `classes/`, `races/`, `omens/`, `deities/`,
  `upgrades/`, `floors/`, `conditions/`, `ruleActions/`, `text/`).
- Definitions are written through helpers such as `defineMonster({...})`, which give type
  checking in the editor and register the result.
- Every def carries what the Codex and tooltips need (`name`, `description`, `tags`, and
  `glyph` and `color` where it appears on the map). There is no separate Codex data to keep in sync.
- Log lines and UI labels for mechanics are templates under `text/`
  (`"{actor} hits {target} for {n}"`), keyed by event type or content id.
- `tools/validate-content` runs the same validation as game start-up, and is part of `npm test`.

As built (ETH-015):

- **Layout:** one file per type for now (`terrain.ts`, `features.ts`, `classes.ts`, `races.ts`,
  `floors.ts`); a type moves into its own folder when it grows. Each file holds the def
  interface, its `Registry`, a `ContentKind` (`{ registry, schema, refs? }`), a `define*` helper
  that registers a def with type checking, and the defs themselves. `CONTENT_KINDS` in
  `registries.ts` lists every kind. Monster, item, contract, bounty, omen and deity are
  placeholder kinds with no defs yet (Contracts, "Content kinds").
- **Schemas are Zod 4** (`zod`, bundled), built from shared pieces in `schema.ts`: `defShape(prefix)`
  (an id in the kind's namespace, a non-empty name and description, lowercase tags),
  `glyphSchema` (one character, a lowercase `#rrggbb` color, optional `bold`) and number
  helpers. Objects are strict, so a misspelt field fails. Defs are checked against the schema,
  never rebuilt from it, and Zod runs `jitless` because the built app's CSP forbids eval.
- **`checkKinds(kinds, targets)`** returns every problem as a line naming the def and field:
  `class "class.frail": hp: must be above 0`, or `class #2 (no id)` when the def has no usable
  id. Then, for defs whose shape is valid, it checks each id from `refs(def)` against the kind's
  registry by `kind` name, among the content kinds and `targets` (code registries such as the
  sim's `GEN_STEPS`): `floor type "floor.x": steps[1].step refers to unknown generation step
  "gen.mazes"`. A ref to a kind with no registry given is a problem too. `checkContent` and
  `validateContent` run it over `CONTENT_KINDS`; the latter throws a `ContentError` with every
  problem in `problems` and the message.
- **Start-up:** the sim's `checkGame` / `validateGame` (`src/sim/validate.ts`) add what only the
  sim can check: floor types' steps against `GEN_STEPS` and their params with `checkFloorType`,
  `TERRAIN_IDS` and the feature ids in `DEFS` (which are now taken from the content defs), and
  the baseline rules' condition and rule action ids. `main.tsx` calls `validateGame()` before
  rendering. `tools/validate-content.ts` reports the same problems plus a count per kind. It runs
  with `tsx` as `npm run validate:content` (exit code 1 on problems), and its test runs the
  same `checkGame` in `npm test`.
- **Lookups:** `findDef(id)` finds a def of any kind (the UI's `contentName` uses it, falling back
  to the id for things without defs yet); `findGlyph(glyphId)` gives the map look for a terrain or
  feature id, or a feature id plus a state (`feature.door.open`) from the feature's `states`,
  falling back to its plain `glyph`.
- **First defs:** terrain `wall` and `floor`; features `door` (states `closed` and `open`),
  `stairs_up` and `stairs_down`; class `class.vanguard`; race `race.human`; floor type
  `floor.halls`. A class sets starting `attributes`; a race adjusts them and sets `speed`.
  The `stats.attributes` and `stats.class_race` stat providers turn them into labeled stat
  parts (ETH-033, ETH-057); `createRun` checks them (`adventurerActor`) and throws, naming the adventurer, on
  an unknown class or race. `actor.adventurer` is not a def: an adventurer's look comes from its slot.

---

## 6. Meta (`src/meta/`)

### 6.1 Profile

Everything that persists between runs:

```ts
interface Profile {
  currencies: { renown: number; trophies: number; favor: Record<DeityId, number> }
  upgrades: { owned: string[] }               // upgrade node ids
  roster: Adventurer[]
  graveyard: Gravestone[]
  codex: { discovered: string[] }
  presets: Record<string, RuleSet>
  settings: Settings
  history: RunSummary[]                       // recent runs, for stats and time-away estimates
}
```

The profile is changed only by pure functions: `purchase(profile, nodeId)`,
`respec(profile, groupId)`, `applyRunResult(profile, result)`. They return a new profile, which
makes them easy to test and safe to autosave after.

As built (ETH-059), `src/meta/profile.ts` composes the profile from slices (Contracts, "Profile
slices"). The slices so far are `currencies` (banked Renown, Trophies and Favor per deity id,
`{ renown, trophies, favor: Record<deity id, number> }`), `history` (lifetime totals and the
last `HISTORY_LIMIT` (20) runs as `RunRecord`s), `upgrades` (owned upgrade node ids, §6.2) and `codex` (ETH-065: `{ entries: CodexDiscoveries }`, merged from `extras["track.codex"]`, Contracts "Codex discoveries"). `checkProfile(profile)` returns one line per
problem. Currency names and tooltip text are `CURRENCY_INFO` in `src/meta/currencies.ts`.

### 6.2 Upgrade engine

```ts
interface UpgradeNode extends Def {
  tree: string                     // 'guild_hall', 'smithy', 'deity.<id>', …
  tier: number; column: number     // layout hints for the node graph
  cost: Partial<Record<CurrencyId, number>>
  requires: string[]               // node ids
  exclusiveGroup?: string          // pick one of the nodes sharing this group
  grants: Grant[]
}

type Grant =
  | { kind: 'bundle'; scope: 'party' | 'run'; bundle: Bundle }
  | { kind: 'unlock'; id: string }                // class, race, condition, Omen, floor type…
  | { kind: 'capacity'; what: CapacityId; amount: number }   // rule slots, party size…
```

One engine and one tree view serve every building. `isUnlocked(profile, id)` and
`capacity(profile, what)` are derived from owned nodes, so nothing else tracks unlock state.

As built (ETH-063):

- **Content** (`src/content/upgrades.ts`): two kinds. `building` (`building.guild_hall`, plain
  `Def`) and `upgrade` (`UpgradeNodeDef`: `building`, `tier` from 1, `column` from 0, `cost` keyed
  by currency id `renown` / `trophies` / `favor:deity.<id>`, `requires`, optional
  `exclusiveGroup`, `grants`). Grants are `{ kind: 'bundle', scope: 'party' | 'run', bundle }`,
  `{ kind: 'unlock', id }` and `{ kind: 'capacity', key, amount }`. `bundle` is the shared
  `Bundle` (§2.2, `bundleSchema` plus a check that it has a modifier or trigger; its refs come
  from `bundleRefs`). Capacity keys and their tooltip names are `CAPACITY_INFO` (`partySize`,
  `rosterSize`, `contractSlots`, `ruleSlots`); a new capacity is one entry there.
- **Doctrine choices** (e.g. "Prioritize clearing floors" vs "Prioritize the stairs") are
  `unlock` grants of `doctrine.*` ids in a pick-one group, with no separate grant kind. The
  placeholder `doctrine` kind exists so those ids validate. The doctrine item adds the defs
  and reads `isUnlocked(profile, 'doctrine.x')` to offer each one.
- **Validation:** refs (building, prerequisites, Favor deities, stats against `STAT_REFS`, unlock
  ids against the registry named by their prefix; `checkGame` also passes `CONDITIONS` and
  `RULE_ACTIONS` for Library unlocks), plus `ContentKind.check`, a new optional hook for rules
  spanning several defs: a prerequisite must be in the same building on an earlier tier (which
  rules out cycles), a pick-one group has 2+ nodes on one tier of one building, and no two
  nodes share a cell.
- **A new building** is a file in `src/content/town/` (its `defineBuilding` and
  `defineUpgrade`s) and one line in `town/index.ts`, plus, only if the generic tree isn't
  enough, a component and one line in `BUILDING_PANELS` (`src/ui/town/panels.ts`).
- **State:** the `upgrades` profile slice, `{ owned: string[] }` in purchase order. Ids no
  longer in content are kept and ignored.
- **Engine** (`src/meta/upgrades.ts`, pure): `canPurchase(profile, id)` (`{ ok }` or a
  `status` of `owned` / `excluded` / `locked` / `expensive` / `unknown` with a `reason` for the
  tooltip), `nodeStatus`, `purchase` (throws a `RangeError` with the reason),
  `respecPlan(profile, group)` and `respec`: the chosen node and every owned node that needs it
  are given up and refunded in full, less a fee of `RESPEC_FEE_RATE` (50%) of the chosen
  node's cost. `profileGrants(profile)` returns `{ source, grant }[]` for `buildRunConfig`
  (ETH-064); `capacity(profile, key, base)` and `isUnlocked(profile, id)` derive from it.
  `describeGrant` words a grant for tooltips and the Codex.

### 6.3 From profile to run

`buildRunConfig(profile, choices)` turns the Prepare screen's choices into the `RunConfig` the
sim takes: party members with their bundles, rule sets, patron blessing, Omen bundles and the
reward multiplier, the dungeon variant, and any gravestones to place.

### 6.4 Rewards and conducts

```ts
interface RunTracker<S> { init(): S; reduce(state: S, event: SimEvent): S }
```

Currency earnings and each conduct are small trackers over the event stream. At run end their
states become the `RunResult`, and `applyRunResult` applies the Omen multiplier and updates the
profile. A new conduct is one tracker plus a content entry.

### 6.5 Saves (`src/platform/`)

```ts
interface SaveStore { load(): Promise<string | null>; save(data: string): Promise<void> }
```

Implementations: Tauri file in the app data folder, IndexedDB for the dev browser tab, and an
in-memory store for tests. The save is a versioned envelope
`{ version, profile, activeRun? }`; loading runs every migration from the save's version to the
current one. Export and import use the same string. Autosave runs on a timer, at run end and
on window close.

As built (ETH-059):

- `src/platform/saveStore.ts`: `SaveStore { label, load, save, clear }` with
  `MemorySaveStore`, `IndexedDbSaveStore` (database `ethuathia`, store `saves`, key `profile`)
  and `TauriSaveStore`, a stub that rejects every call until packaging lands (§8.4).
  `createSaveStore()` picks IndexedDB, or memory where there is none (jsdom).
- `src/platform/autosave.ts`: `startAutosave(save, { intervalMs, target })` saves every 30 s
  and on `beforeunload`, `pagehide` and the page becoming hidden.
- `src/meta/save.ts`: `encodeSave(profile, savedAt)` and `decodeSave(text)`. The envelope is
  `{ format: 'ethuathia.save', version: SAVE_VERSION, savedAt, slices: { <key>: { version, data } } }`.
  Loading runs `ENVELOPE_MIGRATIONS` up to `SAVE_VERSION`, then each slice's own migrations,
  then its schema; it never throws and returns `{ ok: false, error }` for a save it can't read
  (not a save, from a newer game, damaged, invalid). A missing slice starts at its default and
  an unknown one is dropped, both with a note. The mid-run `activeRun` is not saved yet.
- `profileStore` (§8) loads on start; while loading, or after a failed load, it writes nothing,
  so an unreadable save is never overwritten until the player imports a save or resets. The
  Options tab's Save section has save now, export as text or to a file, import from text or a
  file, and a hard reset behind a confirmation.

### 6.6 Time-away

On load, the elapsed time (capped, 8 hours by default) becomes a budget of party turns run on
the `InlineHost` (§7). If a wall-clock limit is hit first, the remainder is estimated from the
averages in `profile.history`, and the "While you were away" summary says which part was
simulated and which was estimated.

---

## 7. Running the sim: `SimHost`

```ts
interface SimHost {
  start(config: RunConfig, seed: number): void
  send(command: Command): void
  setSpeed(speed: 0 | 1 | 2 | 4 | 8 | 'max'): void
  onSnapshot(cb: (s: Snapshot) => void): void
  onEvents(cb: (e: SimEvent[]) => void): void
}
```

- **WorkerHost:** runs the sim in a Web Worker. It steps on a timer according to speed, sends
  at most about 30 snapshots per second however fast the sim is running, and batches events.
- **InlineHost:** runs the sim synchronously with no timers, for tests, the balance harness
  and time-away catch-up.

As built (ETH-010):

- **Where it lives:** the pure parts are in `src/sim/host/`: the `SimHost` interface, `Speed`
  (`0 | 1 | 2 | 4 | 8 | 'max'`, 0 is paused), `SimSession` (a run plus its queued commands,
  which both hosts step through, so they produce the same events), `InlineHost`, `PacedRunner`
  and the worker message protocol. Only the code that needs worker globals and timers is in
  `src/ui/host/`: `serveSim` (the worker side), `sim.worker.ts` (its entry) and `WorkerHost`.
  `meta` can therefore use `InlineHost` for time-away.
- **Interface:** as sketched, plus `dispose()` and (ETH-058) `setView(view)`, which sets the
  `ViewOptions` later snapshots use and, with a run going, sends one at once; it is kept across
  `start`. `App` sets it to `{ follow: selected }` whenever the selection changes. `onSnapshot` and `onEvents` return an
  unsubscribe function. An update is delivered as the events since the last one (one batch,
  never empty) followed by the snapshot after them. `start` delivers the first snapshot at
  once. `send` queues a command for the next step. `onError` (on the interface since ETH-021)
  gets a message when the host stops the run on an error: the worker pauses on a bad message or
  a thrown sim error, then reports it. `InlineHost` never calls it; its errors throw to the caller.
  `onRunEnded(report)` (ETH-062) is called once when the run ends, right after the update with
  its last events; `SimSession.step()` returns `ended` (the `RunReport`) on that step, the
  `PacedRunner` flushes at once and stops stepping, and the worker posts `runEnded`.
  `InlineHost.run` stops at the end too.
- **InlineHost:** `run(steps)` runs that many steps now and delivers one batch and one
  snapshot. `setSpeed` is only recorded.
- **Headless tools** step a `SimSession` directly: `step()` returns each step's events, and
  `stateHash()` fingerprints the run without exposing `RunState` (§10).
- **Pacing (`PacedRunner`):** timer-free and driven by an injected clock, so it is tested
  with a fake one. 1× is `TURNS_PER_SECOND` (5, a provisional default) party turns a second;
  2×, 4× and 8× multiply it. `max` steps for `MAX_SLICE_MS` (12 ms) per pump, then yields so
  messages get through. Updates go out at most once per `SNAPSHOT_INTERVAL_MS` (1000/30 ms)
  at any speed, and pausing flushes at once. A timed speed that falls more than a second
  behind (throttled timers) starts counting again rather than running a burst. A step that
  gets nowhere (nobody can act) stops the runner until the next message.
- **Protocol:** `HostRequest` is `start`, `command`, `setSpeed` or `setView`. `HostMessage` is
  `update` (`{ events, snapshot }`) or `error`. The worker checks each request with
  `readHostRequest`. Commands and configs are checked again where they are used.
- **Bundling:** `new Worker(new URL('./sim.worker.ts', import.meta.url), { type: 'module' })`
  with `worker.format: 'es'` in `vite.config.ts`. The CSP already allows `worker-src 'self'`.
  Tests run `serveSim` and `WorkerHost` over a `MessageChannel`, which structured-clones like a
  real worker; Node has no Web Workers.

---

## 8. UI (`src/ui/`)

- **React** with function components. **Zustand** stores:
  - `simStore`: latest snapshot and a ring buffer of recent events.
  - `profileStore`: the profile, with actions that call the pure meta functions and then save.
  - `uiStore`: selection, open tab, modals, log filters.
- Components subscribe to narrow slices so a new snapshot re-renders only what changed.

As built (ETH-012), the stores are in `ui/stores/`:

- `simStore`: `snapshot` and `events`, a ring buffer of the last `EVENT_BUFFER_SIZE` (500)
  events, each with a sequence number for list keys. `bindHost(host)` feeds a `SimHost`'s
  snapshots and events into it and returns an unsubscribe. `App` creates the host (a
  `WorkerHost`; tests pass an `InlineHost`), binds it and starts a demo run until the Prepare
  screen exists. Since ETH-014 it also holds `speed` (0 is paused) and `resumeSpeed` (the last
  running speed); `setSpeed` records a speed and sends it to the host `bindHost` connected, and
  `togglePause` switches between 0 and `resumeSpeed`. `App` sends the store's speed (1× at
  launch) after `start`. The speed is not saved between sessions. Since ETH-021 `bindHost`
  also feeds `onError` into `hostFailed`, which sets `error` and speed 0; while `error` is set
  `setSpeed` refuses anything but 0 (the run can't be resumed), and `reset` clears it.
- `profileStore` (ETH-059): `profile` (the meta `Profile`), `status` (`detached`, `loading`,
  `ready`, `failed`), `error`, `notes`, `lastSavedAt` and `dirty`. Actions `applyRunResult`,
  `save`, `exportSave`, `importSave` and `hardReset` call the pure meta functions.
  `bindSaveStore(store)` loads the save and starts autosave; `App` binds the store from its
  `createSaveStore` prop (default `createSaveStore()` from platform). The top bar shows the
  profile's banked currencies.
- `runStore` (ETH-062): `report` (the finished run until the next starts), `summaryOpen`,
  `restartAt` and `restartCancelled`; `startNext` calls the starter `App` registers with
  `setRunStarter` (same config, a new seed). `watchAutoRestart` starts the next run
  `AUTO_RESTART_MS` (5 s) after a run ends while the profile's `settings.autoRestart` is on and
  the countdown wasn't cancelled. Waiting for the player is the default. The run summary modal
  (`shell/RunSummary.tsx`) and the "run is over" banner over the map read it.
- `uiStore`: `selected`, `tab`, `drawerOpen`, `logHeight`, `logFilter` and `mapCamera`
  (ETH-013). Zustand's `persist` keeps `logHeight`, `tab` and `mapCamera` in `localStorage`
  (key `ethuathia.ui`), through a wrapper that
  never throws and a merge that drops invalid values.
- Selectors return primitives or use `useShallow`, e.g. a party card picks its member's fields
  as primitives, so cards re-render only when what they show changes.
- **Styling:** CSS Modules and design tokens as CSS custom properties (see `VISUAL-DESIGN.md`).

### 8.1 Kit (`ui/kit/`)

Small presentational components used by every screen: `Panel`, `Card`, `Button`, `Tabs`,
`Modal`, `Bar`, `Badge`, `Tooltip` (Floating UI), `SortableList` (dnd-kit), and three that
carry game-wide behavior:

- **`NumberText`:** formats with suffixes (1.2k, 3.4M) and, given a stat breakdown, shows the
  contributing modifiers in its tooltip.
- **`Explain`:** wraps any mention of a content id and shows its Codex entry on hover. Built in
  ETH-065; it lives in `ui/codex/` with the Codex, not in the kit (§8.5).
- **`NodeGraph`:** draws an upgrade tree as SVG from each node's `tier` and `column`.

`Panel`, `Card`, `Button`, `Tabs`, `Tooltip` and `Bar` exist (ETH-011) and are exported from
`ui/kit/index.ts`; the others arrive with the features that first need them. Kit stylesheets
use tokens only, which `test/ui/tokens.test.ts` enforces. In dev mode, `?kit` on the dev server
URL opens `ui/dev/KitGallery`, which shows every component and state; production builds drop
it.

### 8.5 Codex and `Explain` (`ui/codex/`, ETH-065)

- **Renderers:** each content kind has a file `ui/codex/renderers/<kind>.tsx` whose default
  export is `defineCodexRenderer({ registry, label, order, hint?, alwaysKnown?, hidden?, glyph?,
  group?, fields? })`. `registry` types `fields` and `group` with the real def type. `fields`
  returns the stat table (`{ label, value, hint?, key? }`); `key` fields also show in `Explain`.
  `group` is the subheading (a monster's family). `registry.ts` collects the files with
  `import.meta.glob`, so a new or richer kind is one file and no edit to the tab; a kind with no
  file gets a plain section. Two renderers for one kind throw at load.
- **Discovered** = the profile's `codex` entries plus `simStore.discoveries` (`useDiscovered`).
  Undiscovered entries show `???` and the renderer's `hint`; search only matches discovered
  entries, so names never leak.
- **`Explain id`** renders a content mention with a tooltip (`ExplainCard`: glyph, name, kind or
  group, description, key fields). An unknown id renders as plain text. The map's hover tooltip
  shows the `ExplainCard` of the top non-party thing on the tile (`tileSubject`).
- **Log mentions:** a log-text `text` may return parts instead of a string,
  `[`${nameOf(e.actor)} opens a `, mention('feature.door', 'door'), '.']`; each `mention` renders
  as an `Explain` link. `LogLine.text` stays the plain sentence.

### 8.2 Map renderer (`ui/map/`)

A plain class with no React dependency:

```ts
class MapRenderer {
  constructor(canvas: HTMLCanvasElement, theme: GlyphTheme)
  draw(snapshot: Snapshot, view: { camera: Camera; selected?: EntityId; hover?: Pos }): void
}

interface GlyphTheme { cell: { w: number; h: number }
                       drawCell(ctx, x, y, glyphId: string, state: 'visible' | 'remembered'): void }
```

Glyphs are pre-rendered to an offscreen atlas and copied with `drawImage`. Draw order: terrain,
features, items, actors, fog and memory dimming, overlays (selection ring, goal line, hover).
A tileset later is a second `GlyphTheme`.

As built (ETH-013), in `ui/map/`. Only `MapCanvas` and `MapControls` use React; everything
else is plain TypeScript, and all but `MapRenderer` and `AsciiTheme` run without a canvas:

- **Scene** (`scene.ts`): `buildScene(snapshot, { selected, hover }, glyphs)` packs each tile
  into one integer: an interned glyph id (`GlyphTable`), the fog state (unknown, remembered,
  visible) and overlay bits (hover, selected). Layers resolve topmost-wins: terrain, then a
  feature, then an actor, with party members over anything else and dead ones not drawn.
  `changedTiles` diffs two scenes; `describeTile` gives the hover tooltip's text.
- **Camera** (`camera.ts`): all in whole device pixels, so glyphs stay on the pixel grid.
  `fitView` picks the largest whole cell size that shows the floor and centers it.
  `followView` uses `FOLLOW_CELL_HEIGHT` (20 CSS px) cells and keeps its scroll until the
  target comes within `FOLLOW_MARGIN` (25%) of an edge, never scrolling past the floor's edges
  and centering a floor smaller than the view. `followTarget` is the selected adventurer if
  alive on the shown floor, else the first living one.
- **`GlyphTheme`**: `aspect` (cell width over height), `setCellSize(w, h)` in device pixels,
  `invalidate()` and `drawCell(ctx, x, y, glyphId, state)`. The cell size is the renderer's
  choice (it changes with the camera mode and pixel ratio), so it is set on the theme rather
  than fixed by it. A cell's drawing covers the whole cell, background included.
- **`AsciiTheme`** draws `glyphStyle(id)` (`glyphs.ts`) into a `GlyphAtlas` (`atlas.ts`): one
  slot per glyph and fog state, painted the first time it is needed, in a canvas that doubles
  when full and is dropped when the cell size changes or the font loads.
- **`MapRenderer`**: `resize(deviceW, deviceH, dpr)`, `draw(snapshot, { mode, selected, hover })`,
  `tileAt` and `tileRect` (CSS pixels) for hit-testing, and `invalidate()`. When the view
  (cell size and scroll) is unchanged it redraws only the tiles whose code changed; otherwise it
  redraws every tile in view. The selection ring and hover outline are drawn inside the cell,
  so a tile never draws over its neighbors and the diff stays exact.
- **`MapCanvas`** subscribes to `simStore` outside React's render and draws at most once per
  animation frame, so a fast sim never re-renders it. It sizes the backing store from a
  `ResizeObserver` (`device-pixel-content-box` where supported) plus a `resolution` media
  query for pixel-ratio changes, and reads its colors and font from the design tokens.
- The camera mode lives in `uiStore` (`mapCamera`) and is remembered like the log height.

### 8.3 Input

A keymap table maps keys to either a UI action (pause, speed, cycle adventurer) or a sim
command (movement while possessed). Rebinding later means editing the table.

As built (ETH-014), in `ui/input/`:

- **`keymap.ts`:** `KEYMAP`, a list of `{ code, label, action }`. `code` is
  `KeyboardEvent.code` (the physical key, so the digits work on any layout), `label` is how the
  key is shown and goes into `aria-keyshortcuts`. Actions are `togglePause` and
  `setSpeed(speed)`: `Space` pauses or resumes, `1`–`5` (number row, not numpad) pick 1×, 2×,
  4×, 8× and max. `keysFor(action)` gives the labels for tooltips. `bindingFor(event)` returns
  the binding a key press triggers, or nothing when a modifier (Ctrl, Alt, Meta) is held, the
  event is composing or already `defaultPrevented`, focus is in a text field, textarea, select
  or editable content, or the key is Space on a checkbox, radio or switch.
  `keyHint(action)` gives a control its `aria-keyshortcuts` value and tooltip line.
- **Cycling the selection (ETH-020):** `]` and `[` (`BracketRight` / `BracketLeft`) are
  `cycleSelection(step: 1 | -1)`. It changes only `uiStore.selected`, using the pure
  `cycleSelection(party, selected, step)` in `uiStore.ts`: the next or previous living member in
  party order, wrapping, skipping the dead; with no selection it starts at the first (or last)
  living member, and with nobody alive it changes nothing. `Tab` is never bound, so focus
  navigation keeps working. Possession (`P`) joins the same table later.
- **`useKeymap()`:** listens on `window` while the in-run screen (`AppShell`) is mounted. Focused
  widgets handle keys first (the map's arrows, Enter and Escape, the tabs' and log edge's
  arrows), so a key they mark with `preventDefault` never reaches the keymap. A key the keymap
  takes has its default prevented on keydown and on the matching keyup, so Space on a focused
  button pauses without also pressing it (Enter still does) and never scrolls. Held keys act
  once. Speed actions go through `simStore`, never to the sim directly.

### 8.4 Desktop packaging

Tauri is added in M2, when file saves are needed. Before that the game runs in a dev browser
tab. Nothing in `ui/` calls Tauri directly; it goes through `platform/`.

---

## 9. Extending the game

| To add… | Touch |
|---|---|
| Monster, item, class, race | One content def |
| Omen, blessing, trait, status effect | One content def (a bundle) |
| A new kind of effect | One case in the effect interpreter |
| Rule condition or rule action | One entry in its domain's `conditions` / `ruleActions` list, and a Library node to unlock it |
| Town upgrade | One node def |
| Town building | Node defs with a new `tree` id, and a panel title |
| Floor type | A step list; a new `GenStep` only if the shape is new |
| Conduct | One `RunTracker` and a content def |
| Tileset | One `GlyphTheme` |
| Storage backend | One `SaveStore` |

---

## 10. Testing

- **Determinism:** the same seed and commands give the same state hash, run twice.
- **Save round-trip:** serialize mid-run, deserialize, continue; the result matches an
  uninterrupted run.
- As built (ETH-016): `stateHash(state)` in `src/sim/serialize.ts` is `hashText` (core, a
  53-bit non-cryptographic hash, pinned by a test) of `serialize(state)`.
  `test/sim/determinism.test.ts` runs 20 seeds twice with a two-member party and a fixed
  command script (player actions, one that fails, one rejected) and compares hashes every 20
  steps and every event; it then saves four seeds before the first step, mid-run and late,
  loads them and checks the rest of the run matches. Extend the command script as commands are
  added.
- **Headless runs:** `npm run sim -- --seeds N [--from S] [--cap T] [--party P]`
  (`tools/sim.ts`, logic in `tools/headless.ts`) runs each seed's dungeon through a
  `SimSession` until the party settles (every living member on the baseline `act.wait` for
  longer than a dropped goal lasts, `DROP_TURNS`): `done` on the bottom floor, `idle` above
  it. It stops early at the cap in party turns (default 6000) or when nobody can act. It prints
  a row per seed (game turns taken, depth reached of the dungeon's depth, explored percentage
  of the last floor, stuck count, result, final state hash), a summary with depth and turns per
  floor (`SeedResult.floors` has each floor's turns and explored share), and lists every seed
  that hit the cap, settled above the bottom, stalled or triggered stuck detection. Comparing the hash column before and after a refactor
  shows whether behavior changed. `--json`, `--compare REF` and `--baseline FILE` save and compare
  reports (§11.4). `test/tools/headless.test.ts` runs it in the suite.
- **AI behavior:** hand-built maps with a fixed seed, asserting on the actions taken and the
  `ruleFired` trace.
- **Content:** validation runs in `npm test`.
- **Balance:** `tools/balance` runs N seeded headless runs and reports depth, death causes and
  currency per hour. Run it before and after any balance change. It grows out of the headless
  run script above in M1, once there are floors to descend, combat and currency.
- **UI:** component tests for the kit and shell. The map renderer's scene, camera, atlas and
  color logic are unit-tested without a canvas, and `MapRenderer` and `AsciiTheme` run against
  a recording fake context (`test/ui/map.test.ts`); how the map looks is checked by eye in the
  dev tab.

---

## 11. Invariants and gates

The safety net every change runs through (ETH-056). It catches a broken game, not just a
broken unit: a change that corrupts state, desyncs a save or crashes the UI fails `npm test`
even when no test looks at the part it broke.

### 11.1 Invariants (`src/sim/invariants.ts`)

- `checkInvariants(state): string[]` runs every registered check and returns one line per
  violation, prefixed with the check's name (`[core.positions] entity 4 at (99, 2) is outside
  floor "d1"`). Empty means the state is sound. A check that throws is reported as a violation.
- `registerInvariant(name, check)` adds a check, `(state: RunState) => string[]`, and returns a
  function that removes it (for tests). Names are unique and namespaced by domain
  (`core.*`, `combat.*`, `items.*`, `quests.*`, ...). A check must not change the state and
  should be cheap: the soak runs it after every step.
- **A domain registers its checks in its own module**, at import time, next to the state it
  owns (e.g. `registerInvariant('combat.hpRange', ...)` in the combat module). Any item that
  adds state adds the invariants for it in the same change.
- Core checks: plain data (no NaN, `undefined`, class instances or shared references); turn,
  `nextEntityId` and RNG streams valid; entity ids match their keys and were handed out; floors,
  memory, the dungeon graph and every floor's entity list agree with each entity's `floor`;
  positions inside their floor, actors not in walls and one per tile; party ids unique, live
  adventurers; actor HP, MP and speed in range, and dead actors (HP 0 or below) hold no queued
  action.
- Stats checks (ETH-057): `stats.values` and `stats.parts` (Contracts, "Bundles, effects,
  triggers and statuses").

### 11.2 Soak (`tools/soak.ts`)

`soakSeed(seed, { cap })` plays one seeded run (party size 1 to 4 by seed, no commands) for
`cap` party turns and fails it on: any invariant violation after any step; any throw; a save
and load (`serialize`/`deserialize`) halfway whose copy, stepped alongside the original for
`ROUND_TRIP_STEPS` (50), gives different events or state hashes (compared every `HASH_EVERY`
steps and at the end of that window); or a **stuck storm**,
more than `MAX_STUCK_PER_RUN` (5) `stuck` events in one run. A step where nobody can act ends
the soak as `stalled`, and a run that ends (`runEnded`, ETH-062) as `ended`; neither is a failure.

- `test/sim/soak.test.ts` runs 30 seeds at `TEST_SOAK_CAP` (150) party turns in `npm test`,
  about 2 seconds.
- `npm run soak -- --seeds N [--from S] [--cap T]` (`tools/run-soak.ts`, default 100 seeds at
  2000 turns) runs it bigger and exits with code 1 on any failure. Run it after a change to the
  step loop, AI or state shape.

### 11.3 App-boot smoke test (`test/ui/appBoot.test.tsx`)

Renders `App` in jsdom with `createHost` returning an `InlineHost` (the seam `App` already has)
and a counting fake 2D context, plays 300 party turns in batches of 10 inside `act`, and asserts
that nothing called `console.error` (React warnings included), the map canvas drew, the party
cards show every member, and the top bar and log show the run.

### 11.4 Sim compare (`tools/compare.ts`)

- `npm run sim -- --json FILE` also saves the report: `{ version, args, results }`, every
  seed's `SeedResult`.
- `npm run sim -- --seeds N --compare REF` checks git ref `REF` out into a temporary detached
  worktree under `.sim-compare/` in this checkout (git-ignored; inside the checkout so the ref's
  code finds this checkout's `node_modules`), runs **that ref's** `tools/sim.ts` there with the
  same arguments and `--json`, then removes the worktree. Refs from before `--json` are read
  from their printed table. `--baseline FILE` compares with a saved report instead.
- It prints a table of `METRICS` (runs, done, settled above bottom, hit cap, stalled, stuck,
  turns mean/min/max, explored, depth mean/max, turns per floor) with before, after and delta,
  then how many seeds end in a different state hash. Reports from before ETH-058 count as depth
  1. M1 items add rows to `METRICS` (death causes, currency per hour) as the report grows.
- Since ETH-062 a headless run stops when the run ends: `done` means it reached the bottom and
  ended, `early` that it ended above the bottom. `SeedResult` adds `end` (the outcome), `runTurns`
  (return trip included; `turns` stays the turn the party turned back) and `atRisk`. `METRICS`
  adds ended above bottom, one row per outcome, run turns and Renown and Trophies at risk.

### 11.5 PR gates

Listed for contributors in [`../backlog/README.md`](../backlog/README.md#gates): `npm run
check` (typecheck, lint and every test, which includes the invariants, soak, determinism and
app-boot tests), the sim compare table against `origin/main` in the PR body, and a look at the
running app for UI changes.
