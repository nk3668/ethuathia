---
id: ETH-123
title: Allied non-party creatures: actors that fight with the party without being members
type: feature
status: ready
priority: P1
milestone: M7
epic: combat-items
size: M
depends_on: [ETH-040, ETH-058, ETH-060]
created: 2026-11-19
updated: 2026-11-24
---

## Summary
Companions: actors on the party's side that are not party members. They fight the party's
enemies, follow a leader between floors and have their own AI rules, but they don't count for
party size, the wipe check, gathering at stairs, rewards or the roster. One `companion` part and
a few rules cover summons, pets, ghost allies, over-cap recruits and a helped rival party.

## Why
Summons and pets (ETH-050), pets that level (ETH-106), ghost allies (Ossuary, no item yet), a
recruit found when the party is full (ETH-089) and a rival party the player helps (ETH-102) all
need "on our side, but not one of us". Today the sim has two meanings mixed together:
`ActorPart.faction` (`'party' | 'monster' | 'neutral'`, read by `isHostile` and `isAlly`) and
`state.party` (the member list, read by the wipe check, `gatheringAt`, `act.descend`, run end and
the trackers). Without a shared design each feature would pick its own mix and break one of
those. See `CLAUDE.md` §7 (ghost allies) and the "Shared systems" list in `docs/ARCHITECTURE.md`.

## Acceptance criteria
- [ ] A combat-domain part `companion: { kind: 'summon' | 'pet' | 'ghost' | 'recruit' | 'escort',
      leader: EntityId | null, follows: boolean, expires?: turn, recordId? }` on an actor with
      faction `party` that is **not** in `state.party`. `isCompanion`, `companionsOf(state,
      leader)` and `partySide(state)` (members + companions) are the only ways code asks.
      Invariant `combat.companions` (leader is a party member or null, never in `state.party`).
      `STATE_VERSION` + 1.
- [ ] `spawnCompanion(state, defId, floor, pos, companion, overlay?)` builds one from a
      `MonsterDef` (and an ETH-117 overlay when given) with an `ai` part using
      `COMPANION_RULES`: attack an adjacent enemy, approach a visible enemy near the leader,
      stay within `FOLLOW_RADIUS` of the leader, wait. Monsters treat companions as enemies
      through the existing `isHostile`.
- [ ] Floors: when the leader takes stairs, following companions within `GATHER_RADIUS` go with
      them (placed next to the leader); companions are never waited for by `act.descend` /
      `act.gather` and never gather. Leaving the dungeon removes them.
- [ ] Run rules: companions don't stop a wipe, earn no XP (unless a later item says so), aren't
      in `runStarted` / `run.party`, and their kills count for Trophies as the party's. A
      companion at 0 HP dies like a monster (`died`) with its own log line ("Mira's hound falls").
- [ ] UI and text: `snapshot.domains.combat.companions` lists them; the party column shows them
      under their leader's card in a compact row; log text and Codex wording for joining,
      leaving and falling.
- [ ] Tests: fixed-seed hand-built map: a companion fights an adjacent monster, follows its leader
      down stairs, doesn't delay the descent, and the party wipes while it lives; save/load.

## Notes
Who uses it and how:
- **ETH-050 summons and pets:** a summon is a `summon` companion with `expires`; a pet is a `pet`
  companion that comes with its owner.
- **ETH-106 pets that level:** the pet's record id links it to profile data between runs.
- **Ghost allies** (Ossuary, no item yet): a grave encounter (ETH-116) spawns a `ghost` companion.
- **ETH-089 recruits:** a found adventurer over the party cap joins as a `recruit` companion and
  becomes a member (and a roster record) only after the run.
- **ETH-102 rival guild:** a helped rival switches from `neutral` to `escort` companions.

Open decisions:
- (default) Companions reuse faction `party` and differ from members only by not being in
  `state.party` — alternative: a new `ally` faction with a hostility table (more explicit, but
  every `isHostile` / `isAlly` call and monster rule must learn it).
- (default) Companions earn no XP and take no share of kill XP — alternative: they share XP like members.
- (default) A recruit over the cap is a companion for the rest of the run — alternative: it
  becomes a full member at once and the cap is soft.

## Implementation instructions

Because several existing systems previously assumed "`actor.faction === 'party'` means an adventurer in `state.party`" or "`!state.party.includes(id)` means a monster", follow this audit checklist carefully so companions don't break invariants, perception, swapping, death, or UI rendering:

1. **Entity model, helpers & invariants (`src/sim/combat/companions.ts`):**
   - Add `companion?: CompanionPart` to `CombatParts` (`src/sim/combat/index.ts`):
     `CompanionPart = { kind: 'summon' | 'pet' | 'ghost' | 'recruit' | 'escort'; leader: EntityId | null; follows: boolean; expires?: number; recordId?: string }`.
   - Export query helpers:
     - `isCompanion(entity: Entity | undefined): entity is ActorEntity & { companion: CompanionPart }` (`entity?.companion !== undefined`).
     - `companionsOf(state: RunState, leader: EntityId): ActorEntity[]` (living companions with `companion.leader === leader`, in entity id order).
     - `partySide(state: RunState): ActorEntity[]` (living `state.party` members followed by living companions, in id order).
   - **Critical existing-invariant update (`combat.monsters` in `src/sim/combat/index.ts`):**
     - Today `combat.monsters` asserts that *every* entity with `MONSTERS.has(e.def)` has `e.actor?.faction === 'monster'` and `e.monster !== undefined`. Since `spawnCompanion` builds a companion from a `MonsterDef` (`MONSTERS.has(e.def)`) with `faction: 'party'`, update `combat.monsters` to skip entities where `isCompanion(e)` is true (or require `e.companion === undefined` for monsters), and register `combat.companions` to check:
       - only non-`state.party` actors with `actor.faction === 'party'`, `ai !== undefined` and `stats !== undefined` have a `companion` part;
       - `leader` is `null` or an id in `state.party`;
       - `expires` (when present) is a positive integer. Don't check it against `state.turn`: remove expired companions at the start of `combatTurnStart`, before anyone acts. An invariant that compares against the turn would fire in the gap between steps.
       - if `MONSTERS.has(e.def)` and `e.monster?.overlay` is present, `overlayProblems` passes.
   - Bump `STATE_VERSION` by 1.
2. **Audit of `faction === 'party'` vs. `state.party` across the sim:**
   - **Step loop & perception (`src/sim/step.ts`, `src/sim/perception.ts`):**
     - In `step.ts`, `due` is only `state.party` (companions don't hold the party turn open on their own), and `scheduledActors` activates floors where a `state.party` member is. In `takeTurn`, `inParty = state.party.includes(actor.id)` already keeps perception and `tracePlayerAction` to true party members.
     - In `ruleDecide` (`src/sim/ai/engine.ts`), change `const traced = actor.actor.faction === 'party'` to `const traced = state.party.includes(actor.id)` so companions don't emit `ruleFired` trace spam or run party-level `checkProgress` / `countWaiting` stuck drops.
   - **Swapping & pathing (`src/sim/coreActions.ts`, `src/sim/ai/navigate.ts`, `src/sim/combat/rules.ts`):**
     - `swap` (`coreActions.ts`) checks `actor.actor.faction === 'party' && other.actor?.faction === 'party'` and `willingToSwap` (`navigate.ts`) checks `other.ai.memory.intent === null || idle`. Because companions have `faction: 'party'` and their idle rule (`act.companion_follow` / `act.wait`) is marked `idle: true`, party members can naturally swap past a companion blocking a narrow corridor! Verify `aiPathGrid` (`navigate.ts`) and `pathGridFor` (`combat/rules.ts`): a companion can plan on `floorPathGrid` (like monsters) or `aiPathGrid`, and `aiPathGrid` should add `OCCUPIED_COST` for companions on the floor too (`other.actor.faction === 'party'`).
   - **Combat death, kill attribution, XP & near-death (`src/sim/combat/death.ts`, `src/sim/combat/index.ts`, `src/sim/stats/leveling.ts`):**
     - In `killActor` (`death.ts`): `byParty` in `killed` should be `state.party.includes(killer.id) || isCompanion(killer)` so a companion's kill awards Trophies in `track.kills` ("their kills count for Trophies as the party's").
     - In `grantKillXp` / `killSharers` (`leveling.ts`): if a companion strikes the killing blow (`isCompanion(killer)`), living `state.party` members within `KILL_SHARE_RADIUS` of the killer or victim should still share the kill XP (or if the leader is on the floor, credit the party), while companions themselves are never in `killSharers` and never earn XP (`grantXp` already checks `entity.adventurer !== undefined`).
     - When a companion reaches 0 HP (or its `expires` turn arrives in `combatTurnStart` / `combatTurnEnd`), it is not in `state.party`, so `killActor` / `reapDead` emits `died` (with `companion?: { kind, leader }` or a dedicated `companionFell` / `died` wording: `"Mira's slate hound falls."`) and removes the entity (`removeEntity`).
     - In `isNearDeathBlow` (`combat/index.ts`), check `state.party` / `e.targetDef === DEFS.adventurer` rather than `!MONSTERS.has(e.targetDef)` so a companion taking a heavy hit does not trigger the `"An adventurer is near death"` highlight or chronicle moment!
     - In `combatTurnEnd` (`combat/index.ts`), restrict `noticeMonsters` to `state.party.includes(actor.id)` so companions don't emit `monsterSighted` with a companion as the spotter. **Also exclude companions from the candidates `noticeMonsters` looks at** (`combat/index.ts:426` filters on `e.monster !== undefined`, and a companion carries a `monster` part, so the party would "spot" its own hound). Companions do get natural `recovered`, the same as members.
     - **Drops:** `died` for a monster drops its overlay's `carries` and loot. A dying companion must drop nothing: check `isCompanion` before the drop step in `death.ts`.
     - **Names in text:** the `killed`, `died`, `attacked` and near-death lines name actors through `who(id, def, nameOf, …, names)`. A companion must read "Mira's slate hound" everywhere, both as attacker and victim, not "a slate hound". Do it once through `nameOf` / `actorName` for companions rather than per line, and add a log-text test with a companion on each side of `attacked`.
     - **Run-modifier scope:** `runModifiers.ts:171` applies `scope: 'party'` modifiers by `faction === 'party'`, so companions get party-wide modifiers and are skipped by `monster`-scoped ones (Omens such as Thriving Dark). That's the intended default ("on our side"). Write it in the Codex text, and pin it with a test so it doesn't change by accident.
3. **Companion AI & stairs transitions (`src/sim/combat/companions.ts`, `src/sim/floors/index.ts`):**
   - `spawnCompanion(state, defId, floor, pos, companion, overlay?)`: builds the entity from `MONSTERS.get(defId)` (with `monster: overlay ? { sighted: true, overlay } : { sighted: true }` so `monsterName`, `combat.overlay` stat provider, `combat.templates` bundle source and `rolePowers` all work on companions!), sets `actor.faction = 'party'`, attaches `companion`, gives it `COMPANION_RULES`, calls `fillVitals`, and emits `companionJoined { companion: entity.id, def: defId, kind: companion.kind, leader: companion.leader, name: actorName(entity), floor, pos }`.
   - `COMPANION_RULES` (`FOLLOW_RADIUS = 2`):
     1. `cond.enemy_adjacent` → `act.attack_adjacent` (or role powers if overlaid/caster/support).
     2. `cond.enemy_visible` (within sight and near leader) → `act.approach_enemy`.
     3. `cond.companion_far` (leader is on the same floor and `distance(actor.pos, leader.pos) > FOLLOW_RADIUS`) → `act.follow_leader` (walks toward `leader.pos` via `buildGoalMap`).
     4. `cond.always` → `act.wait`.
     - If a companion's `leader` falls (`actor.hp <= 0`), reassign `companion.leader` to the nearest living `state.party` member on the floor (or `null` if none) so the companion keeps fighting alongside survivors. Do it in `combatTurnStart`, deterministically: nearest by distance, then lowest id.
   - **Stairs (`src/sim/floors/index.ts`):**
     - `gatheringAt`, `stairsGathering`, `partyOnFloor` and `partyMemberAt` (`src/sim/floors/rules.ts`) read `state.party`, so companions never block or delay `act.descend`, `act.retreat_run` or `act.gather`.
     - In `FLOORS_ACTIONS.stairs.execute`:
       - When `to === null` (party leaves the dungeon): remove all companions (`removeEntity`) so none are left behind.
       - When `actor` moves from `from` to `to`: for each living companion in `companionsOf(state, actor.id)` on floor `from` with `companion.follows === true` and `distance(c.pos, oldActorPos) <= GATHER_RADIUS`, move it to `arrivalTile(state, to, pos)` on floor `to`.
4. **Snapshot, UI & Codex (`src/sim/combat/index.ts`, `src/ui/shell/PartyColumn.tsx`, `src/ui/map/`):**
   - Add `companions: CompanionView[]` to `CombatSnapshot` (`CompanionView = { id, def, name, kind, leader, floor, pos, hp, maxHp, expires? }`).
   - In `PartyColumn.tsx`, render any companions whose `leader === id` (or `leader === null` under the last living member) in a compact sub-row inside `PartyCard` showing the companion's name, kind badge and mini HP bar.
   - In `src/ui/map/scene.ts` and `glyphs.ts`: companions draw with their monster glyph plus a **non-color** marker. Color alone can't carry meaning (`CLAUDE.md` §8): use, for example, the party glyph's small slot-badge style with the leader's number, or an underline. Add the marker to `docs/VISUAL-DESIGN.md` §4. `describeTile` labels them `"<Name> (<Leader>'s companion)"` rather than as an enemy.
   - Sim compare: with no content spawning companions yet, the 50-seed compare must show 0 gameplay delta, and the state hashes should be identical too (the part is optional and nothing has it). If any hash differs, find out why and explain it in the PR.

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-050, 089, 102, 106 and ghost allies).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
- 2026-11-19: Implementation instructions drafted by Antigravity; reviewed and amended by Claude (bugs fixed, open either/or choices decided, missing cases added). Ready to build.
- 2026-11-24: Moved from M5 to M7 in the backlog reorganization by theme.
