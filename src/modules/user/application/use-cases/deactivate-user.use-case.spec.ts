import { describe, it, expect } from 'bun:test';
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DeactivateUserUseCase } from './deactivate-user.use-case';
import type { UserEntity } from '../../domain/user.entity';

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

function createRepo(): UserRepositoryMock {
  return {
    create: createMock(),
    findAll: createMock(),
    findById: createMock(),
    findByEmail: createMock(),
    findByEmailWithPassword: createMock(),
    existsByEmail: createMock(),
    updateNameById: createMock(),
    updatePasswordById: createMock(),
    updateActiveById: createMock(),
  };
}

describe('DeactivateUserUseCase', () => {
  it('deactivates an active user account', async () => {
    const repo = createRepo();
    const useCase = new DeactivateUserUseCase(repo);
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
    repo.findById.setResolvedValue(user);
    repo.updateActiveById.setResolvedValue(true);

    const result = await useCase.execute({ userId: user.uuid });

    expect(repo.findById.calls).toEqual([[user.uuid]]);
    expect(repo.updateActiveById.calls.length).toBe(1);
    expect(repo.updateActiveById.calls[0]?.[0]).toBe(user.uuid);
    expect(repo.updateActiveById.calls[0]?.[1]).toBe(false);
    expect(result.isActive).toBe(false);
  });

  it('throws when user does not exist', async () => {
    const repo = createRepo();
    const useCase = new DeactivateUserUseCase(repo);
    repo.findById.setResolvedValue(null);

    let error: unknown;
    try {
      await useCase.execute({ userId: 'missing-user' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(NotFoundException);
    expect(repo.updateActiveById.calls.length).toBe(0);
  });

  it('throws when target account is admin', async () => {
    const repo = createRepo();
    const useCase = new DeactivateUserUseCase(repo);
    const now = new Date('2025-01-01T10:00:00.000Z');
    const admin = {
      uuid: 'admin-uuid',
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: 'hashed',
      role: 'ADMIN',
      language: 'portuguese',
      birthDate: null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    } as UserEntity;
    repo.findById.setResolvedValue(admin);

    let error: unknown;
    try {
      await useCase.execute({ userId: admin.uuid });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(repo.updateActiveById.calls.length).toBe(0);
  });
});
