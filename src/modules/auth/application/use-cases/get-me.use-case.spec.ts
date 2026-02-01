import { NotFoundException } from '@nestjs/common';
import { describe, it, expect } from 'bun:test';
import { GetMeUseCase } from './get-me.use-case';
import type { UserEntity } from '../../../user/domain/user.entity';

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

type TestDeps = {
  users: UserRepositoryMock;
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
  };
}

describe('GetMeUseCase', () => {
  it('returns reduced fields for user', async () => {
    const deps = createDeps();
    const useCase = new GetMeUseCase(deps.users);
    const now = new Date('2025-01-01T10:00:00.000Z');
    const user = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john.doe@example.com',
      passwordHash: 'hashed',
      role: 'USER',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      credits: 0,
    } as UserEntity;
    deps.users.findById.setResolvedValue(user);

    const result = await useCase.execute({ userId: 'user-uuid' });

    expect(deps.users.findById.calls).toEqual([['user-uuid']]);
    expect(result).toEqual({
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      role: user.role,
      credits: user.credits,
    });
  });

  it('throws when user is not found', async () => {
    const deps = createDeps();
    const useCase = new GetMeUseCase(deps.users);
    deps.users.findById.setResolvedValue(null);

    let error: unknown;
    try {
      await useCase.execute({ userId: 'missing-user' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(NotFoundException);
  });
});
