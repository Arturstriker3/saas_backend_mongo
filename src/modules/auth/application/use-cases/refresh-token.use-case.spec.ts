import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect } from 'bun:test';
import { RefreshTokenUseCase } from './refresh-token.use-case';
import type { UserEntity } from '../../../user/domain/user.entity';
import type { RefreshTokenRecord } from '../../domain/refresh-token.repository.interface';
import type { JwtService } from '@nestjs/jwt';

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

type RefreshTokenRepositoryMock = {
  save: MockFunction<[RefreshTokenRecord], Promise<void>>;
  findByToken: MockFunction<[string], Promise<RefreshTokenRecord | null>>;
  deleteByToken: MockFunction<[string], Promise<void>>;
  deleteByTokenAndUserId: MockFunction<[string, string], Promise<void>>;
};

type JwtServiceMock = {
  signAsync: MockFunction<[Record<string, unknown>, { expiresIn: number }], Promise<string>>;
};

type TestDeps = {
  users: UserRepositoryMock;
  tokens: RefreshTokenRepositoryMock;
  jwt: JwtServiceMock;
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
    tokens: {
      save: createMock(),
      findByToken: createMock(),
      deleteByToken: createMock(),
      deleteByTokenAndUserId: createMock(),
    },
    jwt: {
      signAsync: createMock(),
    },
  };
}

describe('RefreshTokenUseCase', () => {
  it('refreshes tokens when refresh token is valid', async () => {
    const deps = createDeps();
    const useCase = new RefreshTokenUseCase(
      deps.tokens,
      deps.users,
      deps.jwt as unknown as JwtService,
    );
    const now = new Date();
    const record: RefreshTokenRecord = {
      uuid: 'token-uuid',
      token: 'refresh-token',
      userId: 'user-uuid',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    };
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
    deps.tokens.findByToken.setResolvedValue(record);
    deps.users.findById.setResolvedValue(user);
    deps.jwt.signAsync.setResolvedValue('access-token');

    const result = await useCase.execute({ refreshToken: 'refresh-token' });

    expect(deps.tokens.findByToken.calls).toEqual([['refresh-token']]);
    expect(deps.users.findById.calls).toEqual([[record.userId]]);
    const [payload, options] = deps.jwt.signAsync.calls[0] ?? [];
    expect(payload).toEqual({ sub: user.uuid, role: user.role });
    expect(typeof options.expiresIn).toBe('number');
    expect(deps.tokens.deleteByToken.calls).toEqual([['refresh-token']]);
    const saved = deps.tokens.save.calls[0]?.[0];
    expect(saved.userId).toBe(user.uuid);
    expect(saved.token).toBe(result.refreshToken);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.expiresAt).toBeInstanceOf(Date);
    expect(result.accessToken).toBe('access-token');
  });

  it('throws when refresh token does not exist', async () => {
    const deps = createDeps();
    const useCase = new RefreshTokenUseCase(
      deps.tokens,
      deps.users,
      deps.jwt as unknown as JwtService,
    );
    deps.tokens.findByToken.setResolvedValue(null);

    let error: unknown;
    try {
      await useCase.execute({ refreshToken: 'missing-token' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(deps.users.findById.calls.length).toBe(0);
    expect(deps.tokens.deleteByToken.calls.length).toBe(0);
    expect(deps.tokens.save.calls.length).toBe(0);
  });

  it('throws when refresh token is expired', async () => {
    const deps = createDeps();
    const useCase = new RefreshTokenUseCase(
      deps.tokens,
      deps.users,
      deps.jwt as unknown as JwtService,
    );
    const record: RefreshTokenRecord = {
      uuid: 'token-uuid',
      token: 'refresh-token',
      userId: 'user-uuid',
      createdAt: new Date('2025-01-01T10:00:00.000Z'),
      expiresAt: new Date('2024-12-31T10:00:00.000Z'),
    };
    deps.tokens.findByToken.setResolvedValue(record);

    let error: unknown;
    try {
      await useCase.execute({ refreshToken: 'refresh-token' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(deps.users.findById.calls.length).toBe(0);
    expect(deps.tokens.deleteByToken.calls.length).toBe(0);
    expect(deps.tokens.save.calls.length).toBe(0);
  });

  it('throws when user is not found', async () => {
    const deps = createDeps();
    const useCase = new RefreshTokenUseCase(
      deps.tokens,
      deps.users,
      deps.jwt as unknown as JwtService,
    );
    const now = new Date('2025-01-01T10:00:00.000Z');
    const record: RefreshTokenRecord = {
      uuid: 'token-uuid',
      token: 'refresh-token',
      userId: 'user-uuid',
      createdAt: now,
      expiresAt: new Date(now.getTime() + 60_000),
    };
    deps.tokens.findByToken.setResolvedValue(record);
    deps.users.findById.setResolvedValue(null);

    let error: unknown;
    try {
      await useCase.execute({ refreshToken: 'refresh-token' });
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(deps.tokens.deleteByToken.calls.length).toBe(0);
    expect(deps.tokens.save.calls.length).toBe(0);
  });
});
