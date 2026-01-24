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
import type { LogoutUseCase, LogoutInputDTO } from '../../application/use-cases/logout.use-case';
import type {
  RequestPasswordResetUseCase,
  RequestPasswordResetInputDTO,
} from '../../application/use-cases/request-password-reset.use-case';
import type {
  ConfirmPasswordResetUseCase,
  ConfirmPasswordResetInputDTO,
  ConfirmPasswordResetOutputDTO,
} from '../../application/use-cases/confirm-password-reset.use-case';
import type {
  RegisterUserUseCase,
  RegisterUserInputDTO,
  RegisterUserOutputDTO,
} from '../../application/use-cases/register-user.use-case';
import type { GetMeUseCase, GetMeOutputDTO } from '../../application/use-cases/get-me.use-case';

type Mocks = {
  authUseCase: AuthenticateUserUseCase;
  refreshUseCase: RefreshTokenUseCase;
  logoutUseCase: LogoutUseCase;
  requestResetUseCase: RequestPasswordResetUseCase;
  confirmResetUseCase: ConfirmPasswordResetUseCase;
  registerUseCase: RegisterUserUseCase;
  getMeUseCase: GetMeUseCase;
};

function createController(): { controller: AuthController; mocks: Mocks } {
  const authUseCase = { execute: jest.fn() } as unknown as AuthenticateUserUseCase;
  const refreshUseCase = { execute: jest.fn() } as unknown as RefreshTokenUseCase;
  const logoutUseCase = { execute: jest.fn() } as unknown as LogoutUseCase;
  const requestResetUseCase = { execute: jest.fn() } as unknown as RequestPasswordResetUseCase;
  const confirmResetUseCase = { execute: jest.fn() } as unknown as ConfirmPasswordResetUseCase;
  const registerUseCase = { execute: jest.fn() } as unknown as RegisterUserUseCase;
  const getMeUseCase = { execute: jest.fn() } as unknown as GetMeUseCase;
  const controller = new AuthController(
    authUseCase,
    refreshUseCase,
    logoutUseCase,
    requestResetUseCase,
    confirmResetUseCase,
    registerUseCase,
    getMeUseCase,
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
    (mocks.authUseCase.execute as jest.Mock).mockResolvedValue(output);

    const result = await controller.login(input);

    expect(mocks.authUseCase.execute).toHaveBeenCalledWith(input);
    expect(result).toEqual(output);
  });

  it('delegates register to RegisterUserUseCase', async () => {
    const { controller, mocks } = createController();
    const input: RegisterUserInputDTO = {
      name: 'John Doe',
      email: 'john.doe@example.com',
      password: 'password123',
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
      credits: 0,
    };
    (mocks.registerUseCase.execute as jest.Mock).mockResolvedValue(output);

    const result = await controller.register(input);

    expect(mocks.registerUseCase.execute).toHaveBeenCalledWith(input);
    expect(result).toEqual(output);
  });

  it('delegates refresh token to RefreshTokenUseCase', async () => {
    const { controller, mocks } = createController();
    const input: RefreshInputDTO = { refreshToken: 'refresh-token' };
    const output: RefreshTokenOutputDTO = {
      accessToken: 'access-token',
      refreshToken: 'refresh-token-2',
    };
    (mocks.refreshUseCase.execute as jest.Mock).mockResolvedValue(output);

    const result = await controller.refreshToken(input);

    expect(mocks.refreshUseCase.execute).toHaveBeenCalledWith(input);
    expect(result).toEqual(output);
  });

  it('delegates logout to LogoutUseCase', async () => {
    const { controller, mocks } = createController();
    const input: LogoutInputDTO = { refreshToken: 'refresh-token' };
    (mocks.logoutUseCase.execute as jest.Mock).mockResolvedValue(true);

    const result = await controller.logout(input);

    expect(mocks.logoutUseCase.execute).toHaveBeenCalledWith(input);
    expect(result).toBe(true);
  });

  it('delegates password reset request to RequestPasswordResetUseCase', async () => {
    const { controller, mocks } = createController();
    const input: RequestPasswordResetInputDTO = { email: 'john.doe@example.com' };
    (mocks.requestResetUseCase.execute as jest.Mock).mockResolvedValue(true);

    const result = await controller.requestPasswordReset(input);

    expect(mocks.requestResetUseCase.execute).toHaveBeenCalledWith(input);
    expect(result).toBe(true);
  });

  it('delegates password reset confirmation to ConfirmPasswordResetUseCase', async () => {
    const { controller, mocks } = createController();
    const input: ConfirmPasswordResetInputDTO = {
      token: 'reset-token',
      newPassword: 'newPassword123',
    };
    const now = new Date('2025-01-01T10:00:00.000Z');
    const output: ConfirmPasswordResetOutputDTO = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john.doe@example.com',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      role: 'USER',
      credits: 0,
    };
    (mocks.confirmResetUseCase.execute as jest.Mock).mockResolvedValue(output);

    const result = await controller.confirmPasswordReset(input);

    expect(mocks.confirmResetUseCase.execute).toHaveBeenCalledWith(input);
    expect(result).toEqual(output);
  });

  it('delegates getMe to GetMeUseCase', async () => {
    const { controller, mocks } = createController();
    const now = new Date('2025-01-01T10:00:00.000Z');
    const output: GetMeOutputDTO = {
      uuid: 'user-uuid',
      name: 'John Doe',
      email: 'john.doe@example.com',
      createdAt: now,
      updatedAt: now,
      isActive: true,
      role: 'USER',
      credits: 0,
    };
    (mocks.getMeUseCase.execute as jest.Mock).mockResolvedValue(output);

    const result = await controller.me({ user: { userId: 'user-uuid' } } as never);

    expect(mocks.getMeUseCase.execute).toHaveBeenCalledWith({ userId: 'user-uuid' });
    expect(result).toEqual(output);
  });
});
