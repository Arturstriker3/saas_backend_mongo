import { BadRequestException, UnauthorizedException } from '@nestjs/common';
import { z } from 'zod';
import { loadEnv } from '../../../common/config/env';
import { OAuthProviderClient, OAuthProviderProfile } from '../domain/oauth-provider.interface';

const GoogleTokenResponseDTO = z.object({
  access_token: z.string().min(1),
  token_type: z.string().min(1),
});

const GoogleProfileResponseDTO = z.object({
  sub: z.string().min(1),
  email: z.string().email(),
  email_verified: z.boolean(),
  name: z.string().optional(),
});

export class GoogleOAuthClient implements OAuthProviderClient {
  buildAuthorizationUrl(state: string): string {
    const env = loadEnv();
    const params = new URLSearchParams({
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      prompt: 'select_account',
      access_type: 'offline',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async getProfileFromAuthorizationCode(code: string): Promise<OAuthProviderProfile> {
    const env = loadEnv();
    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
      throw new UnauthorizedException('Google OAuth is not configured');
    }

    const tokenBody = new URLSearchParams({
      code,
      client_id: env.GOOGLE_OAUTH_CLIENT_ID,
      client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
      redirect_uri: env.GOOGLE_OAUTH_REDIRECT_URI,
      grant_type: 'authorization_code',
    });

    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenBody,
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('Could not exchange Google authorization code');
    }

    const tokenJson = await tokenResponse.json();
    const tokenData = GoogleTokenResponseDTO.parse(tokenJson);

    const profileResponse = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${tokenData.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new UnauthorizedException('Could not fetch Google user profile');
    }

    const profileJson = await profileResponse.json();
    const profileData = GoogleProfileResponseDTO.parse(profileJson);

    if (!profileData.email_verified) {
      throw new BadRequestException('Google account email is not verified');
    }

    return {
      provider: 'google',
      providerUserId: profileData.sub,
      email: profileData.email.toLowerCase(),
      emailVerified: profileData.email_verified,
      name: profileData.name ?? null,
    };
  }
}
