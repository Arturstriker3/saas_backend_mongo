import { z } from "zod";
import { JwtService } from "@nestjs/jwt";
import { UserRepository } from "../../../user/domain/user.repository";
import { BcryptPasswordHasher } from "../../infrastructure/password-hasher.bcrypt";
import { RefreshTokenRepository } from "../../domain/auth.repository";
import { loadEnv } from "../../../../common/config/env";
import { randomBytes } from "crypto";

export const LoginDTO = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInputDTO = z.infer<typeof LoginDTO>;

export class AuthenticateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptPasswordHasher,
    private readonly tokens: RefreshTokenRepository,
    private readonly jwt: JwtService
  ) {}

  async execute(input: LoginInputDTO) {
    const { email, password } = LoginDTO.parse(input);
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) throw new Error("Invalid credentials");
    const ok = await this.hasher.compare(password, user.passwordHash);
    if (!ok) throw new Error("Invalid credentials");
    const env = loadEnv();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: parseInt(env.JWT_EXPIRES_IN, 10) }
    );
    const refreshToken = randomBytes(32).toString("hex");
    const now = new Date();
    const expires = new Date(
      now.getTime() + parseInt(env.REFRESH_TOKEN_TTL, 10) * 1000
    );
    await this.tokens.save({
      token: refreshToken,
      userId: user.id,
      createdAt: now,
      expiresAt: expires,
    });
    return { accessToken, refreshToken, user };
  }
}
