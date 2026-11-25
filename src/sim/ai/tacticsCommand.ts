/**
 * The `setTactics` command (ETH-162, CLAUDE.md §5.2): the player's only way to change tactics, at
 * any time, mid-run included. It never takes effect by itself in any other way: the sim has no
 * automatic switching.
 *
 * Two scopes in one command:
 *
 * - **Party**, with no `actor`: `stance` and `formation`, applied to every party member.
 * - **Adventurer**, with `actor`: that adventurer's `role`, `range`, `focus` and `habits`.
 *
 * Fields left out keep their pick. The command is checked whole before anything changes, and the
 * new picks show at each adventurer's next decision (their rules are rebuilt and the engine reads
 * them then). A possessed adventurer keeps its tactics too; they apply once it is released.
 */
import type { CommandRecord } from '../commands';
import type { TacticAxis } from '../../content';
import type { Emit } from '../events';
import type { Entity, EntityId, RunState } from '../state';
import { applyTactics, tacticPickProblems } from './tactics';
import type { AiPart, TacticPicks } from './types';

export interface SetTacticsCommand {
  type: 'setTactics';
  /** Leave out to set the party's stance and formation; an adventurer's entity id to set their own picks. */
  actor?: EntityId;
  stance?: string;
  formation?: string;
  role?: string;
  range?: string;
  focus?: string;
  habits?: string[];
}

const PARTY_FIELDS = ['stance', 'formation'] as const;
const ADVENTURER_FIELDS = ['role', 'range', 'focus', 'habits'] as const;

type Member = Entity & { ai: AiPart & { tactics: TacticPicks } };

/** A party member that has tactics, or `undefined`. */
function memberWithTactics(state: RunState, id: EntityId): Member | undefined {
  const e = state.entities[id];
  return state.party.includes(id) && e?.adventurer !== undefined && e.ai?.tactics !== undefined ? (e as Member) : undefined;
}

/** The axis a picks field is on (`habits` is the habit axis). */
const AXIS: Readonly<Record<string, TacticAxis>> = { stance: 'stance', formation: 'formation', role: 'role', range: 'range', focus: 'focus', habits: 'habit' };

/** What a field of `raw` is, as the new value for `picks`, or why it is not valid. */
function readField(raw: Readonly<Record<string, unknown>>, field: string): string | string[] | undefined | null {
  const value = raw[field];
  if (value === undefined) return undefined;
  if (field === 'habits') return Array.isArray(value) && value.every((h) => typeof h === 'string') ? [...(value as string[])] : null;
  return typeof value === 'string' ? value : null;
}

export const TACTICS_COMMANDS: CommandRecord<SetTacticsCommand> = {
  setTactics: {
    type: 'setTactics',
    apply(state, raw, emit: Emit) {
      const party = raw.actor === undefined;
      const fields: readonly string[] = party ? PARTY_FIELDS : ADVENTURER_FIELDS;
      const other: readonly string[] = party ? ADVENTURER_FIELDS : PARTY_FIELDS;
      const known = new Set<string>(['type', 'actor', ...PARTY_FIELDS, ...ADVENTURER_FIELDS]);
      for (const key of Object.keys(raw)) if (!known.has(key)) return `Unknown field "${key}"`;
      for (const field of other) {
        if (raw[field] !== undefined) {
          return party ? `"${field}" is an adventurer's pick: say which adventurer with "actor"` : `"${field}" is the party's pick: leave out "actor"`;
        }
      }

      const changes: Record<string, string | string[]> = {};
      for (const field of fields) {
        const value = readField(raw, field);
        if (value === null) return `"${field}" must be ${field === 'habits' ? 'a list of tactic ids' : 'a tactic id'}`;
        if (value !== undefined) changes[field] = value;
      }
      if (Object.keys(changes).length === 0) return 'No tactics given';

      let targets: Member[];
      if (party) {
        targets = state.party.flatMap((id) => memberWithTactics(state, id) ?? []);
        if (targets.length === 0) return 'No adventurer in the party has tactics';
      } else {
        const member = typeof raw.actor === 'number' ? memberWithTactics(state, raw.actor) : undefined;
        if (member === undefined) return `Entity ${String(raw.actor)} is not an adventurer in the party with tactics`;
        targets = [member];
      }

      // Check every target's new picks before changing any.
      const next = targets.map((m): TacticPicks => ({ ...m.ai.tactics, ...(changes as Partial<TacticPicks>) }));
      for (const picks of next) {
        const problems = tacticPickProblems(picks);
        if (problems.length > 0) return problems.join('; ');
      }

      targets.forEach((m, i) => applyTactics(m.ai, next[i] as TacticPicks));
      for (const field of fields) {
        const value = changes[field];
        if (value === undefined) continue;
        emit({ type: 'tacticsSet', actor: party ? null : (raw.actor as EntityId), axis: AXIS[field] as TacticAxis, options: Array.isArray(value) ? value : [value] });
      }
      return null;
    },
  },
};
