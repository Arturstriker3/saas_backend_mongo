import { describe, it, expect } from 'bun:test';
import type { JwtService } from '@nestjs/jwt';
import { CompleteGoogleOAuthUseCase } from './complete-google-oauth.use-case';
import type { UserEntity } from '../../../user/domain/user.entity';
import type { RefreshTokenRecord } from '../../domain/refresh-token.repository.interface';
import type { OAuthProviderProfile } from '../../domain/oauth-provider.interface';
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

type PasswordHasherMock = {
  hash: MockFunction<[string], Promise<string>>;
  compare: MockFunction<[string, string], Promise<boolean>>;
};

type RefreshTokenRepositoryMock = {
  save: MockFunction<[RefreshTokenRecord], Promise<void>>;
  findByToken: MockFunction<[string], Promise<RefreshTokenRecord | null>>;
  deleteByToken: MockFunction<[string], Promise<void>>;
  deleteByTokenAndUserId: MockFunction<[string, string], Promise<void>>;
};

type JwtServiceMock = {
  verifyAsync: MockFunction<[string, { secret: string }], Promise<{ provider: string; nonce: string }>>;
  signAsync: MockFunction<
    [Record<string, unknown>, { secret: string; expiresIn: number }],
    Promise<string>
  >;
};

type OAuthProviderClientMock = {
  buildAuthorizationUrl: MockFunction<[string], string>;
  getProfileFromAuthorizationCode: MockFunction<[string], Promise<OAuthProviderProfile>>;
};

type EventBusMock = {
  publish: MockFunction<[DomainEvent], Promise<void>>;
};

type TestDeps = {
  users: UserRepositoryMock;
  hasher: PasswordHasherMock;
  tokens: RefreshTokenRepositoryMock;
  jwt: JwtServiceMock;
  oauth: OAuthProviderClientMock;
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
    tokens: {
      save: createMock(),
      findByToken: createMock(),
      deleteByToken: createMock(),
      deleteByTokenAndUserId: createMock(),
    },
    jwt: {
      verifyAsync: createMock(),
      signAsync: createMock(),
    },
    oauth: {
      buildAuthorizationUrl: createMock(),
      getProfileFromAuthorizationCode: createMock(),
    },
    events: {
      publish: createMock(),
    },
  };
}

describe('CompleteGoogleOAuthUseCase', () => {
  it('creates user on first google login and publishes welcome event', async () => {
    const deps = createDeps();
    const useCase = new CompleteGoogleOAuthUseCase(
      deps.users,
      deps.hasher,
      deps.tokens,
      deps.jwt as unknown as JwtService,
      deps.oauth,
      deps.events,
    );
    const now = new Date('2025-01-01T10:00:00.000Z');
    const createdUser = {
      uuid: 'new-user-uuid',
      name: 'John From Google',
      email: 'john.google@example.com',
      passwordHash: 'hashed-password',
      role: 'USER',
      language: 'english',
      birthDate: null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    } as UserEntity;
    deps.jwt.verifyAsync.setResolvedValue({ provider: 'google', nonce: 'nonce' });
    deps.oauth.getProfileFromAuthorizationCode.setResolvedValue({
      provider: 'google',
      providerUserId: 'google-user-id',
      email: createdUser.email,
      emailVerified: true,
      name: createdUser.name,
    });
    deps.users.findByEmail.setResolvedValue(null);
    deps.hasher.hash.setResolvedValue(createdUser.passwordHash);
    deps.users.create.setResolvedValue(createdUser);
    deps.jwt.signAsync.setResolvedValue('access-token');

    const result = await useCase.execute({ code: 'google-code', state: 'signed-state' });

    expect(deps.users.create.calls).toEqual([
      [
        {
          name: createdUser.name,
          email: createdUser.email,
          passwordHash: createdUser.passwordHash,
          role: 'USER',
          language: 'english',
          birthDate: null,
        },
      ],
    ]);
    const published = deps.events.publish.calls[0]?.[0] as {
      name: string;
      payload: { userId: string; email: string; name: string; language: string };
      occurredAt: Date;
    };
    expect(published.name).toBe('UserRegistered');
    expect(published.payload).toEqual({
      userId: createdUser.uuid,
      email: createdUser.email,
      name: createdUser.name,
      language: createdUser.language,
    });
    expect(published.occurredAt).toBeInstanceOf(Date);
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken.length).toBe(48);
    expect(deps.tokens.save.calls.length).toBe(1);
  });

  it('does not publish welcome event when user already exists', async () => {
    const deps = createDeps();
    const useCase = new CompleteGoogleOAuthUseCase(
      deps.users,
      deps.hasher,
      deps.tokens,
      deps.jwt as unknown as JwtService,
      deps.oauth,
      deps.events,
    );
    const now = new Date('2025-01-01T10:00:00.000Z');
    const existingUser = {
      uuid: 'existing-user-uuid',
      name: 'Existing User',
      email: 'existing.user@example.com',
      passwordHash: 'hashed-password',
      role: 'USER',
      language: 'portuguese',
      birthDate: null,
      createdAt: now,
      updatedAt: now,
      isActive: true,
    } as UserEntity;
    deps.jwt.verifyAsync.setResolvedValue({ provider: 'google', nonce: 'nonce' });
    deps.oauth.getProfileFromAuthorizationCode.setResolvedValue({
      provider: 'google',
      providerUserId: 'google-existing',
      email: existingUser.email,
      emailVerified: true,
      name: existingUser.name,
    });
    deps.users.findByEmail.setResolvedValue(existingUser);
    deps.jwt.signAsync.setResolvedValue('access-token');

    const result = await useCase.execute({ code: 'google-code', state: 'signed-state' });

    expect(deps.users.create.calls.length).toBe(0);
    expect(deps.events.publish.calls.length).toBe(0);
    expect(result.accessToken).toBe('access-token');
    expect(result.refreshToken.length).toBe(48);
    expect(deps.tokens.save.calls.length).toBe(1);
  });
});
