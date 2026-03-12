import { describe, it, expect } from 'bun:test';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { JwtStrategy } from './jwt.strategy';
import type { UserRepository } from '../../user/domain/user.repository.interface';
import type { UserEntity } from '../../user/domain/user.entity';

type MockFunction<Args extends unknown[] = unknown[], Return = unknown> = ((
  ...args: Args
) => Return) & {
  calls: Args[];
  setResolvedValue: (value: Awaited<Return>) => void;
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

type TestDeps = {
  findById: MockFunction<[string], Promise<UserEntity | null>>;
};

function createStrategy(): { strategy: JwtStrategy; deps: TestDeps } {
  const findById = createMock<[string], Promise<UserEntity | null>>();
  const users = { findById } as unknown as UserRepository;
  const strategy = new JwtStrategy(users);
  return { strategy, deps: { findById } };
}

describe('JwtStrategy', () => {
  it('returns authenticated user when account is active', async () => {
    const { strategy, deps } = createStrategy();
    const now = new Date('2025-01-01T10:00:00.000Z');
    const user = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john@example.com',
      passwordHash: 'hashed',
      role: 'USER',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      credits: 0,
    } as UserEntity;
    deps.findById.setResolvedValue(user);

    const result = await strategy.validate({ sub: user.uuid, role: 'USER' });

    expect(deps.findById.calls).toEqual([[user.uuid]]);
    expect(result).toEqual({ userId: user.uuid, role: 'USER' });
  });

  it('throws when account is deactivated and role is user', async () => {
    const { strategy, deps } = createStrategy();
    const now = new Date('2025-01-01T10:00:00.000Z');
    const user = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john@example.com',
      passwordHash: 'hashed',
      role: 'USER',
      createdAt: now,
      updatedAt: now,
      isActive: false,
      credits: 0,
    } as UserEntity;
    deps.findById.setResolvedValue(user);

    let error: unknown;
    try {
      await strategy.validate({ sub: user.uuid, role: 'USER' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(ForbiddenException);
  });

  it('allows deactivated admin account', async () => {
    const { strategy, deps } = createStrategy();
    const now = new Date('2025-01-01T10:00:00.000Z');
    const admin = {
      uuid: 'admin-uuid',
      name: 'Admin',
      email: 'admin@example.com',
      passwordHash: 'hashed',
      role: 'ADMIN',
      createdAt: now,
      updatedAt: now,
      isActive: false,
      credits: 0,
    } as UserEntity;
    deps.findById.setResolvedValue(admin);

    const result = await strategy.validate({ sub: admin.uuid, role: 'ADMIN' });

    expect(result).toEqual({ userId: admin.uuid, role: 'ADMIN' });
  });

  it('throws when token user does not exist', async () => {
    const { strategy, deps } = createStrategy();
    deps.findById.setResolvedValue(null);

    let error: unknown;
    try {
      await strategy.validate({ sub: 'missing-user', role: 'USER' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
  });
});
