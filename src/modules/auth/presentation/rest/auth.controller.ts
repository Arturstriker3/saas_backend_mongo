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
import { AuthenticateUserUseCase } from '../../application/use-cases/authenticate-user.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { LogoutBodyDTO, LogoutUseCase } from '../../application/use-cases/logout.use-case';
import {
  RequestPasswordResetDTO,
  RequestPasswordResetUseCase,
} from '../../application/use-cases/request-password-reset.use-case';
import {
  ConfirmPasswordResetDTO,
  ConfirmPasswordResetUseCase,
} from '../../application/use-cases/confirm-password-reset.use-case';
import {
  RegisterUserDTO,
  RegisterUserUseCase,
} from '../../application/use-cases/register-user.use-case';
import { LoginDTO } from '../../application/use-cases/authenticate-user.use-case';
import { RefreshDTO } from '../../application/use-cases/refresh-token.use-case';
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
import { GetMeUseCase } from '../../application/use-cases/get-me.use-case';
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
      },
      required: ['email', 'password'],
    },
    examples: {
      sample: {
        summary: 'Login example (same credentials as register)',
        value: { email: 'john.doe@example.com', password: 'password123' },
      },
    },
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
      required: ['accessToken', 'refreshToken'],
    },
  })
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
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        createdAt: { type: 'string', format: 'date-time' },
        role: { type: 'string' },
        language: { type: 'string', enum: ['portuguese', 'english', 'spanish'] },
        birthDate: { type: 'string', format: 'date-time', nullable: true },
      },
      required: ['name', 'email', 'createdAt', 'role', 'language', 'birthDate'],
    },
  })
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        password: { type: 'string' },
      },
      required: ['name', 'email', 'password'],
    },
    examples: {
      sample: {
        summary: 'Register example (same credentials as login)',
        value: {
          name: 'John Doe',
          email: 'john.doe@example.com',
          password: 'password123',
        },
      },
    },
  })
  @ApiCreatedResponse({
    schema: {
      type: 'object',
      properties: {
        uuid: { type: 'string' },
        name: { type: 'string' },
        email: { type: 'string', format: 'email' },
        createdAt: { type: 'string', format: 'date-time' },
        updatedAt: { type: 'string', format: 'date-time' },
        isActive: { type: 'boolean' },
        role: { type: 'string' },
        language: { type: 'string', enum: ['portuguese', 'english', 'spanish'] },
        birthDate: { type: 'string', format: 'date-time', nullable: true },
      },
      required: [
        'uuid',
        'name',
        'email',
        'createdAt',
        'updatedAt',
        'isActive',
        'role',
        'language',
        'birthDate',
      ],
    },
  })
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: { refreshToken: { type: 'string' } },
      required: ['refreshToken'],
    },
    examples: {
      sample: {
        summary: 'Refresh example',
        value: { refreshToken: 'b3b9b1e9e9c64f8892e4f1a0b0d2b8f7' },
      },
    },
  })
  @ApiOkResponse({
    schema: {
      type: 'object',
      properties: {
        accessToken: { type: 'string' },
        refreshToken: { type: 'string' },
      },
      required: ['accessToken', 'refreshToken'],
    },
  })
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: { refreshToken: { type: 'string' } },
      required: ['refreshToken'],
    },
    examples: {
      sample: {
        summary: 'Logout example',
        value: { refreshToken: 'b3b9b1e9e9c64f8892e4f1a0b0d2b8f7' },
      },
    },
  })
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: { email: { type: 'string', format: 'email' } },
      required: ['email'],
    },
    examples: {
      sample: { summary: 'Request reset', value: { email: 'user@example.com' } },
    },
  })
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
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        token: { type: 'string' },
        newPassword: { type: 'string' },
      },
      required: ['token', 'newPassword'],
    },
    examples: {
      sample: {
        summary: 'Confirm reset',
        value: { token: 'reset-token-hex-string', newPassword: 'newStrongPassword123' },
      },
    },
  })
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
