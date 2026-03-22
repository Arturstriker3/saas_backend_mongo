export type OAuthProviderProfile = {
  provider: 'google';
  providerUserId: string;
  email: string;
  emailVerified: boolean;
  name: string | null;
};

export interface OAuthProviderClient {
  buildAuthorizationUrl(state: string): string;
  getProfileFromAuthorizationCode(code: string): Promise<OAuthProviderProfile>;
}

export const OAUTH_GOOGLE_CLIENT = 'OAUTH_GOOGLE_CLIENT';
