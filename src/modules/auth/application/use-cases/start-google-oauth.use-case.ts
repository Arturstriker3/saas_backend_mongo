import { JwtService } from '@nestjs/jwt';
import { ApiProperty } from '@nestjs/swagger';
import { v7 as uuidv7 } from 'uuid';
import { loadEnv } from '../../../../common/config/env';
import type { OAuthProviderClient } from '../../domain/oauth-provider.interface';

export class StartGoogleOAuthResponseDTO {
  @ApiProperty({ example: 'https://accounts.google.com/o/oauth2/v2/auth?...' })
  authorizationUrl!: string;
}

export type StartGoogleOAuthOutputDTO = StartGoogleOAuthResponseDTO;

export class StartGoogleOAuthUseCase {
  constructor(
    private readonly jwt: JwtService,
    private readonly googleOAuthClient: OAuthProviderClient,
  ) {}

  async execute(): Promise<StartGoogleOAuthOutputDTO> {
    const env = loadEnv();
    const state = await this.jwt.signAsync(
      { provider: 'google', nonce: uuidv7() },
      { secret: env.JWT_SECRET, expiresIn: parseInt(env.GOOGLE_OAUTH_STATE_TTL, 10) },
    );
    return {
      authorizationUrl: this.googleOAuthClient.buildAuthorizationUrl(state),
    };
  }
}
