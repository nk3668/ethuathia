/**
 * The core domain's commands (docs/ARCHITECTURE.md §3.5). Feature domains declare theirs in
 * their own `src/sim/<domain>/` files; `domains.ts` joins every record into `COMMANDS`.
 */
import type { ActionRequest } from './actions';
import { POSSESSION_COMMANDS } from './ai/possession';
import type { PossessionCommand } from './ai/possession';
import { parseRequest } from './actions';
import type { CommandRecord } from './commands';
import type { EntityId } from './state';

/**
 * Overrides `actor`'s next decision with `action`. Possession sends one of these per key press
 * (ETH-066); a possessed adventurer waits for it, any other resumes the AI after it.
 */
export interface PlayerActionCommand {
  type: 'playerAction';
  actor: EntityId;
  action: ActionRequest;
}

/** The core domain's commands: player actions, and possession (`ai/possession.ts`, ETH-066). */
export type CoreCommand = PlayerActionCommand | PossessionCommand;

export const CORE_COMMANDS: CommandRecord<CoreCommand> = {
  playerAction: {
    type: 'playerAction',
    apply(state, raw) {
      const entity = typeof raw.actor === 'number' ? state.entities[raw.actor] : undefined;
      if (entity === undefined) return `No entity ${String(raw.actor)}`;
      if (entity.actor === undefined) return `Entity ${entity.id} cannot act`;
      // Parsed into a fresh object, so nothing the caller holds ends up in the state.
      const request = parseRequest(raw.action);
      if (typeof request === 'string') return request;
      entity.actor.queued = request;
      return null;
    },
  },
  ...POSSESSION_COMMANDS,
};
