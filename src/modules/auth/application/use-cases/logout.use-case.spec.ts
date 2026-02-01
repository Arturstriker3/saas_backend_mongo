import { describe, it, expect } from 'bun:test';
import { LogoutUseCase } from './logout.use-case';
import type { RefreshTokenRepository } from '../../domain/refresh-token.repository.interface';

type MockFunction<Args extends unknown[] = unknown[], Return = unknown> = ((
  ...args: Args
) => Return) & {
  calls: Args[];
  setResolvedValue: (value: Awaited<Return>) => void;
  setImplementation: (impl: (...args: Args) => Return) => void;
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

function createTokens(): RefreshTokenRepositoryMock {
  return {
    save: createMock(),
    findByToken: createMock(),
    deleteByToken: createMock(),
    deleteByTokenAndUserId: createMock(),
  };
}

describe('LogoutUseCase', () => {
  it('deletes refresh token by token and user id', async () => {
    const tokens = createTokens();
    const useCase = new LogoutUseCase(tokens as unknown as RefreshTokenRepository);
    const input = { refreshToken: 'refresh-token', userId: 'user-uuid' };
    tokens.deleteByTokenAndUserId.setResolvedValue();

    const result = await useCase.execute(input);

    expect(tokens.deleteByTokenAndUserId.calls).toEqual([[input.refreshToken, input.userId]]);
    expect(result).toBeUndefined();
  });
});
