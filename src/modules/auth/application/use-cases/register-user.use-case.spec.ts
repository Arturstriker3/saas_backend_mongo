import { ConflictException } from '@nestjs/common';
import { describe, it, expect } from 'bun:test';
import { RegisterUserUseCase } from './register-user.use-case';
import type { UserEntity } from '../../../user/domain/user.entity';
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
        credits: number;
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

type PasswordHasherMock = {
  hash: MockFunction<[string], Promise<string>>;
  compare: MockFunction<[string, string], Promise<boolean>>;
};

type EventBusMock = {
  publish: MockFunction<[DomainEvent], Promise<void>>;
};

type TestDeps = {
  users: UserRepositoryMock;
  hasher: PasswordHasherMock;
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
    hasher: {
      hash: createMock(),
      compare: createMock(),
    },
    events: {
      publish: createMock(),
    },
  };
}

describe('RegisterUserUseCase', () => {
  it('creates user and publishes event', async () => {
    const deps = createDeps();
    const useCase = new RegisterUserUseCase(deps.users, deps.hasher, deps.events);
    const input = {
      name: 'John Doe',
      email: 'John.Doe@Example.com',
      password: 'password123',
    };
    const now = new Date('2025-01-01T10:00:00.000Z');
    const entity = {
      uuid: 'user-uuid',
      name: input.name,
      email: input.email,
      passwordHash: 'hashed',
      role: 'USER',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      credits: 0,
    } as UserEntity;
    deps.users.existsByEmail.setResolvedValue(false);
    deps.hasher.hash.setResolvedValue('hashed');
    deps.users.create.setResolvedValue(entity);

    const result = await useCase.execute(input);

    expect(deps.users.existsByEmail.calls).toEqual([['john.doe@example.com']]);
    expect(deps.hasher.hash.calls).toEqual([[input.password]]);
    expect(deps.users.create.calls).toEqual([
      [
        {
          name: input.name,
          email: input.email,
          passwordHash: 'hashed',
          role: 'USER',
          credits: 0,
        },
      ],
    ]);
    const published = deps.events.publish.calls[0]?.[0] as {
      name: string;
      payload: { userId: string; email: string; name: string };
      occurredAt: Date;
    };
    expect(published.name).toBe('UserRegistered');
    expect(published.payload).toEqual({
      userId: entity.uuid,
      email: entity.email,
      name: entity.name,
    });
    expect(published.occurredAt).toBeInstanceOf(Date);
    expect(result).toEqual({
      name: input.name,
      email: input.email,
      uuid: entity.uuid,
      createdAt: entity.createdAt,
      updatedAt: entity.updatedAt,
      isActive: entity.isActive,
      role: entity.role,
      credits: entity.credits,
    });
  });

  it('throws when email already exists', async () => {
    const deps = createDeps();
    const useCase = new RegisterUserUseCase(deps.users, deps.hasher, deps.events);
    const input = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      password: 'password123',
    };
    deps.users.existsByEmail.setResolvedValue(true);

    let error: unknown;
    try {
      await useCase.execute(input);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ConflictException);
    expect(deps.users.create.calls.length).toBe(0);
    expect(deps.events.publish.calls.length).toBe(0);
  });
});
