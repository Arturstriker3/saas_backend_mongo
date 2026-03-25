import { Module } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { loadEnv } from '../../common/config/env';
import { DatabaseModule } from '../../common/database/database.module';
import { MessagingModule } from '../../common/messaging/messaging.module';
import { EVENT_BUS } from '../../common/messaging/event-bus.interface';
import type { EventBus } from '../../common/messaging/event-bus.interface';
import { UserModule } from '../user/user.module';
import { RoleModule } from '../role/role.module';
import { UserRepository } from '../user/domain/user.repository.interface';
import { UserRepositoryMongo } from '../user/infrastructure/user.repository.mongo';
import { RefreshTokenRepository } from './domain/refresh-token.repository.interface';
import { PasswordHasher, PASSWORD_HASHER } from './domain/password-hasher.interface';
import { Argon2idPasswordHasher } from './infrastructure/password-hasher.argon2id';
import { AuthenticateUserUseCase } from './application/use-cases/authenticate-user.use-case';
import { RefreshTokenUseCase } from './application/use-cases/refresh-token.use-case';
import { LogoutUseCase } from './application/use-cases/logout.use-case';
import { AuthController } from './presentation/rest/auth.controller';
import { JwtStrategy } from './presentation/jwt.strategy';
import { PasswordResetRepository } from './domain/password-reset.repository.interface';
import { RequestPasswordResetUseCase } from './application/use-cases/request-password-reset.use-case';
import { ConfirmPasswordResetUseCase } from './application/use-cases/confirm-password-reset.use-case';
import { RegisterUserUseCase } from './application/use-cases/register-user.use-case';
import { GetMeUseCase } from './application/use-cases/get-me.use-case';
import { StartGoogleOAuthUseCase } from './application/use-cases/start-google-oauth.use-case';
import { CompleteGoogleOAuthUseCase } from './application/use-cases/complete-google-oauth.use-case';
import { MONGO_CONNECTION } from '../../common/database/mongo.connection';
import type { MongooseConnection } from '../../common/database/mongo.connection';
import {
  RefreshTokenRepositoryMongo,
  REFRESH_TOKEN_MODEL,
  makeRefreshTokenSchema,
} from './infrastructure/refresh-token.repository.mongo';
import {
  PasswordResetRepositoryMongo,
  PASSWORD_RESET_MODEL,
  makePasswordResetSchema,
} from './infrastructure/password-reset.repository.mongo';
import { OAUTH_GOOGLE_CLIENT, OAuthProviderClient } from './domain/oauth-provider.interface';
import { GoogleOAuthClient } from './infrastructure/google-oauth.client';

@Module({
  imports: [
    DatabaseModule,
    UserModule,
    RoleModule,
    MessagingModule,
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      useFactory: () => {
        const env = loadEnv();
        return { secret: env.JWT_SECRET };
      },
    }),
  ],
  providers: [
    Argon2idPasswordHasher,
    {
      provide: PASSWORD_HASHER,
      useExisting: Argon2idPasswordHasher,
    },
    {
      provide: REFRESH_TOKEN_MODEL,
      useFactory: (conn: MongooseConnection) =>
        conn.model('refresh_tokens', makeRefreshTokenSchema()),
      inject: [MONGO_CONNECTION],
    },
    {
      provide: PASSWORD_RESET_MODEL,
      useFactory: (conn: MongooseConnection) =>
        conn.model('password_resets', makePasswordResetSchema()),
      inject: [MONGO_CONNECTION],
    },
    RefreshTokenRepositoryMongo,
    PasswordResetRepositoryMongo,
    GoogleOAuthClient,
    {
      provide: OAUTH_GOOGLE_CLIENT,
      useExisting: GoogleOAuthClient,
    },
    {
      provide: AuthenticateUserUseCase,
      useFactory: (
        users: UserRepository,
        hasher: PasswordHasher,
        tokens: RefreshTokenRepository,
        jwt: JwtService,
      ) => new AuthenticateUserUseCase(users, hasher, tokens, jwt),
      inject: [UserRepositoryMongo, PASSWORD_HASHER, RefreshTokenRepositoryMongo, JwtService],
    },
    {
      provide: RefreshTokenUseCase,
      useFactory: (tokens: RefreshTokenRepository, users: UserRepository, jwt: JwtService) =>
        new RefreshTokenUseCase(tokens, users, jwt),
      inject: [RefreshTokenRepositoryMongo, UserRepositoryMongo, JwtService],
    },
    {
      provide: LogoutUseCase,
      useFactory: (tokens: RefreshTokenRepository) => new LogoutUseCase(tokens),
      inject: [RefreshTokenRepositoryMongo],
    },
    {
      provide: RequestPasswordResetUseCase,
      useFactory: (users: UserRepository, resets: PasswordResetRepository, events: any) =>
        new RequestPasswordResetUseCase(users, resets, events),
      inject: [UserRepositoryMongo, PasswordResetRepositoryMongo, EVENT_BUS],
    },
    {
      provide: ConfirmPasswordResetUseCase,
      useFactory: (
        resets: PasswordResetRepository,
        users: UserRepository,
        hasher: PasswordHasher,
      ) => new ConfirmPasswordResetUseCase(resets, users, hasher),
      inject: [PasswordResetRepositoryMongo, UserRepositoryMongo, PASSWORD_HASHER],
    },
    {
      provide: RegisterUserUseCase,
      useFactory: (users: UserRepository, hasher: PasswordHasher, events: any) =>
        new RegisterUserUseCase(users, hasher, events),
      inject: [UserRepositoryMongo, PASSWORD_HASHER, EVENT_BUS],
    },
    {
      provide: GetMeUseCase,
      useFactory: (users: UserRepository) => new GetMeUseCase(users),
      inject: [UserRepositoryMongo],
    },
    {
      provide: StartGoogleOAuthUseCase,
      useFactory: (jwt: JwtService, googleOAuthClient: OAuthProviderClient) =>
        new StartGoogleOAuthUseCase(jwt, googleOAuthClient),
      inject: [JwtService, OAUTH_GOOGLE_CLIENT],
    },
    {
      provide: CompleteGoogleOAuthUseCase,
      useFactory: (
        users: UserRepository,
        hasher: PasswordHasher,
        tokens: RefreshTokenRepository,
        jwt: JwtService,
        googleOAuthClient: OAuthProviderClient,
        events: EventBus,
      ) => new CompleteGoogleOAuthUseCase(users, hasher, tokens, jwt, googleOAuthClient, events),
      inject: [
        UserRepositoryMongo,
        PASSWORD_HASHER,
        RefreshTokenRepositoryMongo,
        JwtService,
        OAUTH_GOOGLE_CLIENT,
        EVENT_BUS,
      ],
    },
    JwtStrategy,
  ],
  controllers: [AuthController],
  exports: [JwtStrategy],
})
export class AuthModule {}
