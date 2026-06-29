import { describe, it, expect } from 'bun:test';
import { NotFoundException } from '@nestjs/common';
import { ChangeUserBirthDateUseCase } from './change-user-birth-date.use-case';
import type { UserEntity } from '../../domain/user.entity';

type MockFunction<Args extends unknown[] = unknown[], Return = unknown> = ((
  ...args: Args
) => Return) & {
  calls: Args[];
  setResolvedValue: (value: Awaited<Return>) => void;
};

type UserRepositoryMock = {
  findById: MockFunction<[string], Promise<UserEntity | null>>;
  updateBirthDateById: MockFunction<[string, Date | null, Date], Promise<boolean>>;
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

function createRepo(): {
  findById: MockFunction<[string], Promise<UserEntity | null>>;
  updateBirthDateById: MockFunction<[string, Date | null, Date], Promise<boolean>>;
} {
  return {
    findById: createMock(),
    updateBirthDateById: createMock(),
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

describe('ChangeUserBirthDateUseCase', () => {
  it('updates the user birth date', async () => {
    const repo = createRepo();
    const useCase = new ChangeUserBirthDateUseCase(repo);
    const user = makeUser({ birthDate: null });
    repo.findById.setResolvedValue(user);
    repo.updateBirthDateById.setResolvedValue(true);

    const result = await useCase.execute(user.uuid, { birthDate: '1995-06-15' });

    expect(repo.findById.calls).toEqual([[user.uuid]]);
    expect(repo.updateBirthDateById.calls).toEqual([
      [user.uuid, expect.any(Date), expect.any(Date)],
    ]);
    expect(result.birthDate).toBeInstanceOf(Date);
  });

  it('throws NotFoundException when user does not exist', async () => {
    const repo = createRepo();
    const useCase = new ChangeUserBirthDateUseCase(repo);
    repo.findById.setResolvedValue(null);

    let error: unknown;
    try {
      await useCase.execute('missing-user', { birthDate: '1995-06-15' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(NotFoundException);
    expect(repo.updateBirthDateById.calls.length).toBe(0);
  });

  it('updates updatedAt on success', async () => {
    const repo = createRepo();
    const useCase = new ChangeUserBirthDateUseCase(repo);
    const before = new Date('2025-01-01T10:00:00.000Z');
    const user = makeUser({ updatedAt: before });
    repo.findById.setResolvedValue(user);
    repo.updateBirthDateById.setResolvedValue(true);

    const result = await useCase.execute(user.uuid, { birthDate: '2000-01-01' });

    expect(result.updatedAt.getTime()).toBeGreaterThan(before.getTime());
  });
});
