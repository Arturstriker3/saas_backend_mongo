export type UserRegisteredEvent = {
  name: 'UserRegistered';
  payload: {
    userId: string;
    email: string;
    name: string;
  };
  occurredAt: Date;
};

export type PasswordResetRequestedEvent = {
  name: 'PasswordResetRequested';
  payload: {
    email: string;
    token: string;
  };
  occurredAt: Date;
};

export type OrderConfirmedEvent = {
  name: 'OrderConfirmed';
  payload: {
    email: string;
    orderId: string;
  };
  occurredAt: Date;
};

export type DomainEvent =
  | UserRegisteredEvent
  | PasswordResetRequestedEvent
  | OrderConfirmedEvent;

export type DomainEventName = DomainEvent['name'];
