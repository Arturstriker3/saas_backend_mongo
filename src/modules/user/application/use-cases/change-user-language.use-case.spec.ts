import { describe, it, expect } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { ChangeUserLanguageUseCase } from './change-user-language.use-case';
import type { UserEntity } from '../../domain/user.entity';

type MockFunction<Args extends unknown[] = unknown[], Return = unknown> = ((
  ...args: Args
) => Return) & {
  calls: Args[];
  setResolvedValue: (value: Awaited<Return>) => void;
};

type UserRepositoryMock = {
  findById: MockFunction<[string], Promise<UserEntity | null>>;
  updateLanguageById: MockFunction<[string, string, Date], Promise<boolean>>;
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
  return fn;
}

function createRepo(overrides?: Partial<UserRepositoryMock>): {
  findById: MockFunction<[string], Promise<UserEntity | null>>;
  updateLanguageById: MockFunction<[string, string, Date], Promise<boolean>>;
} {
  return {
    findById: createMock(),
    updateLanguageById: createMock(),
    ...overrides,
  };
}

const makeUser = (overrides?: Partial<UserEntity>): UserEntity =>
  ({
    uuid: 'user-uuid',
    name: 'John Doe',
    email: 'john.doe@example.com',
    passwordHash: 'hashed',
    role: 'USER',
    language: 'portuguese',
    birthDate: null,
    createdAt: new Date('2025-01-01T10:00:00.000Z'),
    updatedAt: new Date('2025-01-01T10:00:00.000Z'),
    isActive: true,
    ...overrides,
  }) as UserEntity;

describe('ChangeUserLanguageUseCase', () => {
  it('updates the user language', async () => {
    const repo = createRepo();
    const useCase = new ChangeUserLanguageUseCase(repo);
    const user = makeUser({ language: 'portuguese' });
    repo.findById.setResolvedValue(user);
    repo.updateLanguageById.setResolvedValue(true);

    const result = await useCase.execute(user.uuid, { language: 'english' });

    expect(repo.findById.calls).toEqual([[user.uuid]]);
    expect(repo.updateLanguageById.calls).toEqual([[user.uuid, 'english', expect.any(Date)]]);
    expect(result.language).toBe('english');
  });

  it('throws NotFoundException when user does not exist', async () => {
    const repo = createRepo();
    const useCase = new ChangeUserLanguageUseCase(repo);
    repo.findById.setResolvedValue(null);

    let error: unknown;
    try {
      await useCase.execute('missing-user', { language: 'english' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(NotFoundException);
    expect(repo.updateLanguageById.calls.length).toBe(0);
  });

  it('updates updatedAt on success', async () => {
    const repo = createRepo();
    const useCase = new ChangeUserLanguageUseCase(repo);
    const before = new Date('2025-01-01T10:00:00.000Z');
    const user = makeUser({ updatedAt: before });
    repo.findById.setResolvedValue(user);
    repo.updateLanguageById.setResolvedValue(true);

    const result = await useCase.execute(user.uuid, { language: 'spanish' });

    expect(result.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });
});
