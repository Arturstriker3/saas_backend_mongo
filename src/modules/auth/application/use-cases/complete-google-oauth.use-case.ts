import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ApiProperty } from '@nestjs/swagger';
import { randomBytes } from 'crypto';
import { v7 as uuidv7 } from 'uuid';
import { z } from 'zod';
import { loadEnv } from '../../../../common/config/env';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { USER_CONSTANTS } from '../../../user/domain/user.entity';
import { PasswordHasher } from '../../domain/password-hasher.interface';
import { OAuthProviderClient } from '../../domain/oauth-provider.interface';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.interface';
import { LoginResponseDTO } from './authenticate-user.use-case';

export class CompleteGoogleOAuthRequestDTO {
  static schema = z.object({
    code: z.string().min(1),
    state: z.string().min(1),
  });

  @ApiProperty()
  code!: string;

  @ApiProperty()
  state!: string;
}

export const CompleteGoogleOAuthDTO = CompleteGoogleOAuthRequestDTO.schema;

export type CompleteGoogleOAuthInputDTO = z.infer<typeof CompleteGoogleOAuthDTO>;
export type CompleteGoogleOAuthOutputDTO = LoginResponseDTO;

type OAuthStatePayload = {
  provider: string;
  nonce: string;
  iat?: number;
  exp?: number;
};

export class CompleteGoogleOAuthUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: RefreshTokenRepository,
    private readonly jwt: JwtService,
    private readonly googleOAuthClient: OAuthProviderClient,
  ) {}

  async execute(input: CompleteGoogleOAuthInputDTO): Promise<CompleteGoogleOAuthOutputDTO> {
    const env = loadEnv();
    let statePayload: OAuthStatePayload;
    try {
      statePayload = await this.jwt.verifyAsync<OAuthStatePayload>(input.state, {
        secret: env.JWT_SECRET,
      });
    } catch {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    if (statePayload.provider !== 'google') {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const profile = await this.googleOAuthClient.getProfileFromAuthorizationCode(input.code);
    if (!profile.emailVerified) {
      throw new UnauthorizedException('Google email is not verified');
    }

    const existingUser = await this.users.findByEmail(profile.email);
    const user = existingUser ?? (await this.createUserFromGoogleProfile(profile.email, profile.name));

    if (!user.isActive) {
      throw new UnauthorizedException('User account is deactivated');
    }

    return this.createSessionTokens(user.uuid, user.role);
  }

  private async createUserFromGoogleProfile(email: string, name: string | null) {
    const randomPassword = randomBytes(32).toString('hex');
    const passwordHash = await this.hasher.hash(randomPassword);
    const normalizedName = this.normalizeName(name, email);
    return this.users.create({
      name: normalizedName,
      email,
      passwordHash,
      role: USER_CONSTANTS.ROLE_DEFAULT,
      language: USER_CONSTANTS.LANGUAGE_DEFAULT,
      birthDate: null,
    });
  }

  private normalizeName(name: string | null, email: string): string {
    if (name && name.trim().length > 0) return name.trim();
    const localPart = email.split('@')[0] ?? 'User';
    return localPart.trim() || 'User';
  }

  private async createSessionTokens(userId: string, role: string): Promise<CompleteGoogleOAuthOutputDTO> {
    const env = loadEnv();
    const accessToken = await this.jwt.signAsync(
      { sub: userId, role },
      { secret: env.JWT_SECRET, expiresIn: parseInt(env.JWT_EXPIRES_IN, 10) },
    );
    const refreshToken = randomBytes(24).toString('hex');
    const now = new Date();
    const ttlSeconds = parseInt(env.REFRESH_TOKEN_TTL, 10);
    const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
    await this.tokens.save({
      uuid: uuidv7(),
      token: refreshToken,
      userId,
      createdAt: now,
      expiresAt,
    });
    return { accessToken, refreshToken };
  }
}
