/**
 * The quests domain's rule condition and rule action (docs/ARCHITECTURE.md §4, ETH-024): the
 * baseline's simple objective. Go down until the relic is found (the floors rules already
 * descend), fetch it once the party has seen it, at any distance, and head up and out once every
 * contract is complete. Richer weighting of quest targets is ETH-031.
 *
 * The baseline uses them through `QUESTS_BASELINE` (spliced into `BASELINE_RULES` in
 * `ai/engine.ts`), and the Library can hand each one to the player's own rules.
 */
import type { Pos } from '../../core';
import { ITEMS } from '../../content';
import { aiPathGrid, followMap } from '../ai/navigate';
import { defineCondition, defineRuleAction, noParams } from '../ai/types';
import type { ConditionDef, Resolved, Rule, RuleActionDef } from '../ai/types';
import { getFloor } from '../entities';
import { buildGoalMap, UNREACHABLE } from '../goalMap';
import { itemsAt, knownItems } from '../items/inventory';
import { contractDef, contractsComplete } from './contracts';

const turns = (n: number) => `${n} ${n === 1 ? 'turn' : 'turns'}`;

/** True once the run has contracts and every one of them is complete. */
export const COND_CONTRACTS_COMPLETE = defineCondition({
  id: 'cond.contracts_complete',
  name: 'Contracts complete',
  scope: 'run',
  description:
    'True once every contract the party took on is complete (a recovered relic counts while a living adventurer carries it). ' +
    'Never true on a run without contracts.',
  parse: noParams,
  evaluate({ state }) {
    if (!contractsComplete(state)) return { ok: false, detail: '' };
    const n = state.domains.quests.contracts.length;
    return { ok: true, detail: n === 1 ? 'the contract is complete' : `all ${n} contracts are complete` };
  },
  describe: () => 'every contract complete',
});

/** The item ids the run's unfinished contracts still need picked up. */
function wantedItems(state: Parameters<typeof contractsComplete>[0]): Set<string> {
  const out = new Set<string>();
  for (const c of state.domains.quests.contracts) {
    if (c.complete) continue;
    const { objective } = contractDef(c.contract);
    if (objective.kind === 'recover') out.add(objective.item);
  }
  return out;
}

/**
 * Fetch an item an unfinished contract needs (the relic): pick it up if it lies here, else walk
 * to the nearest place on this floor where the party has seen one, however far.
 */
export const ACT_RECOVER_CONTRACT_ITEM = defineRuleAction({
  id: 'act.recover_contract_item',
  name: 'Recover the contract item',
  description:
    'Go and pick up an item a contract asks for, such as the relic, once the party has seen it on this floor, however far away it is.',
  parse: noParams,
  resolve(ctx): Resolved | null {
    const { state, actor } = ctx;
    const wanted = wantedItems(state);
    if (wanted.size === 0) return null;
    const here = itemsAt(state, actor.floor, actor.pos).find((e) => wanted.has(e.item.def));
    if (here !== undefined) {
      return { request: { id: 'pickup', item: here.id }, detail: `picking up the ${ITEMS.get(here.item.def).name}` };
    }
    const width = getFloor(state, actor.floor).terrain.width;
    const goals: Pos[] = [];
    let name = '';
    for (const [key, items] of Object.entries(knownItems(state, actor.floor))) {
      const found = items.find((k) => wanted.has(k.def));
      if (found === undefined) continue;
      const i = Number(key);
      goals.push({ x: i % width, y: Math.floor(i / width) });
      if (name === '') name = ITEMS.has(found.def) ? ITEMS.get(found.def).name : found.def;
    }
    if (goals.length === 0) return null;
    const paths = aiPathGrid(ctx);
    const map = buildGoalMap(paths, goals);
    const cost = map.get(actor.pos.x, actor.pos.y);
    if (cost === UNREACHABLE) return null;
    return followMap(ctx, paths, map, `going for the ${name}, ${turns(cost)} away`);
  },
  describe: () => 'recover the contract item',
});

/** The quests domain's conditions, in registration order. */
export const QUESTS_CONDITIONS: readonly ConditionDef[] = [COND_CONTRACTS_COMPLETE];

/** The quests domain's rule actions, in registration order. */
export const QUESTS_RULE_ACTIONS: readonly RuleActionDef[] = [ACT_RECOVER_CONTRACT_ITEM];

/**
 * The baseline's objective rules, checked after fighting and before exploring: once every
 * contract is complete, turn the party back and walk out; fetch a contract item the party has seen.
 */
export const QUESTS_BASELINE: readonly Rule[] = [
  { condition: { id: 'cond.contracts_complete' }, action: { id: 'act.retreat_run' }, enabled: true },
  { condition: { id: 'cond.always' }, action: { id: 'act.recover_contract_item' }, enabled: true },
];
