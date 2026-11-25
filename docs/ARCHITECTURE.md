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
| A change to every floor plan (a contract's relic) | a `FloorPlanHook` in the domain's `floorPlanHooks` ("Contracts in the run") |
| A run tracker | a `RunTracker<S>` listed in the domain's `trackers` |
| A Codex discovery | one line in the domain's `discoveries` map: event type → content ids and marks (see "Codex discoveries") |
| A notable moment (a log highlight, a run summary moment) | a `defineChronicleKind` in the domain's `chronicleKinds` and one line in its `chronicle` map, plus wording in the domain's `<DOMAIN>_MOMENT_TEXT` (see "Run chronicle") |
| A Codex view of a content kind | a renderer file `src/ui/codex/renderers/<kind>.tsx` (§8.5) |
| Data kept between runs | a profile slice in `src/meta/slices/`, one line in `PROFILE_SLICES` (see "Profile slices") |
| An invariant | `registerInvariant('<domain>.name', …)` in the domain module (§11.1) |
| A stat derivation (attributes, level) | a `StatProvider` in the domain's `statProviders` (Contracts, "Stats") |
| Bundles from a new place (gear) | a `BundleSource` in the domain's `bundleSources` |
| Something that changes the whole run (an Omen, a blessing, a curse, a floor event, doctrine) | a run modifier: `RunConfig.runModifiers` or `addRunModifier` ("Run-wide modifiers (ETH-115)") |
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

`HIGHLIGHT_KINDS` (`ui/shell/text.ts`) is collected from `LOG_TEXT`, so the Options auto-pause
list picks up a new kind with no other edit. Since ETH-120 the log's Highlights filter shows the
**run chronicle** (below), not the rolling event buffer, so a new highlight also needs a
chronicle rule and moment wording; a test fails on a highlighted event type with no rule. Auto-pause choices
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

A tracker may also have `afterStep(s, run)` (ETH-121): run once per step after every tracker
has folded the step's events, it derives the next state from the run itself, for trackers that
watch state rather than events (`track.requirements`). It is pure like `reduce`, and
`projectedRewards` skips it, so currency should be earned from events.

A tracker's state is plain data, part of the run state (saved with it) and must not keep
references to event objects. The base trackers are `track.depth` (depth-weighted Renown per floor
reached below the first: `RENOWN_PER_FLOOR × floor^RENOWN_DEPTH_EXPONENT`, `10 × floor^1.3`
rounded, summed by `depthRenown`, ETH-085), `track.turns` (one Renown per `TURNS_PER_RENOWN` 50 game
turns), `track.kills` (Trophies; a placeholder until ETH-060 adds a kill event, then
`trophiesForKill(difficulty)` per kill) and `track.deaths` (who fell, from `fell` events).

### Run end (ETH-062)

All in `src/sim/run/`:

- **State:** `state.domains.run` holds `rewards.atRisk`, `trackers`, `started`, `leaving`
  (`{ turn, reason: 'ordered' | 'rule', by, announced }` once the party turns back), `fallen`
  (party ids in the order they fell) and `end` (`null` while running, then
  `RunEnd { outcome, turn, cause, depth }`). Once `end` is set, `step` returns `[]` and changes
  nothing.
- **Events:** `runStarted { party: { actor, name, classId, raceId }[], depth, floorType }` (`depth` is `number | null`, hidden as `null` until bottom floor or `FLAG_REVEAL_DEPTH`, ETH-133) is the
  first event of the first step (the Codex discovers the party's classes, races and first floor
  type from it, ETH-079);
  `turnedBack { actor | null, reason }`; `fell { actor, name, floor, pos, depth, killer }` when a
  party member's HP reaches 0 by any cause (a highlight; `killer` below); `runEnded { outcome,
  cause, depth }`, always
  a run's last event. The floors domain's stairs action emits `leftDungeon { actor, party,
  floor, pos }` when the party walks out of the first floor's up stairs, which are refused unless
  every living member is gathered there (`stairsGathering`).
- **Ending:** `step` calls `settleRun` after the commands and after every action. It notices the
  party turning back (a `retreat` command, or any `ruleFired` for `act.retreat_run`), new falls,
  `leftDungeon` (a **victory** if at least one victory check applies and all that apply are met,
  else a **retreat**) and nobody alive (a **wipe**).
- **Victory checks** are a registry like the rule registries: `SimDomain.victoryChecks`, joined
  into `VICTORY_CHECKS`. A `VictoryCheck` is `{ id, check(state) → { applies, met, detail } }`.
  Contracts add `victory.contracts` (ETH-024, "Contracts in the run"); a run without contracts
  has no check that applies, so walking out is a retreat.
- **Killer (ETH-075):** `fell.killer` is a `Killer` (`src/sim/combat/death.ts`) or `null` when
  nothing is known: `{ kind: 'monster' | 'adventurer' | 'status' | 'trap' | 'other', id, def,
  name, ranged?, bolt?, source? }`. `killerOf(state, victim, events, from)` reads it from the
  stretch of events in which the member fell: the `killed` blow (with `ranged` for a bolt), else
  the last `damaged` effect, a status naming its inflicter (`source`) from `ActiveStatus.by`.
  `deathPredicate(killer, tense)` words it ("was slain by a slate hound", "died poisoned by a
  mire toad", "fell") and `deathLine(name, killer, depth, tense)` makes the whole clause, used by
  the log line ("Mira is slain by a slate hound on floor 4."), the wipe's cause and the run
  summary. `track.deaths`' `FallenRecord` carries `killer` and `how` (the past predicate); the
  history keeps `fell.how`. The run chronicle (ETH-120) reads `killer` from `fell`.
- **Result:** `runResult(state)` builds the `RunResult` (a fresh copy), with
  `extras['run.end']` (the `RunEnd`) and `extras['run.party']` (`PartyMemberRecord[]`:
  `{ actor, name, classId, raceId }` in party order, ETH-048); `runReport(state)` is
  `{ result, end }`, what the hosts hand the UI. `lost` is the wipe loss (ETH-023, "Rewards").
- **Heading out:** `cond.heading_out` holds once `leaving` is set; `act.retreat_run` climbs to
  the remembered stairs up and takes them once the floor's living members are gathered (at the
  exit, the whole party); `act.gather { dir: 'up' }` waits. `act.descend` and the down
  `act.gather` refuse while heading out.

### Combat (ETH-060)

`src/sim/combat/`: monsters, the `attack` action, damage and death.

- **Monsters** are content (`MONSTERS`, `src/content/monsters.ts`): glyph, `stats` (hp, damage,
  accuracy, evasion, armor, speed), a rule set, a depth range, a spawn weight, a `threat` value
  (Trophies per kill) and optional `sharesTile` (small folk and swarms may crowd one tile with
  others that share). `spawnMonster(state, def, floor, pos)` makes one: a monster-faction actor
  with stats, an `ai` part holding the def's rules and a `monster` part. Monsters run the same
  decision engine as adventurers, on their own rules only (no baseline); combat registers
  `cond.enemy_adjacent`, `cond.enemy_visible`, `cond.hp_below`, `act.attack_adjacent`,
  `act.approach_enemy`, `act.flee` (through the `flee` action and its Flee check, ETH-081,
  "Stats") and `act.wander`.
- **Spawning:** the `gen.monsters` step (after `gen.fountains`, so no monster stands on a feature)
  puts `spawns` in the floor plan from the dungeon stream, away from the stairs; building the
  floor makes them. `RunConfig.monsters: false` leaves them out (tests of other systems).
- **Attack:** hit chance 70% + 5% per point of accuracy over evasion (5%–95%); a hit does
  1–`BASE_BLOW` plus the `damage` stat, less armor, at least 1. One draw each from the combat
  stream. Events `attacked` / `missed`; `trigger.struck` and `trigger.hit` fire after the blow.
- **Death:** a monster at 0 HP gets `died` (with its cause: the killer's def, or its latest
  harmful status) and leaves the run. A party member at 0 HP stays in the state at 0 HP, off the
  schedule and taking up no tile (`isStanding`); the run domain reports it (`fell`) and ends the
  run as a wipe when nobody is left. A blow that kills emits `killed { killer, victim, byParty,
  threat, ranged? }`, which `track.kills` turns into Trophies. `isPartyWiped(state)` agrees with the run
  domain's wipe check.
- **Recovery:** an adventurer with no enemy next to them gets 1 HP back every
  `RECOVERY_INTERVAL` turns (`recovered`, quiet in the log).
- **Snapshot:** `ActorView` carries `name`, `hp` and `maxHp` for each visible actor.
- **Roles (ETH-040):** every `MonsterDef` has a `role` (`MONSTER_ROLES`: `brute`, `skirmisher`,
  `caster`, `support`, `swarm`; Codex text in `ROLE_INFO`). The role picks the rule set
  (`ROLE_RULES`) unless the def lists its own `rules`; read the rules in force with
  `monsterRules(def)`, never `def.rules`. Role powers are optional def fields: `bolt { range,
  name }` (casters must have one), `mend { amount, range }` and `bolster { status, turns, range }`
  (supports need one of them). `src/sim/combat/roles.ts` holds the role conditions
  (`cond.just_attacked`, from the AI memory's last intent; `cond.ally_hurt`; `cond.in_bolt_range`)
  and rule actions (`act.fall_back`, `act.cast_bolt`, `act.surround`, `act.mend_ally`,
  `act.bolster_ally`, `act.hang_back`, `act.rush_caster`), plus `rolePowers`, `visibleAllies`,
  `canSee` and `isAlly`. Templates (ETH-117) may change the role and powers: read them with
  `monsterRules(def, templates)` and `rolePowers(actor)`. Actions: `bolt { target }` (same hit and damage rolls as `attack`; its
  `attacked` / `missed` carry `ranged: true`) and `aid { target, power: 'mend' | 'bolster' }`
  (emits `aided`, then the `healed` or `statusApplied` it causes). The adventurer baseline rushes
  a caster that has it in bolt range (`cond.in_bolt_range` → `act.rush_caster`, after
  `act.attack_adjacent`). No new state: roles add no parts or slices.
- **Encounters, Squads & Group AI (ETH-135, `src/content/squads.ts`, `combat/encounters.ts`, `combat/groupAi.ts`):**
  `gen.monsters` delegates to `populateEncounters`, allocating a Danger-scaled floor threat budget (`floorThreatBudget`, scaled by `DungeonDef.encounters?.budgetMul`) across non-arrival rooms while keeping `stairsDistance` clear and preserving OOD + depth-ramped templates (`rollOodDanger`, `templateChanceFor`). For party-size scaling (ETH-145), `populateEncounters` multiplies `floorThreatBudget` by `partySizeBudgetMul(draft.partySize, draft.partyBudgetStep)` using `PARTY_SIZE_BUDGET_STEP` (currently `0`; `ETH-080` tunes it upward toward `~0.1`) from the starting party size (`state.config.party.length`), adding headcount and packs only (never changing monster stats or templates) and surfaced in `TopBar` and the dungeon Codex renderer. `SQUAD_BLUEPRINTS` define role/tag archetypes (`minDanger`, `weight`, `slots`, `preferSameTag`, `patrolEligible`) with zero hardcoded monster ids. Placed squads and deterministic multi-room corridor patrols carry optional `MonsterPart` state (`groupId`, `homeRoom`, `alert { pos, untilTurn }`, `patrol { waypoints, next }`), with pure rule conditions/actions (`cond.has_alert`, `act.pursue_alert`, `act.tether_wander`, `act.patrol`) spliced by `withGroupAiRules` and hook-driven alert/patrol updates (`PURSUIT_MEMORY_TURNS = 8`) in `combatTurnStart` and `strike`. Invariants `combat.groups` and `combat.patrols` verify group/room/alert/waypoint validity.

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

### Run chronicle (ETH-120)

The run's notable moments, kept for the whole run. `src/sim/run/chronicle.ts` defines it; it
works like the Codex discoveries:

- **Entry:** `ChronicleEntry = { kind, turn, floor, pos, depth, actors: EntityId[], ids: string[],
  amount? }`, plain data with no wording. `kind` is a `ChronicleKind` id, the same as the log
  highlight id when the moment is one. `floor` and `pos` are `null` only for a moment with no one
  place (the wipe's loss). `actors` puts the main entity first (the fallen, then the killer);
  `ids` are content ids (the killer's def, the item, the contract); `amount` is the number the
  moment is about (level reached, HP left, item value, share lost in percent).
- **Declaring moments:** a domain lists its kinds in `SimDomain.chronicleKinds`
  (`defineChronicleKind({ id, priority })`) and its rules in `SimDomain.chronicle`, a
  `ChronicleRules` map typed per event type (`event → ChronicleEntry | null`; build entries with
  `momentAt(kind, event, actors, ids, { depth?, amount? })`). Core's are `CORE_CHRONICLE` /
  `CORE_CHRONICLE_KINDS` (`coreEvents.ts`). The hub joins them into `CHRONICLE_KINDS` and
  `CHRONICLE_RULES` (`registries.ts`), in domain order. `chronicleEntriesOf(event)` applies them.
- **Kinds so far** (priority): `adventurerFell` 100 (`fell`, with the killer), `contractComplete`
  90, `earningsLost` 80 (chronicle only, not a log highlight: `earningsLost` now carries `depth`),
  `leveledUp` 60, `valuableFind` 40 (a pickup worth `NOTABLE_ITEM_VALUE`), `nearDeath` 30
  (`isNearDeathBlow`, `NEAR_DEATH_FRACTION` 0.25, both in `sim/combat`), `stuck` 10.
- **Tracker:** `CHRONICLE_TRACKER` (`track.chronicle`, run domain) reduces events into
  `Chronicle = { entries }`, capped at `CHRONICLE_LIMIT` (200) by `addChronicleEntry`: past the
  cap it drops the earliest entry of the lowest priority, never the run's first entry nor the
  newest. Its extras, `RunResult.extras['track.chronicle']`, are the entries. Invariant
  `run.chronicle`: known kinds, in turn order, within the cap.
- **Reading it:** `topMoments(entries, n)` picks the `n` most notable, in turn order.
  `simStore.chronicle` runs the tracker over every event the UI receives (as it does
  `discoveries`), and the log's Highlights filter shows it (`momentLines`). The run summary lists
  `momentsOf(report)` as "Moments" (`SUMMARY_MOMENTS` = `RUN_RECORD_MOMENTS` = 5), and the
  `history` slice (v4) keeps the same top entries per run as `RunRecord.moments`, with party
  members renumbered by party place (`recordMoments`).
- **Wording:** each domain's log-text file exports `<DOMAIN>_MOMENT_TEXT: MomentTextRecord`
  (`{ kind: HighlightKind, category, text(entry, nameOf) }` per kind id), joined into
  `MOMENT_TEXT` (`ui/shell/text.ts`); `momentLine(entry, seq, nameOf)` makes a `LogLine`. Tests
  fail on a chronicle kind with no wording, a highlight kind that is not a chronicle kind, or a
  highlighted log-text event type with no chronicle rule.
- **Later users:** epitaphs (ETH-068) read the fallen's last entries, ballads (ETH-103) a run's
  entries, the nemesis (ETH-101) the `adventurerFell` entry's killer, run history (ETH-048) the
  kept moments, and the time-away summary the simulated runs' entries. Add kinds rather than a
  parallel list.

### Stats

`StatId` is fixed in `src/sim/stats/statIds.ts`: `hp`, `mp` (the maxima; current HP and MP
stay on the actor part), `accuracy`, `evasion`, `damage`, `armor`, `speed`, `sight`, `carry`,
then the six **skills** (ETH-081, `SKILL_STAT_IDS`): `identify`, `trapSpot`, `statusResist`,
`disarm`, `flee`, `forceDoor`. `STAT_IDS` lists them and `isStatId` checks one.

`STAT_INFO` gives each one a label, tooltip text, a `base` (sight 8, trap spotting 10, disarm
20, flee 40, all others 0), a `min` (max HP 1, all others 0), and for the skills a `max`
(`SKILL_CAP` 95; status resistance `STATUS_RESIST_CAP` 75) and `percent: true`.

**Skills (ETH-081): each attribute's second job.** Percent chances, base + attribute × per point
(rows in `ATTRIBUTE_FORMULAS`, after the original seven, which are unchanged): Identify 3 × Wits,
Trap spotting 3 × Wits, Status resistance 2 × Grit, Disarm 3 × Finesse, Flee 3 × Finesse, Force
doors 4 × Brawn. Like any stat, gear and statuses can modify them (`modifiers: [{ stat: 'disarm', … }]`).
Consumers read them with `statValue` and roll `chance(value / 100)` on their own stream:

- `statusResist` (wired): `applyStatus` shortens a **harmful** status by `resistedTurns(turns,
  resist)` = round(turns × resist / 100), leaving at least 1 turn; no roll. `statusApplied`
  carries `resisted` (turns shrugged off) when any were. Pass `resistible = false` for a status
  that is not an affliction (the config's `partyStatuses` do).
- `flee` (wired): the combat `flee { dir }` action (`combat/flee.ts`), which `act.flee` uses.
  With an enemy adjacent and attributes to test, one combat-stream draw; a failure leaves the
  actor in place and spends the turn (`fleeFailed { actor, enemy, enemyDef, chance, floor, pos }`).
  Otherwise it is a plain move, so monsters flee as before.
- `identify` (ETH-044), `trapSpot` and `disarm` (ETH-046), `forceDoor` (stuck or locked doors,
  once they exist): no consumer yet.

**Reading a stat (ETH-057).** Never read a maximum, speed or sight from a field: `ActorPart` holds
only current `hp` and `mp` (plus energy, faction, queued).

- `statValue(state, entity, stat): number` for hot paths (scheduler, AI, combat rolls).
- `getStat(state, entity, stat): StatResult` = `{ stat, value, raw, parts }` (`raw` is the exact total; `value` is `combatValue(stat, raw)`, the whole number combat reads, ETH-181), each part
  `{ op: 'add' | 'mul', value, source: { id, label } }` (content id and display name, e.g.
  `{ id: 'race.human', label: 'Human' }`), ready for a tooltip. `getStats` returns all nine.
  Parts that change nothing are left out. Both give the same number.
- **Formula:** raw = (sum of `add` parts) × (product of `mul` parts); value = `combatValue(stat, raw)`
  (`Math.round`ed, clamped to `STAT_INFO[stat].min`). Every display of a total uses that helper
  too, and `roundedText` words it for tooltips ("1.8, rounded to 2 in combat"). Parts come from, in order:
  1. **Stat providers** (`STAT_PROVIDERS`): `stats.base` (the entity's `stats.base[stat]`, or
     `STAT_INFO` base, labeled "Base"), then `stats.class_race` (the race's speed), then
     `stats.attributes` (ETH-033, below). Levels (ETH-034) need no provider of their own: they
     raise attributes, which this provider already reads. A new derivation is a `StatProvider`
     (`{ id, contribute(state, entity, stat, sink) }`, calling `sink(op, value, sourceId, label?)`)
     at the end of a domain's `statProviders`. They run in domain order, then list order.
  2. **Bundle sources** (`BUNDLE_SOURCES`): every active bundle's `modifiers` for that stat, scaled
     by potency (`add`: value × potency; `mul`: 1 + (value − 1) × potency). The stats domain has
     `stats.attached` (`stats.bundles`) and `stats.statuses`; the items domain has
     `items.equipped` (worn gear, ETH-043), and `stats.run` (run-wide modifiers, ETH-115) comes
     after the statuses. A new place bundles come from is a `BundleSource` (`{ id, visit(state,
     entity, visit) }`, calling `visit(bundle, sourceId, potency, label?)`) in its domain's
     `bundleSources`, so its triggers fire too. **Omens, blessings and other run-wide effects
     don't add one: they add a run modifier** ("Run-wide modifiers (ETH-115)").
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
  credited to `attribute.<key>` and labeled with name and value ("Grit 14"). Max HP = 4.5 × (Grit − 8)
  + ½ Brawn, MP = Wits, carry = 2 × Brawn; accuracy and evasion = 0.3 × (Finesse − 5), damage =
  0.2 × (Brawn − 3) (a low attribute subtracts, and the stat clamps at its minimum). ETH-177 priced
  them so a point of Brawn, of Finesse (through its weapon) and of Grit is worth about the same. An entity with no adventurer part and no `stats.attributes` gets no attribute parts,
  so monsters built from `stats.base` alone are unaffected. The snapshot's
  `domains.stats.members[id].attributes` carries each `AttributeResult`.
- **XP and levels (ETH-034, ETH-110, `src/sim/stats/leveling.ts`).** An adventurer's `growth`
  part is `{ level, xp, gained }` (absent: level 1, 0 XP; only adventurers have one; `level`
  always equals `levelForXp(xp)`; `gained` is whole points ≥ 0 per attribute; invariant
  `stats.growth`). Each class has `growth` in content (`ClassDef.growth`: per attribute a
  `GrowthRoll { min, max, chance? }`). Every level-up rolls each attribute (with `chance`, a
  whole number from min to max) from `growthRng(state, actor, level)`, a seed derived from the
  run seed, the actor id and the level (`seedState(seed, 'growth/<actor>/<level>')`), so the
  roll never shifts a shared stream. The result is added to `gained`, so a save and load never
  changes it. `gained` shows as an attribute part credited to the class and labeled
  "Level L". Level L → L + 1 costs `XP_STEP` (8) × L, with **no level cap**. XP comes from
  `grantXp(state, entity, amount, reason, source, emit)`; living adventurers only. Combat's
  `killActor` calls `grantKillXp(state, killer, victim, threat, emit)`: `XP_PER_THREAT` 4 ×
  threat, shared (when a party member struck the blow) by every living member on the victim's
  floor within `KILL_SHARE_RADIUS` 6 of the killer or the victim, each getting
  `killShare(base, n)` = ceil(base × (1 + `KILL_GROUP_BONUS` 0.25 × (n − 1)) / n). The floors
  domain's stairs call `grantDepthXp` on reaching a new deepest floor (`XP_PER_DEPTH` 5 ×
  depth, to every living member). A level-up raises current HP and MP by as much as their
  maxima rose. Events: `xpGained { actor, classId, amount, xp,
  reason: 'kill' | 'depth', source }` (quiet in the log) and `leveledUp { actor, name, classId,
  level, gains, floor, pos }` (a log highlight, `leveledUp`). **For class Mastery (ETH-087) and
  the roster (ETH-068):** the `track.xp` tracker (stats domain) keeps `{ byActor: { [id]:
  { classId, xp, level } }, byClass: { [classId]: xp } }`, fallen members included, so
  `RunResult.extras['track.xp']` holds it. The snapshot's `members[id].level` is a `LevelView`
  (`{ level, xp, levelXp, nextXp }`) for the party card.
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
  other?, source, potency }`. Built-in kinds: `heal`, `damage`, `applyStatus`; domain-owned
  kinds (`identify`, `uncurse`, ETH-044) register an `EffectHandler` via `SimDomain.effectHandlers`
  (`EFFECT_HANDLERS`), avoiding circular imports with `src/sim/stats/effects.ts`. Each may say
  `to: 'other'` (default `self`). Effects on a missing or dead target do nothing. **A new kind** is
  one member of `Effect` and one option in `effectSchema` (`content/bundles.ts`), plus either a
  case in `runEffect` or an `EffectHandler` in the owning domain. The `damage` effect only lowers HP (never below 0, clears
  a queued action at 0) and emits `damaged`. Combat's turn hooks settle a monster left at 0 HP
  (`died`, blaming the status); a party member at 0 HP is the run domain's `fell`.
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
  `removeStatus(state, entity, statusId, emit)` (the whole group), `tickStatuses`. `applyStatus`
  takes an optional last `by` (the inflicter): a `to: 'other'` effect passes the bundle's holder
  and `aid` the supporter, stored as `ActiveStatus.by { id, def }` (the latest applier on a
  merge), so a death from the status names its source (ETH-075; invariant `stats.statusSources`). Stacking is per
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
(step)         (reduce)        (currency id → amount, this run;     (run end:     (banks (atRisk − lost)
                                ×Omen multiplier, ETH-067)           lost = wipe   + (converted ?? {}))
                                                                     share;
                                                                     converted =
                                                                     gold → Trophies
                                                                     on exit, ETH-083)
```

**Order: base → ×Omen → −25%, then post-exit gold conversion.** The reward multiplier (`rewardMultiplier(state)`, ETH-115: 1 +
the sum of the run modifiers' `rewardBonus`, never below 0) is applied inside `rewards.atRisk`:
`trackerRewards` and `projectedRewards` sum the trackers, then multiply each currency and round
down (`applyRewardMultiplier`). So `RunResult.atRisk` is already multiplied and the wipe loss is
taken from the multiplied amount. With no bonuses it is exactly 1 and nothing changes. It uses
the modifiers in force now, over the whole run's total: a bonus added mid-run counts for earlier
earnings too, and one that ends stops counting.

**Leftover gold conversion (ETH-083, `src/content/economy.ts`, `src/sim/run/end.ts`).** In-run gold (`state.domains.items.gold`)
is NOT at-risk currency: it never enters `rewards.atRisk`, is never multiplied by Omens, and is never
subject to the 25% wipe loss. Instead, when the run ends:

- On `victory` or `retreat`, leftover gold converts into Trophies at `GOLD_PER_TROPHY` (`10` gold = `1` Trophy,
  rounded down via `goldToTrophies(gold)`), applied **after** the Omen multiplier and recorded in
  `RunResult.converted` (`{ trophies }`, omitted when 0).
- On a `wipe`, all leftover gold is lost (`converted` is omitted).
- Whenever `gold > 0`, `end` emits `goldSettled { gold, trophies, lost }` right before `runEnded` (and
  after `earningsLost` on a wipe).
- `runResult` always writes `extras['run.gold']` (`GoldConversionRecord`: `{ gold, trophies, rate }`).

**Carried-item sale (ETH-171, `src/sim/items/sale.ts`).** The same exit path also sells gear. `itemSale(state, outcome)` sums the base `value` of every item the *living* members carry or wear that passes `soldOnExit(item)` (not kit items, not zero-value items, not gold; heirlooms join the exceptions in M7) and converts it at `VALUE_PER_TROPHY` (`10`, rounded down once over the sum, not Omen-multiplied). The Trophies add to `RunResult.converted` beside gold's, `extras['run.items']` records `{ items, value, trophies, rate }` (on a wipe the amount lost, `trophies: 0`), and `end` emits `itemsSettled { items, value, trophies, lost }` after `goldSettled` when `items > 0`.

**The wipe loss (ETH-023, `src/sim/run/wipeLoss.ts`).** `WIPE_LOSS_SHARE` (0.25, final per
Nate) is the one constant. `wipeLoss(atRisk, outcome)` is empty for a victory or a retreat; on a
wipe each currency keeps `keptAfterWipe(n)` = ⌊0.75 n⌋ and loses the rest (so the loss rounds
up, and a lone point is lost). `runResult` sets `RunResult.lost` from it. On a wipe the run end
also emits `earningsLost { lost, atRisk, share }` just before `runEnded` (and before `goldSettled`,
only if something is lost): since the step's trackers haven't run yet, `end.ts` uses `projectedRewards(state,
stepEvents + runEnded)` (`trackers.ts`), which folds the step's events into copies of the tracker
states, so the event's figures equal the `RunResult`'s. No new run state.

- Trackers turn events (kills, depth reached, conducts kept) into at-risk amounts. Nothing else
  writes `rewards.atRisk`.
- **Currency ids** (ETH-059): `renown`, `trophies`, and `favor:<deity id>` for each deity's
  Favor (`favorKey('deity.dawn')` builds it, `favorDeity(key)` reads it back; both in
  `src/sim/run/result.ts`). Absent means 0.
- At run end the run domain puts the at-risk totals in the `RunResult` (ETH-062). The type is in
  `src/sim/run/result.ts` and is plain data:
  `{ outcome: 'victory' | 'retreat' | 'wipe', atRisk, lost, converted?, turns, deepestDepth, extras }`.
  `atRisk`, `lost`, and optional `converted` are `RewardAmounts` (currency id → amount); `lost` is
  what a wipe took (`wipeLoss`; empty otherwise) and is never more than `atRisk`, while `converted`
  holds post-exit converted amounts (absent on wipe or when 0). `extras` is an open
  record that later trackers write under their own id (`'track.kills'`), plus `'run.end'`, `'run.party'`,
  `'run.gold'` and `'run.items'`.
- `applyRunResult` in meta (§6.4) checks the result (it throws a `RangeError` on a malformed
  one, including non-finite/negative `converted` or positive `converted` on a `wipe`), then runs each profile slice's `onRunResult` step: the `currencies` slice banks
  `(atRisk - lost) + (converted ?? {})`, the `history` slice (v6, `RunRecord.gold` and `RunRecord.items`) records the run, the `adventurers` slice (ETH-119) folds it
  into each party member's record, and the `mastery` slice (ETH-087) adds each class's Mastery XP. A step gets a third argument, `before` (a `ProfileBefore`: the
  history as it was before banking), so it can read the run number without depending on slice order. The reward multiplier is already in
  `atRisk` (see the order above), so the loss follows it, and `converted` is added after both.
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
slice's trackers and run end), ETH-072 10 (the `fountain` feature part), ETH-061 11
(the `item` and `inventory` parts and the items slice), 12 on main after that, ETH-034 13
(the `growth` part and the `track.xp` tracker state), ETH-024 14 (the quests slice's contracts), ETH-043 15
(`inventory.equipped`), ETH-110 16 (`growth.gained`, the rolled level-up gains), ETH-111
17 (the ring and neck slots), ETH-113 18 (`AiMemory.waited`), ETH-066 19 (`ai.possessed`) and
ETH-075 20 (`ActiveStatus.by` and the killer in `track.deaths`), ETH-121 21
(`RunConfig.watchRequirements` and the `track.requirements` tracker state), ETH-120 22 (the
`track.chronicle` tracker state), ETH-115 23 (the stats slice's `runModifiers` and
`runModifiersAnnounced`), ETH-114 24 (the quests slice's `objectives` and `folded`, and the
`quests.objectives` tracker state), ETH-117 25 (`monster.overlay`), ETH-019 26 (`intent.goal`), ETH-025 27 (`FloorsState.respawns`, `stirAnnounced`, `lastVacated`), ETH-044 28 (`ItemsState.identifiedTypes`), ETH-094 29 (`floors.observedFountains`), ETH-091 30 (`track.kills.byMonster`), ETH-133 31 (`FloorsConfig.dungeonId`, Danger-scaled floors, variable hidden depth), ETH-134 32 (`MonsterPart.ood`, `monsterSighted.ood`, `oodSighted` chronicle kind), ETH-135 33 (`MonsterPart.groupId`, `homeRoom`, `alert`, `patrol`), and ETH-142 34 (the `track.cursedGear` tracker state and the `identifyTried` item field), then 35 (`ItemsState.heldNotes`), and ETH-147 36 (the `mix` item field: hidden blessing counts in a stack of unidentified potions or scrolls), then ETH-148 37 (`AiMemory.fleeing`, `AiMemory.threats`), ETH-119 38 (`AdventurerPart.recordId` and `track.kills.byActor`), and ETH-184 39 (`track.identified`).

### Contracts in the run (ETH-024)

Content in `src/content/contracts.ts`; sim in `src/sim/quests/`; Prepare section in
`src/meta/prepare/contracts.ts`.

- **Content:** `ContractDef` = `{ objective, reward }`. `objective` is the shared `Objective`
  (ETH-114, `src/content/objectives.ts`; contracts use `recover` so far); `reward` is currency id
  → amount (`renown`, `trophies`, `favor:deity.<id>`). A later contract type (ETH-026 slay,
  ETH-027 gather and delve, ETH-032 rescue) adds an objective kind to the engine and, if it places
  something, a floor plan hook.
  The first def is `contract.recover_relic` (reward 100 Renown) with its relic
  `item.ember_reliquary` (category `relic`, `&`, never dropped, no `loot`).
- **Config:** `RunConfig.contracts?: string[]` (contract ids, each at most once; `initQuests`
  throws a `RangeError` on an unknown or repeated id). Left out, the run has none, and walking
  out is always a retreat (tests and older configs). The Prepare section `contracts`
  (`{ contractIds }`) fills one per slot (`contractSlots(profile)` = `capacity(profile,
  'contractSlots', BASE_CONTRACT_SLOTS)`, 1 to start) and never none: an empty or stale choice
  falls back to the first available contract.
- **State:** `state.domains.quests` = `{ contracts: ContractState[], announced, objectives,
  folded }`, each contract `{ contract, progress: { current, target }, complete }`. Each contract
  is also a tracked objective of the **objective engine** (ETH-114, "Objective engine" below) with
  owner `{ kind: 'contract', id }`; `contractProgress` measures it there (`measureObjective`). A
  `recover` contract is recomputed from the run state: 1/1 while a living party member carries
  its item. `syncContracts` runs in the domain's `turnStart`, `turnEnd` and `stepEnd` hooks: it
  syncs the objectives, mirrors each contract's progress into its `ContractState` and emits the
  contract events below.
- **Events** (log text in `logText/quests.ts`): `contractsTaken { contracts: { contract, reward }[] }`
  on the run's first turn (none without contracts); `contractProgress { contract, current,
  target }` when a contract moves without completing; `contractCompleted { contract, actor,
  reward, floor, pos }` (the `contractComplete` highlight); `contractLost { contract }` when a
  complete contract no longer is (the relic's bearer fell).
- **Relic placement:** the floor plan hook `quests.relic` (`FloorPlanHook`, below) puts each
  `recover` contract's item on the bottom floor, generated or hand-built: a free tile in the
  farthest quarter by walking distance from the stairs up, picked with
  `contractRng(seed, floorId)`.
- **Victory:** `victory.contracts` applies once the run has a contract and is met when every one
  is complete as the party walks out; its detail ("The contract was done: Recover the relic.")
  leads the run's cause.
- **Rewards:** `track.contracts` reduces `contractsTaken` / `contractCompleted` /
  `contractLost` into `{ contracts: ContractRecord[] }` (`{ contract, reward, complete }`) and pays
  the completed ones' rewards into the at-risk total (a lost one is taken back; a wipe's share is
  ETH-023's). Its extras, `RunResult.extras['track.contracts']`, are the `ContractRecord[]`: the
  run summary lists them and the `history` slice (v3) keeps them as `RunRecord.contracts`.
- **Baseline:** `QUESTS_BASELINE` (spliced into `BASELINE_RULES` after the heading-out rules):
  `cond.contracts_complete` → `act.retreat_run`, then `act.recover_contract_item` (walk to a
  contract item the party has seen on this floor, however far, and pick it up). The floors rules
  already descend, so the party goes down to the relic, takes it and walks out. Respawns on the
  way back are ETH-025; quest weighting is ETH-031.
- **Floor plan hooks** (`SimDomain.floorPlanHooks`, `FLOOR_PLAN_HOOKS`): `{ id, apply(state,
  floorId, plan) }`, run by `planFloor` on every plan after its own changes, in domain order.
  `apply` changes the plan only and must be deterministic from the seed, the config and the
  floor id (its own seeded RNG).
- **Invariants:** `quests.contracts` (the slice matches the config; progress whole numbers;
  `complete` agrees with progress) and `quests.relics` (exactly one relic once the bottom floor
  is built, none before; only party members carry it).

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
  depth, firstVisit, floorType }`. React to arrivals (depth rewards, contracts, run end at the
  exit) with a run tracker or trigger on `floorEntered`, not by editing the stairs action. The
  run's first floor gets no `floorEntered` (the Codex marks its `floorType` `seen` from
  `runStarted`, ETH-079). `floorType` (ETH-064) is the floor type id the floor
  is built from (`floorTypeOf(state, floor)`), or `null` for a hand-built floor; the Codex marks
  it `seen` from this event.
- **State:** `state.domains.floors` holds `deepest`, `arrived` (the turn the party first
  reached each floor), `respawns` (wave count per floor), `stirAnnounced`, `lastVacated` (ETH-025)
  and `observedFountains` (ETH-094: the last draught id the party observed by drinking from each
  fountain, keyed by fountain entity id).
- **Return-trip repopulation & deep surge (ETH-025, ETH-136, `floors/respawn.ts`, `combat/encounters.ts`, `combat/monsters.ts`):** when a party
  member re-enters an already-built floor that currently has no living party members on it
  (`!firstVisit && wasEmpty`, unless `monsters: false` or `respawn.enabled: false`), `maybeRespawnFloor`
  spawns a deterministic wave (seeded from `respawn/<floor>/<wave>`). Under default rules, once
  `contractsComplete(state)` holds and the party ascends (`dir === 'up'`, `!continuous`, `prior === 0`),
  `surgeFloor` launches a post-contract **deep surge** driven by `runDungeon(state).encounters?.surge`
  (defaulting to `{ dangerWindow: 2, templateBonus: 0.15, countMul: 1 }`): it selects monsters from
  `[max(1, bottomDanger - surge.dangerWindow), bottomDanger]` (where `bottomDanger = floorDanger(state, dungeonDepth(state))`,
  unless `respawn.depthShift` is explicitly set), raises template probability by `+surge.templateBonus`
  over `templateChanceFor(dungeon, spawnDanger)` (clamped `[0, 1]`), scales wave size by `surge.countMul`
  (honoring `respawn.min` / `respawn.max`), and deploys cohesive route-biased room squads and hunter
  patrols (`groupId`, `homeRoom`, `patrol`) while strictly honoring `stairsDistance` (7) from arrival
  and exit stairs and excluding stairs rooms. Voluntary Retreat before contract completion remains
  un-surged, and `FLAG_CONSTANT_RESPAWN` (`'floors.constant_respawn'`, ETH-129) or `respawn.continuous`
  stays anchored to local `floorDanger + depthShift` via `respawnFloor` after `CONSTANT_RESPAWN_COOLDOWN` (50)
  turns. `dungeonStirred` (`"The dungeon stirs."`) is emitted once per run on the first repopulated
  floor, while quiet `floorRespawned` (`surged?: true` on surges) is emitted for every repopulated floor.
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

- **Content:** `ItemDef` = `{ glyph, category, weight, value, stack?, bundle?, gear?, loot? }`.
  Categories (`ITEM_CATEGORIES`): `potion`, `scroll`, `food` (ETH-054 fills it), `weapon`,
  `armor` and `jewelry` (worn: see Equipment below), `relic` (ETH-024; never dropped), `gold` (goes to the purse),
  `junk`. `isJunk(def)` (category `junk` or tag `junk` / `corpse`), `isUsable(def)` (its bundle
  has `effects`) and `healAmount(def)` read a def. `bundle.effects` run on use; `bundle.modifiers`
  and `triggers` apply while gear is worn (ETH-043). `bundleOf(itemId)`
  works, since the field is called `bundle`.
- **Instances:** `ItemInstance = { def, qty, origin? }`, plain data. Every field but `def` and
  `qty` is an **item property** (below, ETH-118): optional, so no migration, and `canStack(a, b)`
  goes by each property's `stacks` rule. `addToStacks` merges up to the def's `stack`.
- **Where items are:** on a floor, an entity whose `def` is the item id with an `item` part (the
  instance); `placeItem(state, floor, pos, item)` adds one (merging), `itemsAt` / `floorItems`
  find them. Carried, an entry of the actor's `inventory: { items: ItemInstance[] }`
  (`ensureInventory`, `inventoryOf`, `addToInventory`, `takeFromInventory`). Adventurers get the
  part on their first pickup. A `FloorPlan` may list `items`; `addFloor` creates them.
- **Weight:** `carryWeight(state, entity)` against `carryLimit` (the `carry` stat, from
  attributes); `isOverloaded`.
- **Value:** `itemValue(state, item)` (whole stack) and `unitValue` (one) are the only scoring
  function. They start from the def's `value` and apply `ITEM_VALUE_HOOKS` (`value.ts`) in
  order. The first, `value.properties`, applies each item property's `value`; worth that belongs
  to one property goes there, not in a new hook.
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
- **Codex:** `itemSighted` and `pickedUp` mark an item `seen`, `used` and `equipped` mark it `used`.

### Equipment (ETH-043, ETH-111)

Content in `src/content/items.ts`, sim in `src/sim/items/equipment.ts` and `actions.ts`.

- **Slots:** `EQUIP_SLOTS` = `mainHand`, `offHand`, `head`, `body`, `hands`, `feet`, `neck`,
  `ring1`, `ring2` (ETH-111), one item each (`EQUIP_SLOT_INFO` has labels and tooltip text). No
  two-handed weapons.
- **Base types:** a weapon, armor or jewelry def (category `jewelry`, ETH-111) must have
  `gear: { type }`, and nothing else may. `GEAR_TYPE_INFO[type]` = `{ label, slots, category,
  description, scalesWith? }` (sword, dagger, axe, mace, staff; shield, helm, light/medium/heavy
  armor, gloves, boots; amulet; ring). `slots` lists every slot the type fits: one for most, both
  ring slots for `ring` (`gearSlots(def)`, empty for non-gear). `scalesWith` (an `AttributeId`) is set on every weapon type
  and nothing else (ETH-082, "Weapon scaling" in "Item properties (ETH-118)"). Gear never stacks and has no `effects`. Its **base stats are `bundle.modifiers`**.
- **Worn items** sit in `inventory.equipped: Partial<Record<EquipSlot, ItemInstance>>` (qty 1; the
  field is left out while nothing is worn). They are not pack entries and don't count in
  `carryWeight` (Carry limits the pack; counting worn armor crowded out potions in the sim
  compare), so pack indices, dropping and `lowestValueIndex` never see them.
- **Stats:** the `items.equipped` `BundleSource` visits `gearBundles(state, wearer, item)` for
  each worn item: the def's bundle, then each item property's bundles, every one credited to the
  item's def id (tooltip "Iron hatchet +2", one part per bundle); triggers fire through it too.
  Enchantment, affixes and scaling are item properties with `bundles` (ETH-118), which reach
  stats, triggers and the AI's comparison at once.
- **Actions:** `equip { index, slot? }` (`slot` defaults to `slotFor`: the first empty slot the
  item fits, else its first; the old item there goes back into the pack) and
  `unequip { slot }`; both call `clampVitals`. Events `equipped { actor, item, slot, replaced,
  floor, pos }` and `unequipped { actor, item, slot, floor, pos }`. ETH-044's curses refuse
  `unequip` (and replacing) in `validate`.
- **AI:** `compareGear(state, wearer, a, b)` → `better | worse | same | mixed`, stat by stat over
  `gearBundles` (every stat higher is better; any triggers make it `mixed`).
  `upgradeSlot(state, entity, item)` is where a piece would be an
  upgrade: an empty slot it fits first (if it beats nothing), else a worn item it beats, the weaker
  of the two rings when one beats the other. `bestUpgrade(state, entity)` picks a pack item for the first
  such slot in `EQUIP_SLOTS` order, never one another candidate beats, so equipping never
  flip-flops (a replaced ring never beats the one left on). The rule action passes the slot, and
  its trace names it for rings ("… (left ring), nothing worn there yet"). A clear upgrade is
  always wanted (`wantsItem`), and while overloaded the baseline puts one on before dropping
  anything (`ITEMS_BASELINE_URGENT`), since worn gear frees the pack.
  `act.equip_upgrade` (baseline, after `act.use_identify` and `act.read_unknown_scroll` in `ITEMS_BASELINE_LOOT`, so not next to an enemy) puts it
  on with a trace line ("equipping the Arming sword (Damage +2, Accuracy +1) in place of …").
  **Unidentified gear (ETH-142):** all gear starts `identified: false`, so the baseline weighs it
  through `evaluateUpgrade`, which reads known stats, the def and the floor's depth number, never the
  hidden properties. It waits while the pack holds a known Scroll of Identify. Otherwise the gain in
  base stats (in enhancement points of the def's base enchantment) must beat `hiddenGearMargin(def,
  depth)` from `hiddenValue.ts`: the expected value of what `rollItemProperties` may have rolled (computed from
  its chances, specials converted by `valuePerLevel`) plus `CURSE_LOCK_PREMIUM × P(cursed) × expected
  curse penalty`, the price of the rest-of-run slot lock. The trace shows the numbers ("gain +2 vs margin
  1.04 (expected hidden +0.14, curse lock risk +0.9)"). Items held back, and gear that would beat a cursed
  worn piece (a locked slot), are said once in a `gearHeld` event (AI log) when the set of reasons for a party
  member changes (`ItemsState.heldNotes`), not as a note on whichever rule fires next. `WornView.locked` explains a locked slot on the party card, and
  `track.cursedGear` counts the turns a living party member wore cursed gear for the run summary.
  The Wits roll on pickup happens once per item instance (`prop.identify_tried`, `stacks: 'ignore'`,
  cleared when the item is identified).
  Tradeoffs are left to player rules or possession. `modifierText`, `gearStatsText(state,
  wearer, item)` and `bundleStatsText(bundles)` (the Codex, on a def's bundle) word stats.
- **Snapshot / UI:** `InventoryView.equipped: WornView[]` (`{ slot, def, name, weight, value }`); the
  party card lists worn gear above the pack. The item Codex renderer adds `Worn` (slot · type) and
  `Stats` key fields, so every `Explain` (pack, map hover, log) shows them.
- **Invariants:** `items.parts` checks worn items: known slot, valid instance, qty 1, one of the
  def's slots.

### Item properties (ETH-118)

All in `src/sim/items/properties.ts` (kinds, registry, problems) and `name.ts` (`itemName`).
The one extension point for "this particular item is different": **a feature that adds
per-instance item data adds an `ItemPropertyKind`, not its own edits to `gearBundles`,
`canStack`, value or naming.**

- **Kind:** `ItemPropertyKind<T> = { id ('prop.*'), field, schema (zod), bundles?(ctx, value),
  value?(ctx, value, base), name?(value) → { prefix?, suffix? }, hidden?(value, known),
  known?(ctx, value | undefined), stacks: 'never' | 'equal' }`, with `ctx = { state, item,
  wearer? }` (`ItemPropertyCtx`; `value` gets no wearer). `field` is a top-level optional field
  of `ItemInstance` that the kind owns; add the field to the interface (with a doc comment) in the
  same change. Values are plain data.
- **Registry:** `ITEM_PROPERTIES`, in a fixed order: `ITEM_PROPERTY_LIST` in `properties.ts`
  (items-domain kinds) is registered at load. That order is the order of bundles, value
  adjustments and name parts, so the planned order is `enchant`, `blessing`, affixes (prefixes
  and suffixes), then the rest. A kind owned by another domain would get a
  `SimDomain.itemProperties` list (not added yet). `registerItemProperty(kind)` returns an
  unregister function, for tests (a test adds its field to `ItemInstance` with
  `declare module`, see `test/sim/itemProperties.test.ts`).
- **Bundles:** `gearBundles(state, wearer, item)` = the def's bundle, then each present
  property's `bundles(ctx, value)` in registry order. `SOURCE_EQUIPPED`, `compareGear`,
  `upgradeSlot`, `bestUpgrade` and `gearStatsText` all go through it, so getStat (a part per
  bundle, credited to the item's def), triggers and the AI's upgrade check see properties at once.
  `wearer` is who wears it or would; a wearer-dependent property (ETH-082 scaling, reading
  `GEAR_TYPE_INFO.scalesWith` and `ctx.wearer`'s attribute) adds nothing without one.
- **Value:** `value.properties`, the first `ITEM_VALUE_HOOKS` entry, folds each present
  property's `value(ctx, value, base)` in registry order.
- **Name:** `itemName(state, item, viewer?)` = prefixes, the def's name, suffixes ("+2 cursed
  Iron hatchet of Embers"). The item is *known* to the viewer unless some kind's `known(ctx,
  value)` returns false (called for every kind, `undefined` when the field is absent: ETH-044's
  `identified`); a part whose `hidden(value, known)` is true is left out. No viewer counts as
  known. `nameField(state, item, viewer)` is `{ name }` only when the name differs from the def's.
- **Where names show:** item events (`pickedUp`, `dropped`, `used`, `equipped` (+ `replacedName`),
  `unequipped`) carry an optional `name` from `nameField` with the actor as viewer, so plain items'
  events are unchanged; log text passes it as the mention label. `ItemView.name` and
  `WornView.name` (viewer = the member) feed the party card, whose `Explain` takes `name` for the
  link text and the card heading. The AI's trace lines use `itemName`. Floor memory (`KnownItem`)
  and `itemSighted` stay def-only.
- **Stacking:** `canStack` needs the same stackable def, then for each field but `def` / `qty`:
  absent on both is fine; a `never` kind present on either keeps them apart; anything else must
  be deep-equal (keys sorted).
- **Validation:** `propertyProblems(item)` (a field no kind owns, a value its schema rejects);
  invariant `items.properties` runs it on every floor item, pack entry and worn item.
  `instanceProblem` still checks only `def` and `qty`.
- **`origin`** (`prop.origin`, field `origin: ItemOrigin = { by?, run?, note? }`: adventurer record
  id, the run's number in the profile history, flavor text): no bundles, value or name;
  `stacks: 'never'`, so an heirloom never merges with a plain item. Kept through pickup, drop and
  equip like any field. ETH-069 sets it on heirlooms, ETH-109 uses `note`.
- **State version:** a new optional field changes no existing save, so adding a kind needs no
  `STATE_VERSION` bump unless it also changes existing data.
- **Derived properties** (`ItemDerivedProperty = { id, bundles(ctx) -> ItemBundle[] }`,
  `ITEM_DERIVED_PROPERTIES`): own no field, so they never touch stacking, value, naming or
  validation; their bundles follow the field kinds'. An `ItemBundle` is `{ bundle, source?, label? }`:
  `getStat` credits it to `source` (default the item's def) under `label` (default the source's
  name). `gearBundleParts` returns the credited form, `gearBundles` the bare bundles, and
  `BundleVisitor` takes an optional `label` as its fourth argument.
- **Weapon scaling (ETH-082, `scaling.ts`, `prop.weapon_scaling`):** a weapon's damage uses its
  type's `scalesWith` (sword, dagger Finesse; axe, mace Brawn; staff Wits) instead of
  `UNARMED_ATTRIBUTE` (Brawn, content), which the attribute provider's `DAMAGE_FORMULA` row
  (`(attr - 10) x 0.5`) uses. For a wearer with attributes and a weapon whose attribute isn't
  Brawn, it adds two bundles: `+formula(weapon attribute)` credited to that attribute ("Finesse 14
  (Arming sword)") and `-formula(Brawn)` credited to Brawn ("Brawn 12 (unused with Arming
  sword)"). So `getStat` parts show the breakdown, the party card's attribute chips sum their
  parts per stat (Brawn nets to nothing), and `compareGear` weighs the weapon by the difference the
  wielder's attributes make (still Pareto only; ETH-112's weighted score is tabled).
  `gearStatsText` sums modifiers per stat and op. `ItemView.scaling` / `WornView.scaling` carry
  `weaponScalingText` ("Damage scales with Finesse 14 instead of Brawn 12: +1 damage"), shown as
  the item tooltip's `note`; the Codex item card has a "Scales with" field. Spells (ETH-037)
  should scale with Wits through the same `DAMAGE_FORMULA` when they exist.
- **Enchantment, beatitude and identification (ETH-044, `src/content/enchantments.ts`,
  `src/sim/items/enchant.ts`, `identify.ts`, `effects.ts`):**
  - `ENCHANTMENTS` (`enchant.*`, `ENCHANTMENT_KIND`) is a data-driven content kind with `kind: 'base'`
    (drives numeric `+N`/`-N` per gear category or `GearType`: `enchant.honed`, `enchant.reinforced`,
    `enchant.attuned`) and `kind: 'special'` (named/effect enchantments with full `Bundle`s:
    `enchant.keen`, `enchant.venomous`, `enchant.vampiric`, `enchant.nimble`, `enchant.warding`).
  - Built-in `ITEM_PROPERTY_LIST` order: `prop.enchant` (`enchant?: number`), `prop.blessing`
    (`blessing?: 'blessed' | 'cursed'`), `prop.enchantments` (`enchantments?: { id, level }[]`),
    `prop.identified` (`identified?: boolean`, absent = known), `prop.identify_tried` (`identifyTried?: true`,
    ETH-142), `prop.mix` (`mix?: { plain?, blessed?, cursed? }`, ETH-147), `prop.origin`.
  - Cursed gear refuses `unequip` and `equip` replacement in `validate`; `upgradeSlot` skips cursed
    slots and known-cursed items; blessed/cursed consumables scale `runEffects` potency (`1.5×`/`0.5×`)
    and gear shifts enhancement (`+1`/`-1`). `Scroll of uncursing` (`{ kind: 'uncurse' }`) and
    `Scroll of identify` (`{ kind: 'identify' }`) run via `ITEMS_DOMAIN.effectHandlers`.
  - Potions, scrolls and jewelry start with deterministic per-seed generic appearances
    (`appearanceName(seed, defId)`) until learned in `state.domains.items.identifiedTypes`; weapons
    and armor hide `+N`, beatitude and special enchantments until instance-identified via Wits
    `identify` on pickup (`tryIdentifyOnPickup`), wearing, using, or Scroll of Identify. AI gear
    comparisons pass `knownOnly: true` so the AI never peeks at hidden properties.
  - **Unidentified potions and scrolls (ETH-147, `src/sim/items/mix.ts`):** the older ETH-044 rule, where
    learning a type cleared the flag on plain copies, is gone because the flag then told plain copies from
    special ones. Now `identified: false` means "this copy is not identified" whatever it holds, and
    `isItemIdentified` ignores what the copy rolled and whether its type is known. Learning a type shows
    its real name (still no blessing prefix) and a shared "Blessing unknown" note; nothing else changes.
    Unidentified potions and scrolls of one def stack together whatever their blessing (`canStack` skips
    `blessing` and `mix` when both are unidentified consumables, so separate stacks give nothing away
    either). A stack is **plain** (no `blessing`, no `mix`), **uniform** (`blessing` set for every copy)
    or **mixed** (`mix` counts per group, at least two non-zero, summing to `qty`, no `blessing`):
    `setHiddenCounts` always writes that canonical form. Merging
    (`addToStacks`, `placeItem`) sums the counts, and a stack-size overflow splits them off the front of
    the groups (`takePart`).
  - **Which copy comes off a mixed stack:** `takeFromInventory(entity, index, qty, state)` draws the
    copies without replacement on `state.rng.loot` (`drawHidden`), so a use or a partial drop is seeded and
    nobody can choose a blessed copy. `use` takes one copy, identifies that copy (potency follows its
    blessing) and leaves the rest hidden; a partial drop puts the drawn copies on the floor with their
    own counts, and picking them up merges the counts back. A full-stack take needs no draw.
  - **Identifying a mixed stack** (a Scroll of Identify, the pickup Wits roll, `identifyItemFor`) reveals
    the whole stack and splits it into one identified stack per group (`identifyInstance` returns the
    extras, which go into the pack), with one `itemIdentified` event each; a plain group logs "no blessing
    or curse". `identifyTried` still means one roll per stack (`stacks: 'ignore'`), so split-and-merge
    cycles gain no extra rolls. Reading an uncursing scroll over a mixed stack turns its cursed copies
    plain and leaves it unidentified. Known gap: the roll is tracked per stack, not per copy, so merging
    an untried copy into a tried stack drops the flag and a later drop and pickup can roll the stack again.
- **Planned kinds:** ETH-045 `affixes` (a bundle and a prefix or suffix each; artifacts are fixed affixes);
  ETH-096 `charges { n, max }`.

### Content kinds

Besides terrain, features, classes, races and floor types, these kinds exist as placeholders
with a registry, a minimal schema (the `Def` fields only), a `KIND` in `CONTENT_KINDS` and a
`define*` helper, but no defs: `monster` (`src/content/monsters.ts`),
`bounty` (`bounties.ts`), `omen` (`omens.ts`) and `deity`
(`deities.ts`). The owning item extends the def type and the schema together and adds the
defs. `src/content/index.ts` re-exports them with `export *`. `contract` (`contracts.ts`) became a
full kind with ETH-024 ("Contracts in the run").

`dungeon` (`src/content/dungeons.ts`, ETH-064) is a full kind: a dungeon variant the Prepare
screen offers (`depth`, `floorType`), first def `dungeon.old_delve`. A variant some upgrade
unlocks is offered only once that upgrade is owned (§6.3).

`doctrine` (`src/content/doctrines.ts`, ETH-063) is a placeholder too: party-wide behavior
options that upgrades unlock (below). `building` and `upgrade` (`src/content/upgrades.ts`,
ETH-063) are full kinds; each building's
defs live in `src/content/town/<building>.ts` (§6.2). A kind may add `check(defs)` for rules
that span several defs (`checkKinds` runs it after the ref checks).

ETH-057 added two real kinds: `bundle` (`bundles.ts`, `bundle.*`: a stand-alone bundle such as
a trait or blessing) and `status` (`statuses.ts`, `status.*`, with four first defs: Hasted,
Regenerating, Poisoned, Dazzled; ETH-072 added Keen-eyed and Queasy). ETH-072 added `draught`
(`draughts.ts`, `draught.*`): the fountain table (Mending, Bright, Brackish and Still water).

### Shared conditions (ETH-121)

One predicate vocabulary for the whole game: the rule conditions in `CONDITIONS`. Data that
needs "a check" (unlocks, taboos, quirk triggers, building quests) writes a `Requirement` against
them instead of growing its own predicate language, so the rules editor and data checks share one
vocabulary.

- **Scope.** `ConditionDef.scope` is `'actor'` (the default: reads the deciding actor, needs an
  `AiCtx`) or `'run'` (reads the run alone). `RunCtx = { state }`; `AiCtx extends RunCtx` with
  `actor`. `defineCondition({ scope: 'run', evaluate(ctx: RunCtx, p) })` types the ctx by scope,
  so a run condition can't read an actor by mistake; an actor condition given a ctx with no actor
  doesn't hold ("needs an adventurer to check"; `hasActor(ctx)`). Run-scope so far: `cond.always`,
  `cond.heading_out`, `cond.contracts_complete`, `cond.bottom_floor` (now "a living party member
  stands on the bottom floor", not the deciding actor's floor), `cond.at_depth { depth }` (a
  living party member is on floor `depth` or deeper), `cond.run_kills { min }` (party monster
  kills this run, from `track.kills`) and `cond.run_identified { min }` (items identified this
  run, from `track.identified` over `itemIdentified` events). A run-scope condition gives the same answer
  in a rule and in a requirement.
- **`Requirement`** (`src/content/requirements.ts`, plain data, `requirementSchema`):
  `{ cond, params? } | { all: Requirement[] } | { any: Requirement[] } | { not: Requirement }`.
  `RequirementScope` is `'actor' | 'run'`. Content helpers: `requirementLeaves(path, req)`,
  `requirementRefs(path, req, scope)` (refs of kind `CONDITION_REF_KIND` carrying params and
  scope in `ContentRef.use`), `requirementKey(req)` (stable JSON, key order ignored) and
  `wordRequirement(req, words)` ("a, b and c", "a or b", "not a"; nested compounds bracketed).
- **Sim** (`src/sim/ai/requirements.ts`): `checkRequirement(ctx: RunCtx, req)` returns
  `{ ok, detail }` (`all` joins its parts' details or gives the first failing one, `any` the first
  holding one, `not` none; unknown ids don't hold). `describeRequirement(req)` words it from each
  condition's `describe` ("HP below 30% and not on the bottom floor"); also `describeCondition`,
  `requirementScope(req)` and `requirementProblems(req, scope)` (unknown ids, bad params, an actor
  condition in a run requirement, each with its path).
- **Validation.** A kind that embeds a requirement lists `requirementRefs` in its `refs`.
  `checkGame` passes `CONDITION_TARGET` (`CONDITIONS` as a `RefTarget` with `checkRef`), so
  `checkKinds` reports unknown conditions, bad params and an actor condition in a run-scope
  requirement as content problems. `RefTarget.checkRef(ref)` is the general hook for a target
  that checks more than existence.
- **Profile scope.** Lifetime checks stay in the `Milestone` vocabulary; run-level checks reach it
  only through `{ kind: 'metInRun', requirement }` (run scope; `milestoneRefs` validates it and
  buildings include it in their refs). `buildRunConfig` puts the locked `metInRun` requirements
  (`milestoneRequirements(profile)`, one per key) into `RunConfig.watchRequirements`, and
  `checkRunConfig` runs `requirementProblems(req, 'run')` on them. The run domain's
  `track.requirements` checks each watched requirement not yet met at the end of every step
  (`afterStep`) and records its key; its state and extras are `{ met: string[] }`, read with
  `metRequirements(extras)`. `applyRunResult` calls `unlockMilestones(profile, result)`, whose
  `MilestoneProgress.metInRun` holds those keys, so the milestone unlocks after that run.
  `describeMilestone` / `describeMilestoneMet` take the sim's `describeRequirement` as `words`
  ("Achieve in one run: on floor 3 or deeper"); the default names conditions by id.
- **For later items:** ETH-114's `condition` objective wraps a `Requirement`; ETH-036 writes
  unlocks as `metInRun` milestones; ETH-070 writes a taboo as a run requirement that must never
  hold; ETH-104 checks an actor-scope requirement with an `AiCtx` on an event. A new run-level
  check is a run-scope condition in its domain's `conditions`, never a new predicate type.

### Run-wide modifiers (ETH-115)

All in `src/sim/stats/runModifiers.ts` (stats domain). The one way to change the run as a whole:
**Omens (ETH-067), blessings (ETH-070), cursed modifiers (ETH-105), dungeon events (ETH-107),
doctrine (ETH-071) and Tavern veterans add a run modifier, not their own `BundleSource`, flag
store or reward math.**

- **Shape:** `RunModifier = { key, source: { id, label }, scope: 'party' | 'monsters' | 'all',
  bundle?, potency, flags?, rewardBonus?, xpBonus?, contractBonus?, until? }`, plain data. `key` is unique in the run.
  `xpBonus` (ETH-132) adds to the in-run XP multiplier (`xpMultiplier`, read by `grantXp`) and `contractBonus`
  to the pay of completed contracts (`contractMultiplier`, read by `contractReward(id, state)`), both
  additive across sources and before the reward multiplier.
  `source.id` is credited in stat tooltips and discovered in the Codex (when it is a content id);
  `source.label` is the tooltip text ("Gloom (Omen, rank 2)"). `bundle` is any def with a bundle
  (`bundleOf`) or an upgrade node id, whose `run`-scope grants are used (`runBundleOf`).
  `until` is `{ floor: FloorId }` (ends when a party member first takes the stairs off that
  floor) or `{ turn }` (ends at the first actor turn on or after that game turn); left out, the
  whole run.
- **State and config:** `state.domains.stats.runModifiers` (in the order added) and
  `runModifiersAnnounced`. `RunConfig.runModifiers?: RunModifierConfig[]` (same, `potency`
  optional, default 1) starts the list; `createRun` throws on a malformed one
  (`runModifierListProblems`, also in meta's `checkRunConfig`). Invariant `stats.runModifiers`.
- **Changing it mid-run:** `addRunModifier(state, config, emit)` (a key already in force is
  replaced) and `removeRunModifier(state, key, emit, reason = 'removed')` → boolean. Both emit
  (`runModifierAdded { key, source, scope, rewardBonus?, atStart?, replaced? }`,
  `runModifierRemoved { key, source, reason: 'removed' | 'expired' }`; log text in
  `logText/stats.ts`, category `system`) and clamp current HP and MP to lowered maxima (a raised
  maximum doesn't heal; a monster spawned later starts at its def's HP). The config's modifiers
  are announced as `runModifierAdded { atStart: true }` on the run's first actor turn. Expiry runs
  in the stats turn hooks (`until.turn` at turn start, `until.floor` at the end of the turn a
  party member left the floor).
- **Bundles:** the `stats.run` `BundleSource` (after `stats.statuses`) visits each modifier with
  a bundle whose scope includes the entity: `party` = `party`-faction actors (later allies too),
  `monsters` = `monster`-faction actors, `all` = every actor. It passes `source.label`, so
  `getStat` parts read `{ source: { id: 'omen.gloom', label: 'Gloom (Omen, rank 2)' } }`, and
  `fireTrigger` fires its triggers at the modifier's potency.
- **Flags:** `runFlag(state, flag)` is true while some modifier lists `flag`
  (`doctrine.seek_stairs`, `omen.dry_wells`). Rules and data `Requirement`s use the run-scope
  condition `cond.run_flag { flag }`.
- **Rewards:** `rewardMultiplier(state)` = max(0, 1 + Σ `rewardBonus`), additive across sources
  ("Rewards" above for the order and rounding).
- **Snapshot:** `snapshot.domains.stats.runModifiers` (`RunModifierView` = the modifier plus
  `text`, `describeRunModifier`: "The party: Sight −2. Rewards +50%. Ends when the party leaves
  floor 3.") and `rewardMultiplier`, for a HUD strip and its tooltips. Helpers for wording:
  `scopeWords`, `rewardBonusText`.
- **Meta:** `upgradeRunModifiers(profile)` (`meta/prepare/build.ts`), used by `buildRunConfig`.
- **Omens (ETH-185):** an Omen rank is a modifier with `source.label` naming the rank, a bundle
  and/or a flag, and a `rewardBonus` (§6.3, Omens).
- **For later items:** a blessing a `party` modifier credited to the deity; a curse
  `addRunModifier` from an encounter outcome; a dungeon event a modifier with `until: { floor }`;
  doctrine a flag-only modifier read with `runFlag`; a veteran a `party` modifier.

### Objective engine (ETH-114)

"A goal with progress toward a target, complete or failed", shared by contracts, bounties,
conducts, taboos, building quests and achievements. Content in `src/content/objectives.ts`; sim
in `src/sim/quests/objectives.ts`.

- **Content:** `Objective` is a union by `kind`: `recover { item }`, `count { event, match?,
  count }`, `reach { depth }`, `condition { requirement }` (a run-scope `Requirement`, ETH-121)
  and `avoid { event, match? }`. `event` is a sim event type (`killed`, `drankFountain`);
  `match` (`EventMatch`) is event field → value, all of which must be equal. `objectiveSchema`
  checks the shape; `objectiveRefs(path, objective)` lists the refs (a `recover` item, each
  id-shaped `match` value in the registry its prefix names, a `condition`'s conditions with run
  scope). `ObjectiveOwner` = `{ kind: 'contract' | 'bounty' | 'conduct' | 'taboo' | 'quest', id }`,
  keyed by `objectiveOwnerKey` (`contract:contract.recover_relic`); `objectiveOwnerSchema`,
  `objectiveOwnerRefs` (contract and bounty owners must exist).
- **Kinds** (`OBJECTIVE_KINDS`, one entry per content kind, checked at compile time):
  `{ kind, measure: 'state' | 'events', goal: 'reach' | 'avoid', target(spec), progress(state,
  spec, counter) → { current, by? }, reduce?(counter, event, spec), describe(spec) }`. A `state`
  kind is remeasured from the run at each sync (`recover`, `reach`, `condition`); an `events`
  kind folds events into a whole-number `counter` kept in the slice, so it survives a save
  (`count`, `avoid`). A `reach` goal is complete once `current ≥ target`; an `avoid` goal
  (target 0, `current` = times it happened) fails the first time and is **complete at run end**
  if it never did. Helpers: `describeObjective(spec)`, `measureObjective(state, spec, counter)`,
  `objectiveStatus`, `eventMatches`, `carrierOf`.
- **State:** `state.domains.quests.objectives: TrackedObjective[]`, each `{ key, owner, spec,
  counter?, current, target, status: 'active' | 'complete' | 'failed' }`, and `folded` (how many
  of the current step's events are folded; 0 between steps). `initQuests` tracks the contracts;
  `trackObjective(state, owner, spec, key?)` adds one mid-run (throws on a repeated key), and it
  counts only events folded after that (**`count` counts from when it is tracked**). Also
  `newObjective`, `findObjective`, `objectivesOf`.
- **Syncing:** `syncObjectives(state, events)` folds the step's unfolded events (`TurnCtx.events`,
  the step so far) into each active `events` objective, remeasures, and returns the
  `ObjectiveChange`s (`{ objective, before, by, atRunEnd }`). The quests domain runs it from
  `turnStart`, `turnEnd` and the new `SimDomain.stepEnd` hook (`StepCtx = { state, emit, events
  }`, run once per step before the trackers, so events after the last turn, like `fell` and
  `runEnded`, count too; `finishObjectivesStep` resets `folded`). Once the run has ended,
  `state` progress is frozen and active `avoid` objectives become `complete`. **The engine emits
  no events: each owner words its own changes** (contracts: `syncContracts` emits
  `contractProgress` / `contractCompleted` / `contractLost`, nothing for run-end changes).
- **Results:** the `quests.objectives` tracker copies every objective's `{ key, owner, status }`
  after each step; `RunResult.extras['quests.objectives']` is that `ObjectiveRecord[]`, read with
  `objectiveRecords(extras)` and `completedObjectives(extras)` (owner keys of the complete ones).
- **Milestone:** `{ kind: 'objectiveDone', owner }` is met when the banked run ended with that
  owner's objective complete (`MilestoneProgress.objectivesDone`, filled by meta's
  `milestoneProgress` from the result). `describeMilestone` / `describeMilestoneMet` take a third
  `names` argument (pass `defName`) to name the owner.
- **Invariant** `quests.objectives`: unique keys, known kinds, whole numbers, `target` as the kind
  says, `current ≤ target` for a `reach` goal, a counter exactly for `events` kinds, status as
  progress (and the run end) says, `folded` 0. `quests.contracts` also checks each contract
  agrees with its objective.
- **For later items:** a contract type (026/027/032) is an objective kind; a bounty (029/030) is
  an objective with owner `bounty` and its own reward tracker; a conduct (067) is an `avoid` with
  owner `conduct` (kept ones read `complete` in the result); a taboo (070) is an `avoid` or a
  `condition` with `not`; a building quest (093) is owner `quest` plus an `objectiveDone`
  milestone; quest rule conditions (031) read `TrackedObjective`s.

### Monster templates (ETH-117)

"This base monster, but more", without a new `MonsterDef`. Content in
`src/content/monsterTemplates.ts`; sim in `src/sim/combat/overlay.ts`.

- **Content:** the `template` kind (`MONSTER_TEMPLATES`, ids `template.*`):
  `{ prefix?, suffix?, stats?: { add?, mul? } (stat id → number), bundle?, role?, powers?
  (bolt / mend / bolster), threatMul, lootTier (0–MAX_LOOT_TIER 3), weight, glyphTint?,
  families? (monster tags it fits) }`. Validated: a prefix or suffix, stat refs, bundle refs, a
  caster template has `powers.bolt`, a support `powers.mend` or `bolster`. First defs: Venomous
  (hit trigger poisons, beasts and swarms), Swift (speed ×1.3), Hulking (HP ×1.5, damage +1),
  Hexspitting (role caster with a bolt). `templateFits(t, def)`, `templateDefs(ids)`,
  `MAX_TEMPLATES` 2. Names: `monsterDisplayName(def, { templates?, name?, title? })` → "Swift
  venomous gloam rat", "Vell the Unbowed" (an own name drops the prefixes), `isProperName`.
  Content uses prefixes only (the approved default); `suffix` exists for later.
- **Role:** `RoleOverride = { role?, powers? }` (templates are one). `monsterRules(def,
  overrides?)` (a new role uses its `ROLE_RULES`), `monsterRole`, `monsterPowers`. The sim's
  `rolePowers(actor)` reads the monster's templates.
- **Overlay** (`MonsterOverlay`, plain data on `monster.overlay`): `{ templates?, name?, title?,
  stats?: { add?, mul? }, bundles? (bundle ids), threatMul?, lootTier?, carries?: ItemInstance[] }`.
  `spawnMonster(state, defId, floor, pos, overlay?)` checks it (`overlayProblems`, throws a
  `RangeError`), builds the AI from the overlaid role and fills vitals. `newMonster(def, pos,
  overlay?)` (was `monsterTemplate`) builds a plan spawn at `spawnHp(def, overlay)`; `addFloor`
  now `fillVitals` every spawn, so anything that raises a monster's max HP (templates, ETH-115
  monster modifiers) spawns it full.
- **Stats:** stat provider `combat.overlay` (after `stats.base`, `stats.class_race`,
  `stats.attributes`) adds each template's `stats` credited to the template (label "Hulking"),
  then the overlay's own, credited to the def under the monster's name. Bundle source
  `combat.templates` (after `stats.run`) visits each template's `bundle`, then the overlay's
  `bundles`; their triggers fire like any bundle's.
- **Reading it:** `overlayOf`, `templatesOf`, `monsterName(entity)` (used by `actorName`, so
  `ActorView.name`, `died.name` and killers), `shownName(entity)` (`{ name, proper? }` when the
  overlay changes the name), `monsterThreat(entity)` (def threat × each `threatMul`, rounded, ≥ 1;
  `killed.threat`, Trophies, kill XP), `monsterLootTier(entity)` (highest tier; for ETH-052),
  `monsterTint(entity)` (`ActorView.tint`; the map draws glyph id `def@#rrggbb` in that color).
  The AI's `nameOf` uses the same names.
- **Events:** `attacked`, `missed`, `aided`, `killed`, `monsterSighted` and `fleeFailed` carry
  `names?: EventNames` (entity id → `ShownName`, from `namesOf(...entities)`) only when an overlay
  changes a name, so plain events are unchanged; `died` adds `proper?`, `templates?` and `drops?`
  (`DroppedLoot`: the `carries`, placed on its tile with `placeItem` after it leaves);
  `monsterSighted` adds `templates?` and `ood?: true` (and triggers the `oodSighted` chronicle moment when out of depth). `Killer.proper` / `source.proper` keep a proper name's
  capitals and drop the article ("was slain by Vell the Unbowed").
- **Codex:** `monsterSighted` discovers each template (`seen`) and `templateMetKey(def, template)`
  (`met.<def>.<template>`, not a content id); the monster entry's "Variants met" reads
  `templatesMet(discovered, def)`. Templates have their own section ("Monster variants").
- **Generation:** `gen.monsters` param `templateChance` (0–1, default 0): per monster, roll it up
  to `MAX_TEMPLATES` times from the floor RNG, picking a fitting template by `weight` on each
  success (`rollTemplates`). At 0 nothing is drawn, so existing floors are unchanged; no floor
  type sets it yet.
- **Invariant** `combat.overlay`: `overlayProblems` on every overlay (≤ 2 known, fitting, unique
  templates; known stats with finite changes, mul > 0; known bundles; threat and loot tier in
  range; valid carried items) and every stat finite.
- **For later items:** ETH-041 uniques are content overlays (name, title, stats) on a base def;
  ETH-052 elites roll 1–2 templates (`rollTemplates`) and read `monsterLootTier`; ETH-109 Ethan
  is an overlay with tiny HP and `carries`; ETH-101 / ETH-099 store an overlay in the profile and
  spawn it with `spawnMonster`; ETH-042 families fill `families`. Chronicle entries still name
  monsters by def only (a follow-up).

### Shared systems

Foundations that many later features share. **New features must use or extend these, not build
parallel versions.** If one doesn't fit, extend it (and this list) in the same change, or raise
it on the item before starting. Each is a backlog item; its spec has the API, the defaults and
the features that use it.

| System | Item | Status | Purpose |
|---|---|---|---|
| Objective engine | ETH-114 | built | One `Objective` union, progress kinds (`OBJECTIVE_KINDS`) and tracked objectives with an owner, lifted from ETH-024's `contractProgress`: contracts, bounties, conducts, taboos, building quests, achievements. See "Objective engine (ETH-114)" above |
| Run-wide modifiers | ETH-115 | built | Run modifiers with a source, scope (party / monsters / all), bundle, flags and reward bonus; one `stats.run` `BundleSource`, the reward multiplier and the consumer of `run`-scope upgrade grants: Omens, blessings, curses, dungeon events, doctrine, veterans. See "Run-wide modifiers (ETH-115)" above |
| Dungeon encounters | ETH-116 | planned | An `encounter` kind and feature part placed by a `FLOOR_PLAN_HOOKS` entry, one `interact { choice? }` action, data outcomes, log and Codex text; fountains folded in: altars, graves, merchants, bounty encounters, recruits, cursed wells, vaults |
| Monster templates | ETH-117 | built | `MonsterOverlay` (templates, name, title, stats, bundles, threat, loot tier, carried items) layered on a `MonsterDef` at `spawnMonster`: uniques, elites, mini-bosses, nemeses, heirloom carriers, families, hostile ghosts. See "Monster templates (ETH-117)" above |
| Item properties | ETH-118 | built | `ITEM_PROPERTIES`: per-instance `ItemInstance` fields that feed `gearBundles`, `ITEM_VALUE_HOOKS`, `canStack` and `itemName`: enchantment, curses, affixes, charges, origin, scaling. See "Item properties (ETH-118)" |
| Adventurer records | ETH-119 | built | The `adventurers` profile slice (`src/meta/slices/adventurers.ts`, API in `src/meta/adventurers.ts`): a stable id (`adv.<n>`, issued only by `startRun`) carried through the run as `AdventurerConfig.recordId`, then peak level, traits, status, lifetime history and the death of the fallen. Levels reset every run. Fallen records are capped at 200 (kin are never trimmed): roster, graveyard, recruits, quirks, Mastery, lineage |
| Class Mastery | ETH-087 | built | The `mastery` profile slice (`src/meta/slices/mastery.ts`, curve and helpers in `src/meta/mastery.ts`): per class only `{ xp, runs }` is stored; level and talent points (one per level, spent from M4) come from `MASTERY_CURVE`. A run gives each class in the party its members' `track.xp` (highest earner 100% / 75% / 50% / 25%, a `companion` flag 50%) plus a run-end bonus per floor reached and per completed contract or bounty, paid in full on a wipe. `masteryGain` (profile before) and `masteryGainBanked` (profile after, for the run summary) are pure; `npm run sim` reports the XP per run |
| Run chronicle | ETH-120 | built | `track.chronicle`: the run's notable moments, durable for the whole run (unlike `simStore`'s `EVENT_BUFFER_SIZE` buffer): Highlights, run summary, epitaphs, ballads, history, time-away. API in "Run chronicle (ETH-120)" above |
| Shared conditions | ETH-121 | built | Run-scope `CONDITIONS` and a data `Requirement` (all / any / not) checked outside rules, plus the `metInRun` milestone: unlocks, taboos, quirk triggers, building quests. See "Shared conditions (ETH-121)" above |
| Seeded text generator | ETH-122 | planned | Grammar content expanded with a per-purpose seeded RNG that never touches sim streams: names, titles, epitaphs, ballads, backstories |
| Allied creatures | ETH-123 | planned | A `companion` part for `party`-faction actors outside `state.party`, with follow rules and stairs handling: summons, pets, ghost allies, over-cap recruits, a helped rival party |

When one of these is built, its row turns `built` and its details move into a subsection above,
like "Contracts in the run".

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
- **Quest state.** The quests domain's slice holds the selected contracts with their progress
  (ETH-024, Contracts, "Contracts in the run"); accepted bounties join it with the bounty board.

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
- **Possession holds the step (ETH-066):** when a possessed adventurer's turn comes with nothing
  queued, `step` looks around for it and returns right there, before it or anyone after it acts,
  and without ticking. The next step carries on from the same place, so the run waits for the
  player's `playerAction`; nothing else is spent or counted meanwhile (stuck detection never sees
  it, since the engine isn't asked).
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
never throws. Possession (ETH-066, `ai/possession.ts`) added `possess` (a living adventurer in
the party; anyone else possessed is released first) and `release`, which emit `possessed` /
`released`; `CommandDef.apply` now gets `emit` as a third argument for such log events, and
emits only once the command is accepted. The first command was `playerAction`, which stores the request in the actor's
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
line; route forks in M8 add branches with no change to the floor code.

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
  variety (M8), and the bottom floor's stairs down are left out.
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
  scope: 'actor' | 'run'                       // ETH-121: run = checkable with RunCtx { state }
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
  Ids are `cond.*` and `act.*`. Each condition has a `scope` (ETH-121): `actor` conditions read
  the deciding actor; `run` conditions read only the run, so data `Requirement`s can check them
  outside rules (Contracts, "Shared conditions"). `paramSchema` arrives with the rules editor (M3). Since ETH-055
  the registries live in `registries.ts` and the hub fills them: the core lists
  (`CORE_CONDITIONS`, `CORE_RULE_ACTIONS`) first, then each domain's (Contracts).
- **Walking the rules:** the actor's own rules, then `BASELINE_RULES`. A rule is taken if it is
  enabled, isn't a dropped goal, names a registered condition and rule action with good params,
  its condition holds, and its action resolves to a request that passes `validateAction`.
  A rule action whose condition held may return `{ skipped: string }` (`RuleSkipped`, ETH-094) to
  pass without acting while appending a note to the trace of whichever later rule fires.
  Anything else is skipped, never an error. `chooseRule` does the walk without side effects.
- **Trace:** `ruleFired { actor, rule: RuleRef, condition, action, detail }`, where `RuleRef` is
  `{ set: 'own' | 'baseline', index }` and `detail` reads "Explore: heading for unexplored ground
  6 turns away", with the condition's detail in brackets when it has one. The same is kept as
  `ai.memory.intent` for the party card, along with optional `goal?: Pos` (ETH-019) for the tile
  the actor is heading for or targeting (`pathAlong` endpoint for map-following/flee rules, or
  the target tile for adjacent/ranged rules; omitted when untargeted).
- **Baseline rules**, in order (0-based indices, as of ETH-061):
  0 `cond.wounded { percent: 35 } → act.quaff_healing`, 1 `cond.overloaded → act.drop_lowest`,
  2 `cond.stuck → act.back_off` (and `cond.fleeing → act.flee` right after it, ETH-148), 3 `cond.heading_out → act.retreat_run`,
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
  `act.drink_fountain` (ETH-072, ETH-094, `src/sim/floors/fountains.ts`) walks to the nearest
  remembered fountain that isn't dry and whose last observed draught in `floors.observedFountains`
  is not harmful (`outcome === 'bane'`), without peeking at untouched fountains' hidden draughts,
  explaining any skipped harmful fountain in the trace, and drinks. Between `ITEMS_BASELINE_LOOT`
  and `act.explore`, `cond.party_scattered → act.regroup` (ETH-145) keeps followers grouped with
  the party lead while ground remains to explore. The heading-out ones (ETH-062)
  are in
  `src/sim/run/rules.ts`; the floors ones (ETH-058) in `src/sim/floors/rules.ts`:
  - `cond.party_scattered → act.regroup` (ETH-145): walks a straggler back to `partyLead` (the
    first living party member on the floor, who regroups on no one) when more than `PARTY_LEASH`
    (8) tiles away, continuing until within `PARTY_CLOSE` (3) tiles, and only while `act.explore`
    still resolves so it never fights the descent.
  - `act.descend` heads for the remembered stairs down and takes them. With `regroup` (the
    default) a member on the stairs takes them only when every living member on that floor is
    gathered (`gatheringAt`: within `GATHER_RADIUS`, 2, of the stairs or of a gathered member,
    so a queue in a corridor counts), and a gathered member doesn't crowd stairs a party member
    stands on (`partyMemberAt`). Anyone else on the stairs is walked up to, and fought if
    hostile, since only a party member will ever take them and move off (ETH-113; `act.retreat_run`
    does the same on the stairs up). Members on other floors are not waited for. It can't be
    done before the stairs down are seen or on the bottom floor.
  - `act.gather` (`idle`) waits at the stairs meanwhile: "waiting at the stairs down for Mira".
  - `cond.floor_overstayed` holds once the party has been on the floor `floorTurnCap` game
    turns (default `FLOOR_TURN_CAP`, 1000), the safety net: the baseline then heads down
    without exploring further or waiting.
  - `cond.bottom_floor` holds while a living party member is on the bottom floor (run-scope since
    ETH-121; see "Shared conditions"), where the baseline, with nothing left to
    explore, fires `act.retreat_run`: the party turns back, climbs out and the run ends as a
    retreat (ETH-062; a victory once contracts add victory checks). Right before it,
    `cond.stuck → act.wait` (ETH-145) holds while `act.explore` is temporarily dropped so a stuck
    member waits out `DROP_TURNS` instead of aborting the whole run.
  - `act.explore` is frontier-based: the goals are tiles the actor could enter (on the party
    memory's path grid, closed doors at `OPEN_DOOR_COST`) with an unseen neighbor. Standing on one
    always reveals its neighbors, so each goal reached shrinks the frontier, and explored dead
    ends are never goals nor on a shortest route to one. Both the floor lead and party followers
    stay committed to the lead's current `act.explore` `goal` until it leaves the frontier or
    becomes unreachable (ETH-145), preventing adjacent ally costs from flipping branches and
    keeping the party pushing one corridor together. A closed door next on the route becomes
    `openDoor`; another actor on the next tile becomes a wait ("waiting for X to get out of the
    way"), recorded as `memory.waitingFor`, unless it is a party member willing to swap
    (`willingToSwap`, ETH-017): one whose own last decision waited on this actor, or one with no
    decision yet or an `idle` one. Then it becomes a `swap` ("squeezing past X"). A member busy
    heading elsewhere is waited behind, never pushed back the way it came. This lives in
    `followMap`, so every map-following rule action gets it. It returns `null` once no frontier tile is reachable, and the actor settles on
    `act.wait`. Tiles where an adjacent actor stands cost extra in `aiPathGrid` (`ALLY_OCCUPIED_COST`
    (2) for party members, `OCCUPIED_COST` (8) for others), while distant party members are not
    penalized so allies in another corridor don't flip route choices.
  - `act.back_off` follows a flee map away from where the actor got stuck, with occupied tiles
    blocked.
  - `act.wait` is marked `idle`.
- **Possession (ETH-066)** is first in the decision order, ahead of the engine: `AiPart.possessed`
  (`true` or absent; at most one, a party adventurer, invariant `core.possession`) makes `step`
  hold at the adventurer's turn until a `playerAction` arrives (§3.3). Any queued player action of
  a party member is traced as `ruleFired` with `rule: { set: 'player', index: 0 }`, condition
  `player`, and detail "Your command: attack north" (`describePlayerAction`), which also becomes
  the intent; the log labels it `player`. Possessing or releasing resets `still`, `waited`,
  `last` and `waitingFor`, and releasing clears a player intent, so the AI decides afresh the same
  turn. `willingToSwap` never offers to push a possessed member around. The movement keys send
  the core `bump { dir }` action, which comes to the first of attack, open door, swap or move
  that validates (`bumpTarget`); when none does, it fails with the move's reason. Snapshots carry
  `possessed` and `awaitingInput` on each `PartyMemberView`.
- **Fleeing (ETH-148, `src/sim/combat/threat.ts`):** baseline rule 2 is `cond.fleeing → act.flee`.
  `isThreat` decides who counts: an enemy that will come and hurt the party (damage stat above 0, a
  bolt, a rule that approaches, surrounds or bolts, or a bundle or template that deals damage or
  applies a harmful status; adventurers always). "Threat" means "will come after you", not "can
  deal damage": a blow does at least 1 (`rollDamage`), so a moss tender still hits if cornered, but
  it never pursues and flight ignores it (trace: "ignoring the moss tender: it can't hurt anyone").
  `visibleThreats` is `visibleEnemies` through it; `cond.safe_to_test` uses it too. Before each party
  decision `updateThreatMemory` records where threats were seen (`memory.threats`, dropped after
  `THREAT_MEMORY_TURNS`) and runs the hysteresis (`memory.fleeing`): fleeing starts below
  `BASELINE_FLEE_PERCENT` (35) with a threat in sight, and ends at `FLEE_RELEASE_PERCENT` (60) HP or
  after `FLEE_CALM_TURNS` (12) without seeing one. While it lasts `act.flee` runs from visible
  threats, or from remembered positions when none is in sight ("still fleeing: ... in pursuit").
  Once back above the start threshold (still running on hysteresis alone) it fights a threat that
  is next to it rather than fail Flee checks. With no free step left, `act.hold_position` (baseline
  rule after `act.rush_caster`, idle) stands still instead of letting exploring walk back toward the
  threat, for at most `FLEE_HOLD_TURNS` (12) decisions, after which fleeing is dropped.
  Wounded (below the release HP) with no healing potion, `act.explore` and `act.pick_up` plan on a
  grid where `avoidThreats` has added cost around each remembered position (`AVOID_PENALTY` at the
  tile, fading to nothing at `AVOID_RADIUS` and over `THREAT_MEMORY_TURNS`), a soft weighting, so
  the route goes round when another exists (trace note: "avoiding X's last position while wounded").
- **Stuck detection** runs before the walk. Each decision records the actor's floor, position and
  the party's seen-tile count (`memory.last`). Staying within `LOITER_RADIUS` (1) tile of where the count
  began counts as not moving, so two rules that undo each other (flee, then walk back toward the
  item behind the enemy) are caught too (ETH-142 turn-cap fix). After `STUCK_TURNS` (10) decisions in a row with
  none of them changing while the last rule fired was not `idle`, that rule becomes
  `memory.dropped` and is skipped for `DROP_TURNS` (20) turns, a `stuck` event says why, and
  `cond.stuck` holds meanwhile, so the actor backs off and then waits until the goal comes back.
  If `act.back_off` itself gets stuck while a goal is dropped, it sets `dropped.backedOff = true`
  and stops backing off for the rest of `DROP_TURNS` without overwriting (and un-dropping) the
  original dropped rule (ETH-145).
  Waiting counts too (ETH-113): `memory.last.party` keys where every living party member stands,
  and `memory.waited` counts decisions in a row that wait by an `idle` rule other than the plain
  `act.wait` (gathering at the stairs, say) while that key is unchanged. At `WAIT_STUCK_TURNS`
  (50) that rule is dropped the same way, with a `stuck` event ("Waited 50 turns with nobody in
  the party moving (...)"), and the walk chooses again at once. A straggler still on the move
  resets the count, so gathering for the party is never cut short.
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
  placeholder kinds with no defs yet (item and contract have since been filled in) (Contracts, "Content kinds").
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
- **Reachability (ETH-143):** `tools/content-reachability.ts` (`reachabilityProblems`, run by
  `validateContent`, so by `npm run validate:content` and `npm test`) checks that every def can
  come up in a run: each monster spawns on some dungeon floor (`monsterWeightAt`, ecology included;
  `MonsterDef.handPlaced` opts out defs only placed by hand), each template fits a spawnable monster
  and some dungeon rolls templates, each item has a `loot` entry on a reachable floor or is a
  contract's recover item, each base enchantment is used by a gear def and each special fits gear
  that loots within its depth range. It counts only a dungeon's own floors (`1..depth.max`), not
  return-trip shifts or OOD boosts. It lives in `tools/` because `src/content` can't import
  `src/sim`. Every problem names the def and why.
- **Codex kill tiers (ETH-144):** a monster's Codex reveals its basics, full stats and lore at
  kill counts `MONSTER_KILL_TIERS` (1 / 10 / 50 by default). `MonsterDef.codexTiers` (`{ basics,
  stats, lore }`, strictly increasing, checked at load) overrides them, and `killTiersFor(def)`
  is the one reader (the monster renderer's fields, `killTiers` and `loreKills`, so the Codex
  page, its tier note and the `Explain` tooltip all follow it). Content guidance: set it on
  anything that can't realistically reach 50 kills. A unique or boss (killed at most once a
  run) uses about `1 / 2 / 3`; a very rare spawn or an out-of-depth monster keeps its basics and
  stats tiers and lowers its lore tier (say `1 / 5 / 15`). Anything that spawns freely keeps the
  default.
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
last `HISTORY_LIMIT` (50, tunable; a save holding more is trimmed on load) runs as compact
`RunRecord`s, newest first: outcome, turns, deepest floor, banked and lost currencies, the
cause, the party `{ name, classId, raceId, fell: { depth, turn } | null }` and the content ids
met; `runRecord(run, result)` builds one from `extras['run.end']`, `['run.party']`,
`['track.deaths']` and `['track.codex']`. Slice version 2 (ETH-048); v1 lists were oldest
first without the details), `upgrades` (owned upgrade node ids, §6.2) and `codex` (ETH-065: `{ entries: CodexDiscoveries }`, merged from `extras["track.codex"]`, Contracts "Codex discoveries"), `settings` and `milestones` (ETH-074: `{ unlocked: { id, run }[] }`, filled by `unlockMilestones` at the end of `applyRunResult`, §6.2). `checkProfile(profile)` returns one line per
problem. Currency names and tooltip text are `CURRENCY_INFO` in `src/meta/currencies.ts`.

### 6.2 Upgrade engine

```ts
interface UpgradeNode extends Def {
  tree: string                     // 'guild_hall', 'smithy', 'deity.<id>', …
  tier: number; column: number     // layout hints for the node graph
  cost: Partial<Record<CurrencyId, number>>
  requires: string[]               // node ids
  exclusiveGroup?: string          // pick one of the nodes sharing this group
  reveal?: Milestone               // ETH-036: sealed until a run meets it; recorded in `milestones` under the node id
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
  `contractSlots`, `ruleSlots`, and the run bonuses `contractRewardBonus`, `xpBonus`); a new capacity is one entry there.
- **Doctrine choices** (e.g. "Prioritize clearing floors" vs "Prioritize the stairs") are
  `unlock` grants of `doctrine.*` ids in a pick-one group, with no separate grant kind. The
  placeholder `doctrine` kind exists so those ids validate. The doctrine item adds the defs
  and reads `isUnlocked(profile, 'doctrine.x')` to offer each one.
- **Validation:** refs (building, prerequisites, Favor deities, stats against `STAT_REFS`, unlock
  ids against the registry named by their prefix; `checkGame` also passes `CONDITION_TARGET` and
  `RULE_ACTIONS` for Library unlocks), plus `ContentKind.check`, a new optional hook for rules
  spanning several defs: a prerequisite must be in the same building on an earlier tier (which
  rules out cycles), a pick-one group has 2+ nodes on one tier of one building, and no two
  nodes share a cell.
- **Milestones (ETH-074).** A building may name an `unlock` milestone (`BuildingDef.unlock`);
  without one it is open from the start. The vocabulary is data in `src/content/milestones.ts`:
  `{ kind: 'reachDepth', depth }`, `{ kind: 'finishRuns', count }`, `{ kind: 'winRuns', count }`
  and, since ETH-121, `{ kind: 'metInRun', requirement }` (Contracts, "Shared conditions"),
  checked by `milestoneMet(m, progress)` against `MilestoneProgress` (`metInRun` keys, `deepestDepth`, `runs`,
  `victories`: lifetime totals from the `history` slice) and worded by `describeMilestone`
  ("Reach floor 3"), `describeMilestoneMet` and `describeProgress`. A new kind is one union
  member, one schema option and one case in each of those. `applyRunResult` ends with
  `unlockMilestones(profile)` (`src/meta/milestones.ts`), which records each newly met target in
  the `milestones` slice as `{ id, run }`; recorded unlocks stay even if content changes.
  `isMilestoneOpen`, `lockingMilestone`, `unlockOf` and `latestUnlocks` (what the last run
  opened, for the run summary) read it, and `canPurchase` refuses nodes of a locked building
  (`locked`, "The Smithy opens when you reach floor 3."). `milestoneTargets()` lists the defs with
  milestones (buildings only so far); another kind joins by adding itself there. The Smithy
  exists as a locked placeholder (no nodes; reach floor 3, a default).
- **A new building** is a file in `src/content/town/` (its `defineBuilding` and
  `defineUpgrade`s) and one line in `town/index.ts`, plus, only if the generic tree isn't
  enough, a component and one line in `BUILDING_PANELS` (`src/ui/town/panels.ts`).
- **State:** the `upgrades` profile slice (version 2), `{ owned: string[], ranks: Record<string, number> }`:
  `owned` is every node bought, in purchase order, each once; `ranks` is sparse and holds only
  nodes bought past rank 1 (absent means rank 1; values are whole numbers from 2; every key is in
  `owned`). The v1 to v2 migration adds `ranks: {}`. Ids no longer in content are kept and
  ignored, and a stored rank above a node's current top rank is read as the top rank.
- **Ranks (ETH-172):** a node may have `ranks: { max, costGrowth }` (`max` 2 to 10, `costGrowth`
  1 or more). Rank `r` costs `cost × costGrowth^(r−1)` per currency (`rankPrice`, rounded by
  `roundCost`: whole numbers under 100, else two significant figures, never below the rank
  before); rank 1 is `cost` as written. Each rank adds the node's `grants` once more, so a ranked
  node may only have `capacity` and `bundle` grants (`UPGRADE_KIND.check`). `rankOf`, `rankCost`
  and `nextRankCost` read them; `purchase` buys the next rank; `canPurchase` returns `owned` only
  at the top rank, and a partly bought node is `available` or `expensive` for its next rank.
  `profileGrants` repeats a node's grants `rankOf` times, so `capacity` and `isUnlocked` need no
  change. `buildRunConfig` lists a ranked node's id in `partyBundles` once per rank and gives its
  run-scope bundle one run modifier per rank (keys `id`, `id#2`, …), since the sim reads a bundle
  from the node by id and knows nothing of ranks.
- **Building tiers (ETH-172):** `BuildingDef.tierGates: { fromTier, unlock: Milestone, name? }[]`
  keeps every node row from `fromTier` down locked until `unlock` is met (`fromTier` 2 or more,
  strictly increasing; the rule that no `requires` points up a band follows from the existing
  rule that prerequisites sit on earlier rows). Each gate is a milestone target with the id
  `<building id>_t<fromTier>` (`tierGateId`, e.g. `building.smithy_t4`), listed by
  `milestoneTargets()` after its building, so `unlockMilestones`, `milestoneRequirements` and the
  run summary's unlock lines handle it with no special case, and the unlock is recorded in the
  `milestones` slice and never closes again. `tierGate(profile, building, tier)` returns the
  closed gate over a row (or `null`), `closedGates` lists them, and `canPurchase` refuses such a
  node as `locked` with `describeGate` ("Tier 4 and up open when you reach floor 6."). A node's
  `tier` stays its row; the UI numbers bands I, II, III from the gates (`tierBand`). The Smithy (ETH-159) ships the first ranks and gate; ETH-132 adds the Guild Hall's.
- **Start perks (ETH-159):** a fourth grant kind, `{ kind: 'start', start }` (`src/content/startPerks.ts`), changes how a run begins: `know` (every potion or jewelry kind is known from the first turn), `enchant` (the `weapon` or first `defense` piece of each class kit is worn at +1 through `giveKit`, using that gear type's own base enchantment, so a staff gains Max MP through `enchant.channeled`) and `stock` (extra kit items for the first party member, or for each adventurer with `each`, as the Medic's Satchel does). A ranked node may not have one, like `unlock`. `upgradeStartConfig` (`src/meta/prepare/startPerks.ts`) reads the owned grants into `RunConfig.startKnown`, `kitEnchant` and `startStock`; `createRun` applies them (`knowKinds`, `giveKit`, `giveStock`), `kitIssued` lists the issued items and `startKnown` is logged once. `PROP_KIT` may mark gear or a scroll. The `tradeBonus` capacity (percent, 15 per Smelting Pit rank) becomes `RunConfig.tradeBonus`, which `itemSale` and the gold conversion add before their one rounding down; it is never Omen-multiplied.
- **Tier quests (ETH-170):** `ContractDef.opens` is a building id (a building quest, ETH-093) or
  `{ building, fromTier }` (a tier quest); `opensBuilding`, `opensTier` and `opensTarget` read
  it. The gate's `unlock` is the `objectiveDone` milestone with `exited: true` on the contract,
  and `checkBuildingQuests` (in `validateContent`) checks the pairing both ways, that each
  building's quests ask for deeper floors in order (building quest, then each tier quest in gate
  order) and that none is deeper than the shallowest dungeon. `questOffer` offers a tier quest
  while its building is open and its gate is the topmost closed one, once `upgradeShare(profile,
  building)` (that building's nodes in its open tiers) reaches `TIER_QUEST_SHARE`; before that it
  is `locked` with progress text, and `hidden` while the building is locked or an earlier gate is
  closed. A tier quest counts as a building quest for the one-per-run limit.
- **Engine** (`src/meta/upgrades.ts`, pure): `canPurchase(profile, id)` (`{ ok }` or a
  `status` of `owned` / `excluded` / `locked` / `expensive` / `unknown` with a `reason` for the
  tooltip), `nodeStatus`, `purchase` (throws a `RangeError` with the reason),
  `respecPlan(profile, group)` and `respec`: the chosen node and every owned node that needs it
  are given up and refunded in full, less the fee. `resetPlan` / `resetTree(profile, buildingId)`
  give up a building's whole tree the same way. **Tree kinds (ETH-086):** every building def has
  a required `kind`, `foundations` (Guild Hall, Smithy, Cartographer, Temple, Ossuary, Tavern) or
  `tactics` (Library, doctrine, class talent trees), validated at content load; `TREE_KIND_INFO`
  holds the Town tooltip text. The kind lives in content, so the `upgrades` slice is unchanged
  and old saves need no migration. Both kinds can be reset or changed between runs, never during
  one: the meta layer can't know whether a run is going, so `respec`, `resetTree` and
  `respecBlock` take `{ runActive }` (the UI passes `useRunActive()` from `runStore`, true on
  the run screen until the run ends) and throw `RUN_ACTIVE_REASON`. The fee is
  `FOUNDATIONS_RESPEC_FEE_RATE` (0) of what a Foundations respec gives up (the chosen node for
  `respec`, the whole refund for `resetTree`), rounded up; Tactics never pay. Tests override the
  rate with `{ foundationsFeeRate }`. Respec and reset live in `src/meta/respec.ts`; they refund
  every rank bought (the sum of `rankCost` for ranks 1 to n), and the fee is charged on that
  total (for a group respec, on all ranks of the chosen node). `profileGrants(profile)` returns
  `{ source, grant }[]` for `buildRunConfig` (ETH-064); `capacity(profile, key, base)` and
  `isUnlocked(profile, id)` derive from it. `describeGrant(grant, times)` (`src/meta/grantText.ts`)
  words a grant for tooltips and the Codex, with `times` ranks stacked.
- **Town UI for ranks and tiers:** a ranked node shows `2/5` (the Roman numeral only in the
  tooltip name, "Hardy Recruits III"); its tooltip lists the effect now, the next rank's effect
  and price, and every rank's price, plus the `UPGRADE_HELP.ranks` text. A closed gate draws a
  labeled divider above its first row ("Tier II — locked: …", lock glyph and words, never
  color alone) whose tooltip has the full requirement and `UPGRADE_HELP.tiers`.

### 6.3 From profile to run

`buildRunConfig(profile, choices)` turns the Prepare screen's choices into the `RunConfig` the
sim takes: party members with their bundles, rule sets, patron blessing, Omen bundles and the
reward multiplier, the dungeon variant, and any gravestones to place.

As built (ETH-064, `src/meta/prepare/`):

- **`buildRunConfig(profile, choices, seed)`** is the one path from profile to run: Descend,
  Start next run, auto-restart and the sim-error banner's Start a new run all go through it (via
  the starter `App` registers). Each choice section applies in order, then every owned upgrade
  with a `party` bundle grant is added to `partyBundles` by **node id**
  (`upgradePartyBundles`); the sim's `bundleOf` reads an upgrade node's party bundle grants
  (`upgradeBundle` in content), so stat tooltips credit the upgrade ("Hardy Recruits").
  Every owned node with a `run`-scope bundle grant becomes a run modifier
  (`upgradeRunModifiers`, ETH-115: key, source id and bundle are the node id, label its name,
  scope `party`) in `RunConfig.runModifiers`. The result passes `checkRunConfig` (party
  1–`MAX_PARTY_SIZE`, known classes, races and bundles, well-formed run modifiers, a valid depth) or it throws a
  `RangeError`; `App` shows that on the Prepare screen (`runStore.startFailed`).
- **Choice sections** are composed like profile slices: `RUN_CHOICES` (`prepare/index.ts`) maps
  a key to `defineRunChoice({ schema, init, apply(ctx, choice) })`. `RunChoices` is derived from
  it. `apply` adds to `ctx.config` and may draw from `ctx.rng` (`Rng.seeded(seed, 'prepare')`;
  sections draw in record order). A choice the profile no longer allows falls back to what it
  allows. **A later Prepare decision (contracts, bounties, Omens, patron) is a section file and
  one line in `RUN_CHOICES`, plus a panel (§8.6).**
- **Sections so far:** `party` (`{ slots: { classId | null, raceId | null }[] }`): the party
  always fills `partySize(profile)` = `capacity(profile, 'partySize', BASE_PARTY_SIZE = 1)`
  (max 4); open picks are random recruits from the available classes and races with a name from
  `RECRUIT_NAMES` (content), no repeats. `dungeon` (`{ dungeonId }`) sets `depth`.
- **Opt-in upgrades (ETH-187):** an upgrade node with `optIn: true` (only `bundle` and `start`
  grants) grants nothing until the player ticks it on the Prepare screen. The `optIns` section
  (`{ enabled: upgradeId[] }`, default `[]`) holds the ticks; `withOptIns(profile, choice)` returns
  the profile minus owned opt-in nodes that are off, and `buildRunConfig` derives party bundles, run
  modifiers and start perks from that filtered profile, so a new opt-in node is only `optIn: true`
  plus its grant. The Prepare panel `opt-ins` lists them (hidden while none is owned). The headless
  harness counts owned opt-in nodes as on unless `--opt-ins off`; `--upgrades` takes `id*N` for a
  rank and a trailing `!` to attach a node behind a closed building tier.
- **Omens (ETH-185):** an `OmenDef` (`src/content/omens.ts`) has 1 to `MAX_OMEN_RANKS` (5) ranks. Each rank is
  the *whole* effect at that rank, not a step up from the one below: a `bundle` and/or `flags`, an optional
  `scope` (default `monsters`), a `text` for tooltips and the Codex, and `reward`, the total reward bonus
  at that rank (strictly rising). Omens start locked: unlike classes, an Omen no node unlocks is never
  available (`availableOmens` needs an owned `unlock` grant), and a node only unlocks, it never turns
  anything on or pays a bonus. The `omens` section (`{ ranks: { omenId: rank } }`, default `{}`, rank 0 or
  absent is off) holds the player's picks; `activeOmens` keeps only unlocked Omens at a rank they have, and
  `apply` writes `RunConfig.omens: { id, rank }[]` (the list the run record keeps, so a seed replays
  identically). In the sim, `initStats` turns the list into run modifiers after `config.runModifiers`
  (`omenModifiers`, `src/sim/stats/omens.ts`): key = the Omen id, source label "Gloom (Omen, rank 2)", the
  rank's `reward` as `rewardBonus`, and the rank's bundle reached through the id `omen.gloom#2`
  (`runBundleOf`). `createRun` throws on an unknown Omen, a rank out of range or an Omen twice
  (`omenProblems`, also in `checkRunConfig`, which then validates the Omens' run modifiers with
  `runModifierListProblems` like any other). A respec or tree reset that gives up an Omen's unlock node
  also drops that Omen from the saved `omens` picks (`applyGiveUp`, `src/meta/respec.ts`); the highest
  rank a pick may hold is `MAX_OMEN_RANKS`. A flag-only rank's tooltip line is its `text`, not the
  flag id. The one multiplier is `rewardMultiplier` (1 + Σ bonuses), so
  conversions at the exit (gold, sold items, salvage: `unmultiplied` trackers) stay outside it. When a run
  has Omens, `RunResult.extras['run.omens']` = `{ omens, multiplier }` (absent otherwise) and the run
  history record keeps it as `omens`; the run summary shows an "Omen multiplier" line under the currency
  table. The Prepare panel `omens` (column risk, hidden while none is unlocked) has a rank radio per Omen
  and the total multiplier with an itemizing tooltip (`omenBreakdown`, `omenMultiplier`). The log line is
  the run modifier's `atStart` announcement ("This run is under Gloom (Omen, rank 2), …"), and the Codex
  marks the Omen `seen` from the same event.
- **The first four Omens (ETH-186):** `src/content/townOmens.ts` defines Stalker's Ledger, Deep Surge, Cursed
  Hoards and Armed Warbands, three ranks each; each rank sets one flag, `omen.<name>.<rank>`, and the numbers
  per rank live in `src/sim/stats/omenEffects.ts` (`omenRankOn` reads the highest rank flag; keep the Omen
  text in step with the tables). Three hooks read them, and with no such Omen on none draws from an RNG, so
  seeds replay as before: `planFloor` passes `floorRisk(state)` into generation (`FloorDraft.risk`, a
  `FloorRisk`: `templateChanceFor` and `rollOodDanger` shift the ramp and the out-of-depth chance, and
  `rollItemProperties` shifts the curse and enchantment thresholds); the combat domain's `RISK_PLAN_HOOK`
  runs `monsterRiskOverlay` over the plan's spawns from its own stream `risk/<floor>` (finds carried by variants
  and wanderers, the Armed template with extra armor and an enchanted weapon or armor piece, never jewelry, `OMEN_ONLY_TAG` keeps that
  template out of `rollTemplates`); and `surgeFloor` reads `surgeEffect` for a larger wave, more variants,
  more patrolling monsters (twice the rank's patrol count) split into at least that many extra patrol groups, and carried
  finds. Cursed Hoards' higher enchantment cap can push floor gear to +4 and +5: the base enchantments
  (`enchant.honed`, `reinforced`, `attuned`, `channeled`) allow up to +5, while ordinary loot still caps at +3. The unlock nodes are ordinary `unlock` grants (Guild Hall row 1 and row 4,
  Smithy row 3 and row 4, column 2); `reachabilityProblems` reports an Omen no node unlocks. `npm run sim --
  --omens id:rank,...` fields them without owning the nodes.
- **Availability:** `isAvailable(profile, id)`: content that some upgrade node unlocks is locked
  until that node is owned; everything else is open from the start (`availableClasses`,
  `availableRaces`, `availableDungeons`).
- **Remembered:** the `prepare` profile slice holds `{ choices: RunChoices }`. Each section's
  saved value is checked by its own schema and replaced by its default if missing or invalid,
  so a new section needs no migration. `profileStore.updateRunChoices(changes)` edits it.

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

As built (ETH-059, ETH-095):

- `src/platform/tauri.ts`: the sole boundary importing `@tauri-apps/api`. Exposes
  `isTauriRuntime()` (`window.__TAURI_INTERNALS__`), `invokeTauri()`, and
  `subscribeTauriClose(onClose)` (which uses `getCurrentWindow().onCloseRequested`, calls
  `event.preventDefault()` synchronously before awaiting `onClose()`, guards re-entry, and
  calls `win.destroy()` in `finally`).
- `src/platform/saveStore.ts`: `SaveStore { label, load, save, clear }` with
  `MemorySaveStore`, `IndexedDbSaveStore` (database `ethuathia`, store `saves`, key `profile`)
  and `TauriSaveStore`, which calls the backend `load_save`, `write_save` and `clear_save`
  commands to persist `save.json` in `app_data_dir` (§8.4).
  `createSaveStore()` picks `TauriSaveStore` when `isTauriRuntime()` is true, else
  `IndexedDbSaveStore` when `indexedDB` exists, else `MemorySaveStore`.
- `src/platform/autosave.ts`: `startAutosave(save, { intervalMs, target, onCloseRequested })`
  accepts async `save()` callbacks, saves every 30 s and on `beforeunload`, `pagehide` and the
  page becoming hidden, and registers `onCloseRequested` (defaulting to `subscribeTauriClose`
  when `isTauriRuntime()`, tracking disposal so `stop()` unsubscribes cleanly). `profileStore`
  returns `useProfileStore.getState().save()` directly so desktop closes await the file write.
- `src/meta/save.ts`: `encodeSave(profile, savedAt)` and `decodeSave(text)`. The envelope is
  `{ format: 'ethuathia.save', version: SAVE_VERSION, savedAt, slices: { <key>: { version, data } } }`.
  Loading runs `ENVELOPE_MIGRATIONS` up to `SAVE_VERSION`, then each slice's own migrations,
  then its schema; it never throws and returns `{ ok: false, error }` for a save it can't read
  (not a save, from a newer game, damaged, invalid). A missing slice starts at its default and
  an unknown one is dropped, both with a note. The mid-run `activeRun` is not saved yet.
  Envelope v2 (ETH-132, `slices/legacyUpgrades.ts`) refunds owned upgrade nodes that left the tree at
  their old price: it needs two slices (`upgrades` and `currencies`), so it is an envelope step.
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
  gets nowhere (nobody can act) stops the runner until the next message. That is also how a
  possessed adventurer's hold stops it (ETH-066). A `playerAction` for the possessed adventurer
  (`SimSession.possessed()`) is answered at once, at any speed and even paused: the runner steps
  until the run holds again, the adventurer falls or the run ends (at most `INPUT_STEP_LIMIT`, 20
  steps), then sends the update.
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
  events, each with a sequence number for list keys (the full log); `discoveries` and, since
  ETH-120, `chronicle` are reduced from every event received, so they keep the whole run. `bindHost(host)` feeds a `SimHost`'s
  snapshots and events into it and returns an unsubscribe. `App` creates the host (a
  `WorkerHost`; tests pass an `InlineHost`) and binds it; since ETH-064 the app opens on the
  Prepare screen and starts no run until Descend. Since ETH-014 it also holds `speed` (0 is paused) and `resumeSpeed` (the last
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
  `setRunStarter`, which builds the config from the remembered choices with `buildRunConfig`
  and a new seed (a fixed `seed` prop counts up). ETH-064 added `screen` (`prepare` or `run`;
  `run` by default so the shell renders alone in tests, `App` opens `prepare`), `openPrepare`
  (forgets the finished run, so no auto-restart is pending) and `startError` / `startFailed`. `watchAutoRestart` starts the next run
  `AUTO_RESTART_MS` (5 s) after a run ends while the profile's `settings.autoRestart` is on and
  the countdown wasn't cancelled. Waiting for the player is the default. The run summary modal
  (`shell/RunSummary.tsx`) and the "run is over" banner over the map read it. Since ETH-048
  `pastRun` (a `RunRecord`, set by `showPastRun`) reopens the same modal for a past run from the
  Stats tab (`ui/stats/StatsPanel.tsx`); `reportFromRecord` (`shell/runSummaryText.ts`) turns
  the record back into a `RunReport`.
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
`ui/kit/index.ts`; the others arrive with the features that first need them. `Button` also accepts
`disabledReason` (with optional `tooltipPlacement`) to keep a button visible and natively
disabled inside a focusable `Tooltip` trigger with an `aria-describedby` reason for screen readers
(ETH-175). Kit stylesheets use tokens only, which `test/ui/tokens.test.ts` enforces. In dev mode,
`?kit` on the dev server URL opens `ui/dev/KitGallery`, which shows every component and state;
production builds drop it.

### 8.5 Codex and `Explain` (`ui/codex/`, ETH-065)

- **Renderers:** each content kind has a file `ui/codex/renderers/<kind>.tsx` whose default
  export is `defineCodexRenderer({ registry, label, order, hint?, alwaysKnown?, hidden?, glyph?,
  group?, fields? })`. `registry` types `fields` and `group` with the real def type. `fields`
  returns the stat table (`{ label, value, hint?, key? }`); `key` fields also show in `Explain`.
  `group` is the subheading (a monster's family). `registry.ts` collects the files with
  `import.meta.glob`, so a new or richer kind is one file and no edit to the tab; a kind with no
  file gets a plain section. Two renderers for one kind throw at load. Kinds with kill tiers
  (monsters) give the renderer `killTiers(def)` and `loreKills(def)`, both per def, so a def's own
  tiers (`killTiersFor`, ETH-144) apply.
- **Discovered** = the profile's `codex` entries plus `simStore.discoveries` (`useDiscovered`).
  Undiscovered entries show `???` and the renderer's `hint`; search only matches discovered
  entries, so names never leak.
- **`Explain id`** renders a content mention with a tooltip (`ExplainCard`: glyph, name, kind or
  group, description, key fields). An unknown id renders as plain text. The map's hover tooltip
  shows the `ExplainCard` of the top non-party thing on the tile (`tileSubject`).
- **Log mentions:** a log-text `text` may return parts instead of a string,
  `[`${nameOf(e.actor)} opens a `, mention('feature.door', 'door'), '.']`; each `mention` renders
  as an `Explain` link. `LogLine.text` stays the plain sentence.

### 8.6 Prepare screen (`ui/prepare/`, ETH-064)

`PrepareScreen` takes the party, map and log areas of the shell while `runStore.screen` is
`prepare` (the top bar and side tabs stay, so the Town can be visited first). It only lays out
panels: each is a `.ts` file in `ui/prepare/panels/` whose default export is
`definePreparePanel({ id, title, column, order, Component, shown? })`, picked up by
`import.meta.glob` (`registry.ts`), with its component in `ui/prepare/components/`. Columns are
`party`, `loadout` and `risk` (`PREPARE_COLUMNS`). A panel gets `{ profile, choices, update }`
and edits its section through `update(key, value)`. Shipped panels: Party, From the town (the
upgrade party bundles) and Dungeon. **A new panel is two files and no edit to the screen.**

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

- **Scene** (`scene.ts`): `buildScene(snapshot, { selected, hover, focus, flashes }, glyphs)` packs
  each tile into one integer: an interned glyph id (`GlyphTable`), the fog state (unknown,
  remembered, visible) and overlay bits (hover, selected, focus, possessed, hit flash). Layers
  resolve topmost-wins: terrain, then a feature, then an actor, with party members over anything
  else and dead ones not drawn. Living possessed party members get `Overlay.Possessed` without
  `Overlay.Selected`. `changedTiles` diffs two scenes; `describeTile` gives the hover tooltip's
  text.
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
- **`MapRenderer`**: `resize(deviceW, deviceH, dpr)`, `draw(snapshot, { mode, selected, hover, focus, pulse, flashes })`,
  `tileAt` and `tileRect` (CSS pixels) for hit-testing, and `invalidate()`. When the view
  (cell size and scroll) is unchanged it redraws only the tiles whose code changed (plus old and
  new goal-line cells from `lineTiles` and focus 3×3 blocks); otherwise it redraws every tile
  in view. Cell overlays (hit flash wash, selection ring, solid possession frame, hover outline)
  are drawn inside the cell, so a tile never draws over its neighbors and the diff stays exact;
  the dotted goal line (for a selected, living, non-possessed party member on the shown floor)
  is drawn after tiles and before `drawFocus`.
- **`MapCanvas`** subscribes to `simStore` outside React's render and draws at most once per
  animation frame, so a fast sim never re-renders it. It also tracks new `attacked` events to
  render `HIT_FLASH_MS` (120ms) hit flashes (skipped under `prefers-reduced-motion`) and
  schedules their expiry redraw. It sizes the backing store from a
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
- **Cycling the selection (ETH-020, ETH-090):** `Q` / `E` (when nobody is possessed,
  `when: 'unpossessed'`) and `[` / `]` (`BracketLeft` / `BracketRight`, always) are
  `cycleSelection(step: -1 | 1)`. It changes only `uiStore.selected`, using the pure
  `cycleSelection(party, selected, step)` in `uiStore.ts`: the next or previous living member in
  party order, wrapping, skipping the dead; with no selection it starts at the first (or last)
  living member, and with nobody alive it changes nothing. `Tab` is never bound, so focus
  navigation keeps working.
- **Possession (ETH-066):** `P` is `togglePossession`: it possesses the selected living
  adventurer (or the first living one, which it selects) or releases the possessed one; a
  double-click on an adventurer on the map and the card's Possess button do the same. Bindings
  have optional `shift` (must or must not be held), `when: 'possessed' | 'unpossessed'` and
  `repeat` (holding the key repeats). `POSSESSED_KEYS` only match while a living adventurer is
  possessed (`bindingFor(event, keymap, possessed)`): WASD with Q/E/Z/C diagonals, the arrows and
  numpad 1–9 send `act { bump }`; `.`, X and numpad 5 wait; G picks up; Shift+`.` (`>`) and
  Shift+`,` (`<`) take the stairs; F drinks from the fountain underfoot. `act` sends any
  `ActionRequest` as a `playerAction` through `simStore.send`, so a new player action (use, cast,
  pray) is one binding or button. While someone is possessed the map leaves the arrows to the
  keymap instead of moving its inspect cursor. The pack's Equip, Take off and Use buttons send
  `equip`, `unequip` and `use` the same way.
- **`useKeymap()`:** listens on `window` while the in-run screen (`AppShell`) is mounted. Focused
  widgets handle keys first (the map's arrows, Enter and Escape, the tabs' and log edge's
  arrows), so a key they mark with `preventDefault` never reaches the keymap. A key the keymap
  takes has its default prevented on keydown and on the matching keyup, so Space on a focused
  button pauses without also pressing it (Enter still does) and never scrolls. Held keys act
  once. Speed actions go through `simStore`, never to the sim directly.

### 8.4 Desktop packaging

Packaged with **Tauri v2** (`src-tauri/`, ETH-095). Nothing in `ui/` imports `@tauri-apps/api`
directly; all desktop runtime checks, IPC calls, and close interception go through
`src/platform/tauri.ts`.

- **Rust backend (`src-tauri/src/lib.rs`, crate `ethuathia_lib`):** exposes three
  `#[tauri::command]` handlers — `load_save`, `write_save`, and `clear_save` — backed by pure
  `&Path` helpers (`read_save_file`, `write_save_file`, `clear_save_file`) that read and remove
  `save.json` and write atomically via `save.json.tmp` + rename inside
  `app.path().app_data_dir()` (`com.ethuathia.app`).
- **Offline-only security & capabilities:** `src-tauri/Cargo.toml` includes no network,
  filesystem, shell, or opener plugins; `src-tauri/capabilities/default.json` grants only
  `core:default` and `core:window:allow-destroy` (needed by `subscribeTauriClose`).
- **CSP & bundling:** `vite.config.ts` skips injecting the `<meta>` CSP tag when
  `TAURI_ENV_PLATFORM` is defined so `src-tauri/tauri.conf.json`'s `app.security.csp` is
  authoritative (allowing `connect-src 'self' ipc: http://ipc.localhost` for the local IPC
  bridge), while browser `npm run build` retains the strict `OFFLINE_CSP` (`connect-src 'self'`).
  `tauri.conf.json` builds `dist/` via `npm run build` (`frontendDist: "../dist"`) and bundles
  icons generated from `public/favicon.svg`.

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
- **Headless runs:** `npm run sim -- --seeds N [--from S] [--cap T] [--party P] [--class ID] [--race ID]`
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

### 10.1 File size and refactoring

Keep files small and focused. A file should have one job that its name describes, so a
reader (or an agent working on one item) can hold it in their head and change it without
touching unrelated code.

- **When to split.** Treat roughly **400 lines** of source as the point to look hard at a
  file, and **600** as the point to split it, unless it is a flat list of data (content defs,
  tables) that reads fine top to bottom. Size is only a signal; split sooner when a file has
  more than one reason to change, mixes layers or concerns (logic and formatting, state and
  rendering), has functions longer than a screen, or needs a long comment to say what lives
  where. React components follow the same rule: pull out subcomponents and hooks once one
  component does several things.
- **Going over 600 is allowed with a reason.** Keep a file whole when splitting it would
  make it worse, for example one tightly coupled algorithm whose pieces only make sense
  together, or a split that would just scatter one concept across files. Say why in a comment
  at the top of the file, and add `/* eslint-disable max-lines -- <reason> */` so the reason
  is in the code and the warning goes away. ESLint warns (`max-lines`, 600 lines not counting
  blanks and comments, `src/content/` exempt); a warning doesn't fail `npm run lint`, but
  don't leave one unexplained.
- **How to split.** Split along the domain-module and contract lines above (§Contracts,
  "Where new things go"), not by size alone. Keep the public API stable by re-exporting from
  the original module path, so callers and tests don't churn. Test files mirror the source
  files they cover and split with them.
- **Order: tests first, then refactor.** Refactoring happens on green, never alongside a
  behavior change. Write or extend the tests that pin the current behavior, get them passing,
  and only then restructure. Run `npm run check` before and after; a behavior-neutral refactor
  must not change a test or a fixed-seed state hash (the headless hash column, §10, and the
  T0 identity check in `docs/DIFFICULTY_PHILOSOPHY.md` §9). Put the refactor in its own
  commit, separate from the feature or fix, so reviewers can check it changes nothing.
- **Scope.** A small refactor that the current item needs (splitting a file it is growing
  past the limit) belongs in that item, done after its tests pass. A larger refactor found
  along the way becomes its own `chore` item in the backlog rather than an unplanned change
  (CLAUDE.md §11).

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

- `npm run sim -- --jobs N` (1 to 64, default CPU cores - 1; 1 is today's serial run) runs seeds on
  worker threads (`tools/parallel.ts`, `tools/parallel-worker.mjs`, which loads the harness through
  `tsx/esm/api`). Seeds are handed out one at a time and results are stored by seed, so the report is
  identical for any N; lower it to leave CPU free. `--compare` passes the same `--jobs` to a ref
  whose `tools/headless.ts` mentions it and runs older refs serially.
- `npm run sim -- --json FILE` also saves the report: `{ version, args, results }`, every
  seed's `SeedResult`.
- `npm run sim -- --seeds N --compare REF` checks git ref `REF` out into a temporary detached
  worktree under `.sim-compare/` in this checkout (git-ignored; inside the checkout so the ref's
  code finds this checkout's `node_modules`, or a parent checkout's when this is itself a git
  worktree), runs **that ref's** `tools/sim.ts` there with the
  same arguments and `--json`, then removes the worktree. When `REF` is ahead of its merge base
  with `HEAD`, it warns with the commit count and suggests rebasing or running `--compare merge-base`
  (which resolves the merge base against `origin/main`, falling back to `main`). Refs from before
  `--json` are read from their printed table. `--baseline FILE` compares with a saved report instead. `tsx` is resolved the way Node
  does (walking up from the repo root), so `--compare` works from a worktree without its own
  `node_modules`.
- It prints a table of `METRICS` (runs, done, settled above bottom, hit cap, stalled, stuck,
  turns mean/min/max, explored, depth mean/max, turns per floor) with before, after and delta,
  then how many seeds end in a different state hash. Reports from before ETH-058 count as depth
  1. M1 items add rows to `METRICS` (death causes, currency per hour) as the report grows.
- Since ETH-062 a headless run stops when the run ends: `done` means it reached the bottom and
  ended, `early` that it ended above the bottom. `SeedResult` adds `end` (the outcome), `runTurns`
  (return trip included; `turns` stays the turn the party turned back) and `atRisk`. `METRICS`
  adds ended above bottom, one row per outcome, run turns and Renown and Trophies at risk.
- ETH-145 adds `--party-sweep` (`partySweepRow`, `partySweepWarnings`, `formatPartySweep`,
  `PARTY_SWEEP_MIN_RATIO`), `meanLevel` / member-mean level reporting, and `fell`-based death
  attribution (`e.killer?.def`, avoiding unattributed `other` deaths). `simArgv` forwards `--preset`,
  `--upgrades` and `--rules` (omitting defaults so older refs still run), and `formatComparison`
  throws when two reports ran with different arguments.

### 11.5 PR gates

Listed for contributors in [`../backlog/README.md`](../backlog/README.md#gates): `npm run
check` (typecheck, lint and every test, which includes the invariants, soak, determinism and
app-boot tests), the sim compare table in the PR body when the change warrants one (which changes
do, and at what seed tier: [`DIFFICULTY_PHILOSOPHY.md`](DIFFICULTY_PHILOSOPHY.md) §9), a look at the
running app for UI changes, and extending the contract/property guards in §11.6 whenever a new
critical service or extension seam is added.

### 11.6 Contract & property-guard criteria (ETH-131)

Unit tests verify paths the author had in mind, whereas cross-domain contract and property-based
guards verify invariants across *all* registered kinds, domains, or states so future features fail
fast instead of regressing silently. Apply and extend these six guards whenever building or
modifying a critical service in the categories below:

| When adding or changing… | Required guard | Where to extend | Impact / Value |
|---|---|---|---|
| Any **AI rule, condition, or scoring helper** that reads state with hidden/unidentified information (potions, scrolls, jewelry, traps, monsters, shrines, merchants) | **AI indistinguishability property test:** mutate hidden fields (`enchant`, `blessing`, `enchantments`) or swap same-category `def`s on `identified: false` items and assert `chooseRule` returns the identical `{ action, request }`. | `test/sim/enchantIdentify.test.ts` (or the feature's AI suite, e.g. `test/sim/salvage.test.ts` for the Field Salvage Kit rule, ETH-188) | **High / Very High** — prevents secret-peeking bugs in new AI domains |
| Any **SimEvent, log formatter, highlight rule, chronicle rule, or drop payload** carrying a player-discoverable secret (`item`, unseen trap/encounter, etc.) | **Non-spoiling event / log / chronicle sweep:** run unidentified/secret event payloads through `describeEvent`, `highlightWhen`, `discoveriesOf`, and `CHRONICLE_TRACKER`, asserting zero `{ ref }` Codex links, zero real-name substrings, `highlight: undefined`, and `[]` discoveries/entries. | `test/ui/logText.test.ts` | **High / Very High** — blocks UI tooltip, highlight, and chronicle spoilers |
| A new **`Effect['kind']`**, potency-scaled consumable, trait, shrine/fountain effect, or ranked enchantment trigger | **Exhaustive `Effect['kind']` potency contract:** `EFFECT_POTENCY_CASES: Record<EffectKind, () => void>` forces a TypeScript compile error until the new kind's `0.5×` / `1×` / `1.5×+` scaling is specified and tested. | `test/sim/stats.test.ts` | **High / High** — catches unscaled `ctx.potency` at compile time |
| A new **content kind, Codex renderer, or non-`alwaysKnown` def** (items, statuses, monsters, enchantments, deities, omens, bounties) | **Codex discoverability / reachability check:** map the kind's real producer event(s) in `probesByKind` and verify every non-`alwaysKnown`, non-`hidden` entry yields `>= 1` discovery mark via `discoveriesOf`. | `test/ui/codex.test.tsx` | **Medium-High / High** — guarantees no entry stays permanently stuck at `???` |
| Anything that sets an item's **`identified` flag** (loot, drops, monster carries) | **Secrecy property guard:** roll gear, potions and scrolls across every def and depth and assert `identified === false` for all of it, plain or not; the snapshot flag, name and `stateNote` of plain and hidden-property variants must be equal, with the type known or not; pickup, drop and sighting events and the AI's quaff and read choices must match too; a stack mixing blessings must look like a pure one. | `test/sim/identifySecrecy.test.ts`, `test/sim/consumableSecrecy.test.ts` | **High / High**: the flag never leaks what an item rolled |
| A new **`ItemPropertyKind`** (or similar sparse optional field on `ItemInstance` / `RunState` used in equality or `canStack` checks) | **Canonical-value invariant test:** ensure `schema` rejects every default/no-op value (`0`, `true`, `[]`, `{}`, `'uncursed'`) and register it in `CANONICAL_REJECTED`. | `test/sim/itemProperties.test.ts` | **Medium / High** — prevents duplicate unstackable instances and save bloat |
| A configurable **numeric range `{ min?, max? }`** with positive defaults (spawn counts, loot quantities, depth bounds, cooldowns) | **Use `clampRange` + `{ max: 0 }` boundary test:** compute and clamp `max` before clamping `min <= max` via `clampRange` (`src/core/range.ts`) and assert `{ max: 0 }` produces `{ min: 0, max: 0 }`. | `src/core/range.ts`, `test/core/range.test.ts`, caller suite | **Low-Medium / Medium** — stops positive `defaultMin` from overriding explicit disable (`max: 0`) |
