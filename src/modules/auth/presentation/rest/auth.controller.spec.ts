import { describe, it, expect } from 'bun:test';
import { AuthController } from './auth.controller';
import type {
  AuthenticateUserUseCase,
  AuthenticateUserOutputDTO,
  LoginInputDTO,
} from '../../application/use-cases/authenticate-user.use-case';
import type {
  RefreshTokenUseCase,
  RefreshTokenOutputDTO,
  RefreshInputDTO,
} from '../../application/use-cases/refresh-token.use-case';
import type {
  LogoutUseCase,
  LogoutBodyInputDTO,
} from '../../application/use-cases/logout.use-case';
import type {
  RequestPasswordResetUseCase,
  RequestPasswordResetInputDTO,
} from '../../application/use-cases/request-password-reset.use-case';
import type {
  ConfirmPasswordResetUseCase,
  ConfirmPasswordResetInputDTO,
} from '../../application/use-cases/confirm-password-reset.use-case';
import type {
  RegisterUserUseCase,
  RegisterUserInputDTO,
  RegisterUserOutputDTO,
} from '../../application/use-cases/register-user.use-case';
import type { GetMeUseCase, GetMeOutputDTO } from '../../application/use-cases/get-me.use-case';
import type {
  StartGoogleOAuthUseCase,
  StartGoogleOAuthOutputDTO,
} from '../../application/use-cases/start-google-oauth.use-case';
import type {
  CompleteGoogleOAuthUseCase,
  CompleteGoogleOAuthInputDTO,
  CompleteGoogleOAuthOutputDTO,
} from '../../application/use-cases/complete-google-oauth.use-case';

type MockFunction<Args extends unknown[] = unknown[], Return = unknown> = ((
  ...args: Args
) => Return) & {
  calls: Args[];
  setResolvedValue: (value: Awaited<Return>) => void;
  setImplementation: (impl: (...args: Args) => Return) => void;
};

type UseCaseMock<TInput, TOutput> = {
  execute: MockFunction<[TInput], Promise<TOutput>>;
};

type Mocks = {
  authUseCase: UseCaseMock<LoginInputDTO, AuthenticateUserOutputDTO>;
  refreshUseCase: UseCaseMock<RefreshInputDTO, RefreshTokenOutputDTO>;
  logoutUseCase: UseCaseMock<LogoutBodyInputDTO & { userId: string }, void>;
  requestResetUseCase: UseCaseMock<RequestPasswordResetInputDTO, boolean>;
  confirmResetUseCase: UseCaseMock<ConfirmPasswordResetInputDTO, void>;
  registerUseCase: UseCaseMock<RegisterUserInputDTO, RegisterUserOutputDTO>;
  getMeUseCase: UseCaseMock<{ userId: string }, GetMeOutputDTO>;
  startGoogleOAuthUseCase: {
    execute: MockFunction<[], Promise<StartGoogleOAuthOutputDTO>>;
  };
  completeGoogleOAuthUseCase: UseCaseMock<
    CompleteGoogleOAuthInputDTO,
    CompleteGoogleOAuthOutputDTO
  >;
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

function createController(): { controller: AuthController; mocks: Mocks } {
  const authUseCase: UseCaseMock<LoginInputDTO, AuthenticateUserOutputDTO> = {
    execute: createMock(),
  };
  const refreshUseCase: UseCaseMock<RefreshInputDTO, RefreshTokenOutputDTO> = {
    execute: createMock(),
  };
  const logoutUseCase: UseCaseMock<LogoutBodyInputDTO & { userId: string }, void> = {
    execute: createMock(),
  };
  const requestResetUseCase: UseCaseMock<RequestPasswordResetInputDTO, boolean> = {
    execute: createMock(),
  };
  const confirmResetUseCase: UseCaseMock<ConfirmPasswordResetInputDTO, void> = {
    execute: createMock(),
  };
  const registerUseCase: UseCaseMock<RegisterUserInputDTO, RegisterUserOutputDTO> = {
    execute: createMock(),
  };
  const getMeUseCase: UseCaseMock<{ userId: string }, GetMeOutputDTO> = {
    execute: createMock(),
  };
  const startGoogleOAuthUseCase = {
    execute: createMock<[], Promise<StartGoogleOAuthOutputDTO>>(),
  };
  const completeGoogleOAuthUseCase: UseCaseMock<
    CompleteGoogleOAuthInputDTO,
    CompleteGoogleOAuthOutputDTO
  > = {
    execute: createMock(),
  };
  const controller = new AuthController(
    authUseCase as unknown as AuthenticateUserUseCase,
    refreshUseCase as unknown as RefreshTokenUseCase,
    logoutUseCase as unknown as LogoutUseCase,
    requestResetUseCase as unknown as RequestPasswordResetUseCase,
    confirmResetUseCase as unknown as ConfirmPasswordResetUseCase,
    registerUseCase as unknown as RegisterUserUseCase,
    getMeUseCase as unknown as GetMeUseCase,
    startGoogleOAuthUseCase as unknown as StartGoogleOAuthUseCase,
    completeGoogleOAuthUseCase as unknown as CompleteGoogleOAuthUseCase,
  );
  return {
    controller,
    mocks: {
      authUseCase,
      refreshUseCase,
      logoutUseCase,
      requestResetUseCase,
      confirmResetUseCase,
      registerUseCase,
      getMeUseCase,
      startGoogleOAuthUseCase,
      completeGoogleOAuthUseCase,
    },
  };
}

describe('AuthController', () => {
  it('delegates login to AuthenticateUserUseCase', async () => {
    const { controller, mocks } = createController();
    const input: LoginInputDTO = { email: 'john.doe@example.com', password: 'password123' };
    const output: AuthenticateUserOutputDTO = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    };
    mocks.authUseCase.execute.setResolvedValue(output);

    const result = await controller.login(input);

    expect(mocks.authUseCase.execute.calls).toEqual([[input]]);
    expect(result).toEqual(output);
  });

  it('delegates register to RegisterUserUseCase', async () => {
    const { controller, mocks } = createController();
    const input: RegisterUserInputDTO = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      password: 'password123',
      language: 'english',
      birthDate: new Date('1995-06-15T00:00:00.000Z'),
    };
    const now = new Date('2025-01-01T10:00:00.000Z');
    const output: RegisterUserOutputDTO = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john.doe@example.com',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      role: 'USER',
      language: 'english',
      birthDate: input.birthDate,
    };
    mocks.registerUseCase.execute.setResolvedValue(output);

    const result = await controller.register(input);

    expect(mocks.registerUseCase.execute.calls).toEqual([[input]]);
    expect(result).toEqual(output);
  });

  it('delegates refresh token to RefreshTokenUseCase', async () => {
    const { controller, mocks } = createController();
    const input: RefreshInputDTO = { refreshToken: 'refresh-token' };
    const output: RefreshTokenOutputDTO = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token-2',
    };
    mocks.refreshUseCase.execute.setResolvedValue(output);

    const result = await controller.refreshToken(input);

    expect(mocks.refreshUseCase.execute.calls).toEqual([[input]]);
    expect(result).toEqual(output);
  });

  it('delegates logout to LogoutUseCase', async () => {
    const { controller, mocks } = createController();
    const input: LogoutBodyInputDTO = { refreshToken: 'refresh-token' };
    mocks.logoutUseCase.execute.setResolvedValue(undefined);

    const result = await controller.logout(input, { user: { userId: 'user-uuid' } } as never);

    expect(mocks.logoutUseCase.execute.calls).toEqual([
      [{ refreshToken: 'refresh-token', userId: 'user-uuid' }],
    ]);
    expect(result).toBeUndefined();
  });

  it('delegates password reset request to RequestPasswordResetUseCase', async () => {
    const { controller, mocks } = createController();
    const input: RequestPasswordResetInputDTO = { email: 'john.doe@example.com' };
    mocks.requestResetUseCase.execute.setResolvedValue(true);

    const result = await controller.requestPasswordReset(input);

    expect(mocks.requestResetUseCase.execute.calls).toEqual([[input]]);
    expect(result).toBeUndefined();
  });

  it('delegates password reset confirmation to ConfirmPasswordResetUseCase', async () => {
    const { controller, mocks } = createController();
    const input: ConfirmPasswordResetInputDTO = {
      token: 'reset-token',
      newPassword: 'newPassword123',
    };
    mocks.confirmResetUseCase.execute.setResolvedValue(undefined);

    const result = await controller.confirmPasswordReset(input);

    expect(mocks.confirmResetUseCase.execute.calls).toEqual([[input]]);
    expect(result).toBeUndefined();
  });

  it('delegates getMe to GetMeUseCase', async () => {
    const { controller, mocks } = createController();
    const now = new Date('2025-01-01T10:00:00.000Z');
    const output: GetMeOutputDTO = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      createdAt: now,
      role: 'USER',
      language: 'portuguese',
      birthDate: null,
    };
    mocks.getMeUseCase.execute.setResolvedValue(output);

    const result = await controller.me({ user: { userId: 'user-uuid' } } as never);

    expect(mocks.getMeUseCase.execute.calls).toEqual([[{ userId: 'user-uuid' }]]);
    expect(result).toEqual(output);
  });

  it('delegates google oauth start to StartGoogleOAuthUseCase', async () => {
    const { controller, mocks } = createController();
    const output: StartGoogleOAuthOutputDTO = {
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth?state=abc',
    };
    mocks.startGoogleOAuthUseCase.execute.setResolvedValue(output);

    const result = await controller.startGoogleOAuth();

    expect(mocks.startGoogleOAuthUseCase.execute.calls).toEqual([[]]);
    expect(result).toEqual(output);
  });

  it('delegates google oauth completion to CompleteGoogleOAuthUseCase', async () => {
    const { controller, mocks } = createController();
    const input: CompleteGoogleOAuthInputDTO = {
      code: 'authorization-code',
      state: 'signed-state',
    };
    const output: CompleteGoogleOAuthOutputDTO = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    };
    mocks.completeGoogleOAuthUseCase.execute.setResolvedValue(output);

    const result = await controller.completeGoogleOAuth(input);

    expect(mocks.completeGoogleOAuthUseCase.execute.calls).toEqual([[input]]);
    expect(result).toEqual(output);
  });
});
