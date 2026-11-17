/**
 * Sim events: the typed record of everything that happened (docs/ARCHITECTURE.md §2.4).
 *
 * `step` returns them as a plain array; there is no global event bus. The log, the AI trace,
 * reward and conduct trackers and the Codex all read this one stream. Events are plain data so
 * a worker host can post them as they are.
 *
 * This file only composes: each domain declares its own event union (Contracts, "Domain
 * modules"), and `DomainTypes` in `domain.ts` lists them. Add events in your domain, not here.
 */
import type { CoreEvent } from './coreEvents';
import type { DomainKey, DomainTypes } from './domain';

/** What each kind of event carries: the core events plus every domain's. `emit` adds the `turn`. */
export type SimEventBody = CoreEvent | DomainTypes[DomainKey]['event'];

/** An event, stamped with the game turn (`RunState.turn`) it happened on. */
export type SimEvent = SimEventBody & { turn: number };

export type SimEventType = SimEvent['type'];

/** The event (with its `turn`) of one type. */
export type EventOf<K extends SimEventType> = Extract<SimEvent, { type: K }>;

/** Records an event. Handed to everything that runs inside `step`. */
export type Emit = (event: SimEventBody) => void;
