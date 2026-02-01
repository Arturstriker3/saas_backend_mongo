import { BadRequestException } from '@nestjs/common';
import { describe, it, expect } from 'bun:test';
import { ConfirmPasswordResetUseCase } from './confirm-password-reset.use-case';
import type { UserEntity } from '../../../user/domain/user.entity';
import type { PasswordResetRecord } from '../../domain/password-reset.repository.interface';

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

type PasswordResetRepositoryMock = {
  save: MockFunction<[PasswordResetRecord], Promise<void>>;
  findByToken: MockFunction<[string], Promise<PasswordResetRecord | null>>;
  deleteByToken: MockFunction<[string], Promise<void>>;
};

type PasswordHasherMock = {
  hash: MockFunction<[string], Promise<string>>;
  compare: MockFunction<[string, string], Promise<boolean>>;
};

type TestDeps = {
  users: UserRepositoryMock;
  resets: PasswordResetRepositoryMock;
  hasher: PasswordHasherMock;
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
    hasher: {
      hash: createMock(),
      compare: createMock(),
    },
  };
}

describe('ConfirmPasswordResetUseCase', () => {
  it('updates password and deletes token', async () => {
    const deps = createDeps();
    const useCase = new ConfirmPasswordResetUseCase(deps.resets, deps.users, deps.hasher);
    const now = new Date();
    const user = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john.doe@example.com',
      passwordHash: 'old-hash',
      role: 'USER',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      credits: 0,
    } as UserEntity;
    const record: PasswordResetRecord = {
      uuid: 'reset-uuid',
      token: 'reset-token',
      userId: user.uuid,
      createdAt: now,
      expiresAt: new Date(Date.now() + 60_000),
    };
    deps.resets.findByToken.setResolvedValue(record);
    deps.users.findById.setResolvedValue(user);
    deps.hasher.hash.setResolvedValue('new-hash');
    deps.users.updatePasswordById.setResolvedValue(true);
    deps.resets.deleteByToken.setResolvedValue(undefined);

    const result = await useCase.execute({ token: record.token, newPassword: 'newPassword123' });

    expect(deps.resets.findByToken.calls).toEqual([[record.token]]);
    expect(deps.users.findById.calls).toEqual([[user.uuid]]);
    expect(deps.hasher.hash.calls).toEqual([['newPassword123']]);
    const [uuid, hash, updatedAt] = deps.users.updatePasswordById.calls[0] ?? [];
    expect(uuid).toBe(user.uuid);
    expect(hash).toBe('new-hash');
    expect(updatedAt).toBeInstanceOf(Date);
    expect(deps.resets.deleteByToken.calls).toEqual([[record.token]]);
    expect(result).toBeUndefined();
  });

  it('throws when reset token is invalid', async () => {
    const deps = createDeps();
    const useCase = new ConfirmPasswordResetUseCase(deps.resets, deps.users, deps.hasher);
    deps.resets.findByToken.setResolvedValue(null);

    let error: unknown;
    try {
      await useCase.execute({ token: 'missing-token', newPassword: 'newPassword123' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(BadRequestException);
    expect(deps.users.updatePasswordById.calls.length).toBe(0);
    expect(deps.resets.deleteByToken.calls.length).toBe(0);
  });
});
