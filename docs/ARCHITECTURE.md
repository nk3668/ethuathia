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

- **Requests are a typed union** keyed by `id` (`wait`, `move`, `openDoor`). Move and open door
  take a one-tile step `dir` (`{ x, y }`, each -1, 0 or 1, as in `DIRS_8`).
- **Definitions live in one `ACTIONS` record, not a `Registry`.** Actions are code, not data,
  and the record's type makes the set exhaustive: a request type without a def, or a def
  without a request type, fails to compile. Each `ActionDef` has `name` and `description` (Codex
  and tooltip text), an energy `cost`, and three functions: `parse` builds a clean request from
  untyped data, `validate` returns a reason or `null` and changes nothing, and `execute`.
- **Entry points:** `parseRequest` (for anything crossing into the sim, such as a
  `playerAction` command), `validateAction` (for the AI to check an action before choosing it)
  and `performAction` (for the scheduler, which charges the returned cost). An invalid request
  emits `actionFailed` with the reason and becomes a wait.
- **Movement rules** live in `stepBlocker(state, floor, from, dir)`, which ignores creatures so
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

- **Log:** one text template per event type, stored in content.
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
  supplies a hand-built first floor; without it `createRun` generates one (§3.6).
- **Party memory:** `RunState.memory` holds what the party has seen of each built floor, keyed
  like `floors` (§3.7). `STATE_VERSION` went to 2 when it was added, and to 3 when entities got
  the `ai` part (§4).
- **Planned: quest state.** Contracts and bounties (CLAUDE.md §6, Quests) will add quest
  state to `RunState`: the selected contracts and accepted bounties with per-quest progress,
  stored as ids and plain data. The shape is decided in ETH-024 and documented here then.

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
(energy, speed, HP, MP, faction), `adventurer` (name, class id, race id), `feature` (door
with `open`, or stairs with `dir`) and `ai` (rules and decision memory, ETH-009, §4). Adventurers
have the def `actor.adventurer`.

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

A `Snapshot` is a read-only view built for the UI: the current floor as the party knows it
(glyph ids, visibility, memory), party summaries with computed stats and current intent, and
run counters. The UI never sees `RunState`.

As built (ETH-010), in `src/sim/snapshot.ts`: `snapshot(state, view?)` where `ViewOptions` is
`{ floor? }` (default: the first living party member's floor). A `Snapshot` has `turn`, `seed`,
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
  code, in the sim's `GEN_STEPS` registry, so content names them by id only.
- **A step is a `GenStepDef`** made with `defineGenStep({ id, …, parse, run })`. `parse` checks
  the untyped params (usually with `readParams`, which fills in defaults and rejects unknown
  keys and out-of-range numbers), and `bind(params)` returns the step ready to run, so `run`
  only ever sees checked, typed params.
- **`generateFloor(type, rng)`** binds every step first, so a bad floor type fails before any
  draw, then runs them in order on an all-wall `FloorDraft` (a `FloorPlan` plus the `rooms`
  that later steps read) and returns the `FloorPlan` for `addFloor`. Errors name the floor
  type, the step's position and its id. `checkFloorType` does the binding alone, for validation.
- **`createRun`** generates the first floor from `FIRST_FLOOR_TYPE` with
  `new Rng(state.rng.dungeon)`; generation draws from nothing else.
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
- **Sight radius** comes only from `sightRadius(state, actor)`, `BASE_SIGHT_RADIUS` (8) for now.
  Gloom, blindness and light sources change it there once stats exist.
- **Memory is the party's, one per floor:** `RunState.memory[floorId]` rather than a grid per
  adventurer, since party members share everything they see. `addFloor` creates it empty.
  `terrain` is a `u8` grid of 0 (never seen) or 1 + the `Terrain` code last seen;
  `features` copies each seen feature (`def` and part) by tile index. Tiles out of view keep
  their last known state, so a door shut behind the party is still remembered open. Monsters
  are never remembered; items will be added beside features when they exist.
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
  Ids are `cond.*` and `act.*`. `paramSchema` arrives with the rules editor (M3).
- **Walking the rules:** the actor's own rules, then `BASELINE_RULES`. A rule is taken if it is
  enabled, isn't a dropped goal, names a registered condition and rule action with good params,
  its condition holds, and its action resolves to a request that passes `validateAction`.
  Anything else is skipped, never an error. `chooseRule` does the walk without side effects.
- **Trace:** `ruleFired { actor, rule: RuleRef, condition, action, detail }`, where `RuleRef` is
  `{ set: 'own' | 'baseline', index }` and `detail` reads "Explore: heading for unexplored ground
  6 turns away", with the condition's detail in brackets when it has one. The same is kept as
  `ai.memory.intent` for the party card.
- **Baseline rules**, in order: `cond.stuck → act.back_off`, `cond.always → act.explore`,
  `cond.always → act.wait`.
  - `act.explore` is frontier-based: the goals are tiles the actor could enter (on the party
    memory's path grid, closed doors at `OPEN_DOOR_COST`) with an unseen neighbor. Standing on one
    always reveals its neighbors, so each goal reached shrinks the frontier, and explored dead
    ends are never goals nor on a shortest route to one. A closed door next on the route becomes
    `openDoor`; another actor on the next tile becomes a wait ("waiting for X to get out of the
    way"). It returns `null` once no frontier tile is reachable, and the actor settles on
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
  (280 at worst over seeds 1–100), and 100 such floors run in about 3 s in the test suite.

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
  `registries.ts` lists every kind.
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
  `floor.halls`. A class sets starting max `hp` and `mp`; a race adds `hpBonus` and `mpBonus` and
  sets `speed`. `createRun` builds each adventurer's actor part from them (`adventurerActor`)
  and throws, naming the adventurer, on an unknown class or race. These become modifiers (§2.2)
  when stats exist. `actor.adventurer` is not a def: an adventurer's look comes from its slot.

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
- **Interface:** as sketched, plus `dispose()`. `onSnapshot` and `onEvents` return an
  unsubscribe function. An update is delivered as the events since the last one (one batch,
  never empty) followed by the snapshot after them. `start` delivers the first snapshot at
  once. `send` queues a command for the next step. `onError` (on the interface since ETH-021)
  gets a message when the host stops the run on an error: the worker pauses on a bad message or
  a thrown sim error, then reports it. `InlineHost` never calls it; its errors throw to the caller.
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
- **Protocol:** `HostRequest` is `start`, `command` or `setSpeed`. `HostMessage` is
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
- `profileStore`: only the currencies for now, all zero. M2 replaces it with the meta `Profile`.
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
- **`Explain`:** wraps any mention of a content id and shows its Codex entry on hover.
- **`NodeGraph`:** draws an upgrade tree as SVG from each node's `tier` and `column`.

`Panel`, `Card`, `Button`, `Tabs`, `Tooltip` and `Bar` exist (ETH-011) and are exported from
`ui/kit/index.ts`; the others arrive with the features that first need them. Kit stylesheets
use tokens only, which `test/ui/tokens.test.ts` enforces. In dev mode, `?kit` on the dev server
URL opens `ui/dev/KitGallery`, which shows every component and state; production builds drop
it.

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
| Rule condition or rule action | One registry entry, and a Library node to unlock it |
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
  (`tools/sim.ts`, logic in `tools/headless.ts`) runs the first floor of each seed through a
  `SimSession` until the party settles (every living member on the baseline `act.wait` for
  longer than a dropped goal lasts, `DROP_TURNS`), the cap in party turns (default 1000) is
  hit, or nobody can act. It prints a row per seed (game turns taken, explored percentage,
  stuck count, result, final state hash), a summary, and lists every seed that hit the cap,
  stalled or triggered stuck detection. Comparing the hash column before and after a refactor
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

### 11.2 Soak (`tools/soak.ts`)

`soakSeed(seed, { cap })` plays one seeded run (party size 1 to 4 by seed, no commands) for
`cap` party turns and fails it on: any invariant violation after any step; any throw; a save
and load (`serialize`/`deserialize`) halfway whose copy, stepped alongside the original for
`ROUND_TRIP_STEPS` (50), gives different events or state hashes (compared every `HASH_EVERY`
steps and at the end of that window); or a **stuck storm**,
more than `MAX_STUCK_PER_RUN` (5) `stuck` events in one run. A step where nobody can act ends
the run as `stalled`, which is not a failure.

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
- It prints a table of `METRICS` (floors, done, hit cap, stalled, stuck, turns mean/min/max,
  explored) with before, after and delta, then how many seeds end in a different state hash.
  M1 items add rows to `METRICS` (depth, death causes, currency per hour) as the report grows.

### 11.5 PR gates

Listed for contributors in [`../backlog/README.md`](../backlog/README.md#gates): `npm run
check` (typecheck, lint and every test, which includes the invariants, soak, determinism and
app-boot tests), the sim compare table against `origin/main` in the PR body, and a look at the
running app for UI changes.
