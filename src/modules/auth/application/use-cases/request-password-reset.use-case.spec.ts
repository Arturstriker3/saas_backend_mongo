import { describe, it, expect } from 'bun:test';
import { RequestPasswordResetUseCase } from './request-password-reset.use-case';
import type { UserEntity } from '../../../user/domain/user.entity';
import type { PasswordResetRecord } from '../../domain/password-reset.repository.interface';
import type { DomainEvent } from '../../../../common/messaging/events';

type MockFunction<Args extends unknown[] = unknown[], Return = unknown> = ((
  ...args: Args
) => Return) & {
  calls: Args[];
  setResolvedValue: (value: Awaited<Return>) => void;
  setImplementation: (impl: (...args: Args) => Return) => void;
};

type UserRepositoryMock = {
  create: MockFunction<
    [
      {
        name: string;
        email: string;
        passwordHash: string;
        role: string;
        language: UserEntity['language'];
        birthDate: UserEntity['birthDate'];
      },
    ],
    Promise<UserEntity>
  >;
  findAll: MockFunction<[], Promise<UserEntity[]>>;
  findById: MockFunction<[string], Promise<UserEntity | null>>;
  findByEmail: MockFunction<[string], Promise<UserEntity | null>>;
  findByEmailWithPassword: MockFunction<[string], Promise<UserEntity | null>>;
  existsByEmail: MockFunction<[string], Promise<boolean>>;
  updateNameById: MockFunction<[string, string, Date], Promise<boolean>>;
  updatePasswordById: MockFunction<[string, string, Date], Promise<boolean>>;
  updateActiveById: MockFunction<[string, boolean, Date], Promise<boolean>>;
};

type PasswordResetRepositoryMock = {
  save: MockFunction<[PasswordResetRecord], Promise<void>>;
  findByToken: MockFunction<[string], Promise<PasswordResetRecord | null>>;
  deleteByToken: MockFunction<[string], Promise<void>>;
};

type EventBusMock = {
  publish: MockFunction<[DomainEvent], Promise<void>>;
};

type TestDeps = {
  users: UserRepositoryMock;
  resets: PasswordResetRepositoryMock;
  events: EventBusMock;
};

function createMock<Args extends unknown[] = unknown[], Return = unknown>(): MockFunction<
  Args,
  Return
> {
  let impl: (...args: Args) => Return = () => undefined as Return;
  const fn = ((...args: Args) => {
    fn.calls.push(args);
    return impl(...args);
  }) as MockFunction<Args, Return>;
  fn.calls = [];
  fn.setResolvedValue = (value) => {
    impl = () => Promise.resolve(value) as Return;
  };
  fn.setImplementation = (newImpl) => {
    impl = newImpl;
  };
  return fn;
}

function createDeps(): TestDeps {
  return {
    users: {
      create: createMock(),
      findAll: createMock(),
      findById: createMock(),
      findByEmail: createMock(),
      findByEmailWithPassword: createMock(),
      existsByEmail: createMock(),
      updateNameById: createMock(),
      updatePasswordById: createMock(),
      updateActiveById: createMock(),
    },
    resets: {
      save: createMock(),
      findByToken: createMock(),
      deleteByToken: createMock(),
    },
    events: {
      publish: createMock(),
    },
  };
}

describe('RequestPasswordResetUseCase', () => {
  it('returns true and does nothing when user does not exist', async () => {
    const deps = createDeps();
    const useCase = new RequestPasswordResetUseCase(deps.users, deps.resets, deps.events);
    deps.users.findByEmail.setResolvedValue(null);

    const result = await useCase.execute({ email: 'john.doe@example.com' });

    expect(result).toBe(true);
    expect(deps.users.findByEmail.calls).toEqual([['john.doe@example.com']]);
    expect(deps.resets.save.calls.length).toBe(0);
    expect(deps.events.publish.calls.length).toBe(0);
  });

  it('creates reset record and publishes event when user exists', async () => {
    const deps = createDeps();
    const useCase = new RequestPasswordResetUseCase(deps.users, deps.resets, deps.events);
    process.env.PASSWORD_RESET_TTL = '1800';
    const now = new Date('2025-01-01T10:00:00.000Z');
    const user = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john.doe@example.com',
      passwordHash: 'hashed',
      role: 'USER',
      language: 'portuguese',
      birthDate: null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    } as UserEntity;
    deps.users.findByEmail.setResolvedValue(user);

    const result = await useCase.execute({ email: 'John.Doe@Example.com' });

    expect(result).toBe(true);
    expect(deps.users.findByEmail.calls).toEqual([['john.doe@example.com']]);
    expect(deps.resets.save.calls.length).toBe(1);
    const saved = deps.resets.save.calls[0]?.[0] as PasswordResetRecord;
    expect(saved.userId).toBe(user.uuid);
    expect(saved.token.length).toBe(64);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.expiresAt).toBeInstanceOf(Date);
    expect(saved.expiresAt.getTime() - saved.createdAt.getTime()).toBe(1800 * 1000);
    const published = deps.events.publish.calls[0]?.[0] as {
      name: string;
      payload: { email: string; token: string };
      occurredAt: Date;
    };
    expect(published.name).toBe('PasswordResetRequested');
    expect(published.payload).toEqual({
      email: user.email,
      token: saved.token,
    });
    expect(published.occurredAt).toBeInstanceOf(Date);
  });
});
