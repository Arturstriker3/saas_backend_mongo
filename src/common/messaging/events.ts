export const EMAIL_LANGUAGES = ['portuguese', 'english', 'spanish'] as const;
export type EmailLanguage = (typeof EMAIL_LANGUAGES)[number];

export type UserRegisteredEvent = {
  name: 'UserRegistered';
  payload: {
    userId: string;
    email: string;
    name: string;
    language: EmailLanguage;
  };
  occurredAt: Date;
};

export type PasswordResetRequestedEvent = {
  name: 'PasswordResetRequested';
  payload: {
    email: string;
    token: string;
    language: EmailLanguage;
  };
  occurredAt: Date;
};

export type DomainEvent = UserRegisteredEvent | PasswordResetRequestedEvent;

export type DomainEventName = DomainEvent['name'];
