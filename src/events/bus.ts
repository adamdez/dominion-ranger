import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

/**
 * Domain events emitted within Ranger.
 *
 * This is an in-process event bus. Not a message queue.
 * BullMQ handles durable async jobs. This handles immediate side-effects.
 */
export interface DomainEvents {
  'property.created': { dominionLeadId: string };
  'property.updated': { dominionLeadId: string; fields: string[] };
  'distress_event.ingested': { eventId: string; dominionLeadId: string; eventType: string; eventLayer: string };
  'scoring.completed': { dominionLeadId: string; scoreId: string; compositeScore: number };
  'lead.promoted': { promotionId: string; dominionLeadId: string; compositeScore: number; marketingTier: string };
  'sentinel.exported': { dominionLeadId: string; promotionId: string };
  'sentinel.status_received': { dominionLeadId: string; status: string };
  'audit.logged': { logId: string; actionType: string };
}

type EventName = keyof DomainEvents;

class DomainEventBus {
  private emitter = new EventEmitter();

  constructor() {
    this.emitter.setMaxListeners(50);
  }

  emit<E extends EventName>(event: E, payload: DomainEvents[E]): void {
    logger.debug({ event, payload }, 'Domain event emitted');
    this.emitter.emit(event, payload);
  }

  on<E extends EventName>(event: E, handler: (payload: DomainEvents[E]) => void | Promise<void>): void {
    this.emitter.on(event, async (payload) => {
      try {
        await handler(payload);
      } catch (err) {
        logger.error({ err, event, payload }, 'Domain event handler error');
      }
    });
  }

  off<E extends EventName>(event: E, handler: (payload: DomainEvents[E]) => void | Promise<void>): void {
    this.emitter.off(event, handler as (...args: unknown[]) => void);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
  }
}

export const domainEvents = new DomainEventBus();
