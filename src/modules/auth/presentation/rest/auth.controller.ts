import { Controller, Post, Body, Get, Req, Inject, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import type { FastifyRequest } from 'fastify';
import {
  AuthenticateUserUseCase,
  LoginResponseDTO,
  LoginRequestDTO,
  LoginDTO,
} from '../../application/use-cases/authenticate-user.use-case';
import {
  RefreshTokenUseCase,
  RefreshTokenRequestDTO,
  RefreshTokenResponseDTO,
  RefreshDTO,
} from '../../application/use-cases/refresh-token.use-case';
import {
  LogoutBodyDTO,
  LogoutRequestDTO,
  LogoutUseCase,
} from '../../application/use-cases/logout.use-case';
import {
  RequestPasswordResetRequestDTO,
  RequestPasswordResetDTO,
  RequestPasswordResetUseCase,
} from '../../application/use-cases/request-password-reset.use-case';
import {
  ConfirmPasswordResetRequestDTO,
  ConfirmPasswordResetDTO,
  ConfirmPasswordResetUseCase,
} from '../../application/use-cases/confirm-password-reset.use-case';
import {
  RegisterUserRequestDTO,
  RegisterUserResponseDTO,
  RegisterUserDTO,
  RegisterUserUseCase,
} from '../../application/use-cases/register-user.use-case';
import type {
  AuthenticateUserOutputDTO,
  LoginInputDTO,
} from '../../application/use-cases/authenticate-user.use-case';
import type {
  RefreshInputDTO,
  RefreshTokenOutputDTO,
} from '../../application/use-cases/refresh-token.use-case';
import type { LogoutBodyInputDTO } from '../../application/use-cases/logout.use-case';
import type { RequestPasswordResetInputDTO } from '../../application/use-cases/request-password-reset.use-case';
import type { ConfirmPasswordResetInputDTO } from '../../application/use-cases/confirm-password-reset.use-case';
import type {
  RegisterUserOutputDTO,
  RegisterUserInputDTO,
} from '../../application/use-cases/register-user.use-case';
import { Public, Authenticated } from '../../../../common/http/access.decorator';
import { GetMeResponseDTO, GetMeUseCase } from '../../application/use-cases/get-me.use-case';
import type { GetMeOutputDTO } from '../../application/use-cases/get-me.use-case';
import { loadEnv } from '../../../../common/config/env';
import { ZodValidationPipe } from '../../../../common/http/zod-validation.pipe';

const env = loadEnv();

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    @Inject(AuthenticateUserUseCase)
    private readonly authUseCase: AuthenticateUserUseCase,
    @Inject(RefreshTokenUseCase)
    private readonly refreshUseCase: RefreshTokenUseCase,
    @Inject(LogoutUseCase) private readonly logoutUseCase: LogoutUseCase,
    @Inject(RequestPasswordResetUseCase)
    private readonly requestResetUseCase: RequestPasswordResetUseCase,
    @Inject(ConfirmPasswordResetUseCase)
    private readonly confirmResetUseCase: ConfirmPasswordResetUseCase,
    @Inject(RegisterUserUseCase)
    private readonly registerUseCase: RegisterUserUseCase,
    @Inject(GetMeUseCase)
    private readonly getMeUseCase: GetMeUseCase,
  ) {}

  @Post('login')
  @Public()
  @ApiBody({ type: LoginRequestDTO })
  @ApiCreatedResponse({ type: LoginResponseDTO })
  @ApiUnauthorizedResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @ApiBadRequestResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @HttpCode(HttpStatus.CREATED)
  async login(
    @Body(new ZodValidationPipe(LoginDTO)) body: LoginInputDTO,
  ): Promise<AuthenticateUserOutputDTO> {
    return this.authUseCase.execute(body);
  }

  @Get('me')
  @Authenticated()
  @ApiOkResponse({ type: GetMeResponseDTO })
  @ApiUnauthorizedResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @ApiNotFoundResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  async me(@Req() req: FastifyRequest & { user: { userId: string } }): Promise<GetMeOutputDTO> {
    return this.getMeUseCase.execute({ userId: req.user.userId });
  }

  @Post('register')
  @Public()
  @ApiBody({ type: RegisterUserRequestDTO })
  @ApiCreatedResponse({ type: RegisterUserResponseDTO })
  @ApiConflictResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @ApiBadRequestResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  async register(
    @Body(new ZodValidationPipe(RegisterUserDTO)) body: RegisterUserInputDTO,
  ): Promise<RegisterUserOutputDTO> {
    return this.registerUseCase.execute(body);
  }

  @Post('refresh-token')
  @Public()
  @ApiBody({ type: RefreshTokenRequestDTO })
  @ApiOkResponse({ type: RefreshTokenResponseDTO })
  @ApiUnauthorizedResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @ApiBadRequestResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  async refreshToken(
    @Body(new ZodValidationPipe(RefreshDTO)) body: RefreshInputDTO,
  ): Promise<RefreshTokenOutputDTO> {
    return this.refreshUseCase.execute(body);
  }

  @Post('logout')
  @Authenticated()
  @ApiBody({ type: LogoutRequestDTO })
  @ApiNoContentResponse()
  @ApiUnauthorizedResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @ApiBadRequestResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(
    @Body(new ZodValidationPipe(LogoutBodyDTO)) body: LogoutBodyInputDTO,
    @Req() req: FastifyRequest & { user: { userId: string } },
  ): Promise<void> {
    await this.logoutUseCase.execute({ ...body, userId: req.user.userId });
  }

  @Post('request-password-reset')
  @Public()
  @Throttle({
    default: {
      limit: parseInt(env.RATE_LIMIT_RESET_LIMIT, 10),
      ttl: parseInt(env.RATE_LIMIT_RESET_TTL, 10),
    },
  })
  @ApiBody({ type: RequestPasswordResetRequestDTO })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async requestPasswordReset(
    @Body(new ZodValidationPipe(RequestPasswordResetDTO)) body: RequestPasswordResetInputDTO,
  ): Promise<void> {
    await this.requestResetUseCase.execute(body);
  }

  @Post('confirm-password-reset')
  @Public()
  @ApiBody({ type: ConfirmPasswordResetRequestDTO })
  @ApiNoContentResponse()
  @ApiBadRequestResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @ApiNotFoundResponse({
    schema: { type: 'object', properties: { message: { type: 'string' } } },
  })
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirmPasswordReset(
    @Body(new ZodValidationPipe(ConfirmPasswordResetDTO)) body: ConfirmPasswordResetInputDTO,
  ): Promise<void> {
    await this.confirmResetUseCase.execute(body);
  }
}
