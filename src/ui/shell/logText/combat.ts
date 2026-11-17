/** Log wording for the combat domain's events (`src/sim/combat/`). One entry per event type. */
import type { CombatEvent } from '../../../sim';
import type { LogTextRecord } from './types';

export const COMBAT_LOG_TEXT: LogTextRecord<CombatEvent> = {};
