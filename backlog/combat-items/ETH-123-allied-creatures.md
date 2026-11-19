---
id: ETH-123
title: Allied non-party creatures: actors that fight with the party without being members
type: feature
status: ready
priority: P1
milestone: M5
epic: combat-items
size: M
depends_on: [ETH-040, ETH-058, ETH-060]
created: 2026-11-19
updated: 2026-11-19
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

## Log
- 2026-11-19: Created in the shared-systems pass (foundation for ETH-050, 089, 102, 106 and ghost allies).
- 2026-11-19: (spec gate) awaiting Nate's review of this spec
- 2026-11-19: Spec approved by Nate with all defaults as written. Status ready.
