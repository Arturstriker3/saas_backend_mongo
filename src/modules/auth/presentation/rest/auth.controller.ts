import { Controller, Post, Body } from "@nestjs/common";
import { Inject } from "@nestjs/common";
import { LoginBody, RefreshTokenBody, RequestPasswordResetBody, ConfirmPasswordResetBody } from "./auth.dto";
import { AuthenticateUserUseCase } from "../../application/use-cases/authenticate-user.use-case";
import { RefreshTokenUseCase } from "../../application/use-cases/refresh-token.use-case";
import { LogoutUseCase } from "../../application/use-cases/logout.use-case";
import { RequestPasswordResetUseCase } from "../../application/use-cases/request-password-reset.use-case";
import { ConfirmPasswordResetUseCase } from "../../application/use-cases/confirm-password-reset.use-case";
import { UserEntity } from "../../../user/domain/user.entity";

@Controller("auth")
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
    private readonly confirmResetUseCase: ConfirmPasswordResetUseCase
  ) {}

  @Post("login")
  async login(@Body() body: LoginBody) {
    const { accessToken, refreshToken, user } = await this.authUseCase.execute(body);
    return { accessToken, refreshToken, user: this.toJSON(user) };
  }

  @Post("refresh-token")
  async refreshToken(@Body() body: RefreshTokenBody) {
    const { accessToken, refreshToken, user } = await this.refreshUseCase.execute(body);
    return { accessToken, refreshToken, user: this.toJSON(user) };
  }

  @Post("logout")
  async logout(@Body() body: RefreshTokenBody) {
    return this.logoutUseCase.execute(body);
  }

  @Post("request-password-reset")
  async requestPasswordReset(@Body() body: RequestPasswordResetBody) {
    return this.requestResetUseCase.execute(body);
  }

  @Post("confirm-password-reset")
  async confirmPasswordReset(@Body() body: ConfirmPasswordResetBody) {
    const user = await this.confirmResetUseCase.execute(body);
    return this.toJSON(user);
  }

  private toJSON(user: UserEntity) {
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      birthDate: user.birthDate,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isActive: user.isActive,
      role: user.role,
      credits: user.credits,
    };
  }
}
