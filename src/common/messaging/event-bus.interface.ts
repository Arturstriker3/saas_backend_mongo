import { DomainEvent } from './events';

export interface EventBus {
  publish(event: DomainEvent): Promise<void>;
}

export const EVENT_BUS = 'EVENT_BUS';
