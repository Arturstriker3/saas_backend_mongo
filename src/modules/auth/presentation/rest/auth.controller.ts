import {
  Controller,
  Post,
  Body,
  Get,
  Req,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBody } from '@nestjs/swagger';
import { Inject } from '@nestjs/common';
import { Request } from 'express';
import { AuthenticateUserUseCase } from '../../application/use-cases/authenticate-user.use-case';
import { RefreshTokenUseCase } from '../../application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from '../../application/use-cases/logout.use-case';
import { RequestPasswordResetUseCase } from '../../application/use-cases/request-password-reset.use-case';
import { ConfirmPasswordResetUseCase } from '../../application/use-cases/confirm-password-reset.use-case';
import { UserEntity } from '../../../user/domain/user.entity';
import { RegisterUserUseCase } from '../../application/use-cases/register-user.use-case';
import { LoginInputDTO } from '../../application/use-cases/authenticate-user.use-case';
import { RefreshInputDTO } from '../../application/use-cases/refresh-token.use-case';
import { LogoutInputDTO } from '../../application/use-cases/logout.use-case';
import { RequestPasswordResetInputDTO } from '../../application/use-cases/request-password-reset.use-case';
import { ConfirmPasswordResetInputDTO } from '../../application/use-cases/confirm-password-reset.use-case';
import { RegisterUserInputDTO } from '../../application/use-cases/register-user.use-case';
import { Public, Authenticated } from '../../../../common/http/access.decorator';
import { UserRepositoryMongo } from '../../../user/infrastructure/user.repository.mongo';

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
    @Inject(UserRepositoryMongo)
    private readonly userRepo: UserRepositoryMongo,
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
  async login(@Body() body: LoginInputDTO) {
    const { accessToken, refreshToken } = await this.authUseCase.execute(body);
    return { accessToken, refreshToken };
  }

  @Get('me')
  @Authenticated()
  async me(@Req() req: Request & { user?: { userId?: string } }) {
    const userId = req.user?.userId;
    if (!userId) throw new UnauthorizedException();
    const user = await this.userRepo.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return this.toJSON(user);
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
  async register(@Body() body: RegisterUserInputDTO) {
    const user = await this.registerUseCase.execute(body);
    return this.toJSON(user);
  }

  @Post('refresh-token')
  @Authenticated()
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
  async refreshToken(@Body() body: RefreshInputDTO) {
    const { accessToken, refreshToken, user } = await this.refreshUseCase.execute(body);
    return { accessToken, refreshToken, user: this.toJSON(user) };
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
  async logout(@Body() body: LogoutInputDTO) {
    return this.logoutUseCase.execute(body);
  }

  @Post('request-password-reset')
  @Public()
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
  async requestPasswordReset(@Body() body: RequestPasswordResetInputDTO) {
    return this.requestResetUseCase.execute(body);
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
  async confirmPasswordReset(@Body() body: ConfirmPasswordResetInputDTO) {
    const user = await this.confirmResetUseCase.execute(body);
    return this.toJSON(user);
  }

  private toJSON(user: UserEntity) {
    return {
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isActive: user.isActive,
      role: user.role,
      credits: user.credits,
    };
  }
}
