import { UnauthorizedException } from '@nestjs/common';
import { describe, it, expect } from 'bun:test';
import { AuthenticateUserUseCase } from './authenticate-user.use-case';
import type { UserEntity } from '../../../user/domain/user.entity';
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

type PasswordHasherMock = {
  hash: MockFunction<[string], Promise<string>>;
  compare: MockFunction<[string, string], Promise<boolean>>;
};

type RefreshTokenRepositoryMock = {
  save: MockFunction<
    [
      {
        uuid: string;
        token: string;
        userId: string;
        createdAt: Date;
        expiresAt: Date;
      },
    ],
    Promise<void>
  >;
  findByToken: MockFunction<[string], Promise<null>>;
  deleteByToken: MockFunction<[string], Promise<void>>;
  deleteByTokenAndUserId: MockFunction<[string, string], Promise<void>>;
};

type JwtServiceMock = {
  signAsync: MockFunction<[Record<string, unknown>, { expiresIn: number }], Promise<string>>;
};

type TestDeps = {
  users: UserRepositoryMock;
  hasher: PasswordHasherMock;
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
    hasher: {
      hash: createMock(),
      compare: createMock(),
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

describe('AuthenticateUserUseCase', () => {
  it('returns tokens for valid credentials', async () => {
    const deps = createDeps();
    const useCase = new AuthenticateUserUseCase(
      deps.users,
      deps.hasher,
      deps.tokens,
      deps.jwt as unknown as JwtService,
    );
    const input = { email: 'john.doe@example.com', password: 'password123' };
    const now = new Date('2025-01-01T10:00:00.000Z');
    const user = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: input.email,
      passwordHash: 'hashed',
      role: 'USER',
      language: 'portuguese',
      birthDate: null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    } as UserEntity;
    deps.users.findByEmailWithPassword.setResolvedValue(user);
    deps.hasher.compare.setResolvedValue(true);
    deps.jwt.signAsync.setResolvedValue('access-token');

    const result = await useCase.execute(input);

    expect(deps.users.findByEmailWithPassword.calls).toEqual([[input.email]]);
    expect(deps.hasher.compare.calls).toEqual([[input.password, user.passwordHash]]);
    const [payload, options] = deps.jwt.signAsync.calls[0] ?? [];
    expect(payload).toEqual({ sub: user.uuid, role: user.role });
    expect(typeof options.expiresIn).toBe('number');
    const saved = deps.tokens.save.calls[0]?.[0];
    expect(saved.userId).toBe(user.uuid);
    expect(saved.token).toBe(result.refreshToken);
    expect(saved.createdAt).toBeInstanceOf(Date);
    expect(saved.expiresAt).toBeInstanceOf(Date);
    expect(result.accessToken).toBe('access-token');
  });

  it('throws when password is invalid', async () => {
    const deps = createDeps();
    const useCase = new AuthenticateUserUseCase(
      deps.users,
      deps.hasher,
      deps.tokens,
      deps.jwt as unknown as JwtService,
    );
    const input = { email: 'john.doe@example.com', password: 'wrong' };
    const now = new Date('2025-01-01T10:00:00.000Z');
    const user = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: input.email,
      passwordHash: 'hashed',
      role: 'USER',
      language: 'portuguese',
      birthDate: null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    } as UserEntity;
    deps.users.findByEmailWithPassword.setResolvedValue(user);
    deps.hasher.compare.setResolvedValue(false);

    let error: unknown;
    try {
      await useCase.execute(input);
    } catch (err) {
      error = err;
    }

    expect(error).toBeInstanceOf(UnauthorizedException);
    expect(deps.tokens.save.calls.length).toBe(0);
    expect(deps.jwt.signAsync.calls.length).toBe(0);
  });
});
