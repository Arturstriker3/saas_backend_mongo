import { Module } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { loadEnv } from "../../common/config/env";
import { DatabaseModule } from "../../common/database/database.module";
import { UserModule } from "../user/user.module";
import { USER_REPOSITORY } from "../user/tokens";
import { UserRepository } from "../user/domain/user.repository";
import { RefreshTokenRepository } from "./domain/auth.repository";
import { BcryptPasswordHasher } from "./infrastructure/password-hasher.bcrypt";
import { AuthenticateUserUseCase } from "./application/use-cases/authenticate-user.use-case";
import { RefreshTokenUseCase } from "./application/use-cases/refresh-token.use-case";
import { LogoutUseCase } from "./application/use-cases/logout.use-case";
import { AuthController } from "./presentation/rest/auth.controller";
import { JwtStrategy } from "./presentation/jwt.strategy";
import { PasswordResetRepository } from "./domain/password-reset.repository";
import { RequestPasswordResetUseCase } from "./application/use-cases/request-password-reset.use-case";
import { ConfirmPasswordResetUseCase } from "./application/use-cases/confirm-password-reset.use-case";
import { resendClientProvider } from "../../common/email/resend.client";
import { EmailService } from "../../common/email/email.service";
import { MONGO_CONNECTION, MongooseConnection } from "../../common/database/mongo.connection";
import { RefreshTokenRepositoryMongo, REFRESH_TOKEN_MODEL, makeRefreshTokenSchema } from "./infrastructure/refresh-token.repository.mongo";
import { PasswordResetRepositoryMongo, PASSWORD_RESET_MODEL, makePasswordResetSchema } from "./infrastructure/password-reset.repository.mongo";

@Module({
  imports: [
    DatabaseModule,
    UserModule,
    PassportModule.register({ defaultStrategy: "jwt" }),
    JwtModule.registerAsync({
      useFactory: () => {
        const env = loadEnv();
        return { secret: env.JWT_SECRET };
      },
    }),
  ],
  providers: [
    resendClientProvider,
    EmailService,
    BcryptPasswordHasher,
    {
      provide: REFRESH_TOKEN_MODEL,
      useFactory: (conn: MongooseConnection) => conn.model("refresh_tokens", makeRefreshTokenSchema()),
      inject: [MONGO_CONNECTION],
    },
    {
      provide: PASSWORD_RESET_MODEL,
      useFactory: (conn: MongooseConnection) => conn.model("password_resets", makePasswordResetSchema()),
      inject: [MONGO_CONNECTION],
    },
    RefreshTokenRepositoryMongo,
    PasswordResetRepositoryMongo,
    {
      provide: AuthenticateUserUseCase,
      useFactory: (
        users: UserRepository,
        hasher: BcryptPasswordHasher,
        tokens: RefreshTokenRepository,
        jwt: JwtService
      ) => new AuthenticateUserUseCase(users, hasher, tokens, jwt),
      inject: [USER_REPOSITORY, BcryptPasswordHasher, RefreshTokenRepositoryMongo, JwtService],
    },
    {
      provide: RefreshTokenUseCase,
      useFactory: (
        tokens: RefreshTokenRepository,
        users: UserRepository,
        jwt: JwtService
      ) => new RefreshTokenUseCase(tokens, users, jwt),
      inject: [RefreshTokenRepositoryMongo, USER_REPOSITORY, JwtService],
    },
    {
      provide: LogoutUseCase,
      useFactory: (tokens: RefreshTokenRepository) => new LogoutUseCase(tokens),
      inject: [RefreshTokenRepositoryMongo],
    },
    {
      provide: RequestPasswordResetUseCase,
      useFactory: (
        users: UserRepository,
        resets: PasswordResetRepository,
        email: EmailService
      ) => new RequestPasswordResetUseCase(users, resets, email),
      inject: [USER_REPOSITORY, PasswordResetRepositoryMongo, EmailService],
    },
    {
      provide: ConfirmPasswordResetUseCase,
      useFactory: (
        resets: PasswordResetRepository,
        users: UserRepository,
        hasher: BcryptPasswordHasher
      ) => new ConfirmPasswordResetUseCase(resets, users, hasher),
      inject: [PasswordResetRepositoryMongo, USER_REPOSITORY, BcryptPasswordHasher],
    },
    JwtStrategy,
  ],
  controllers: [AuthController],
  exports: [JwtStrategy],
})
export class AuthModule {}

