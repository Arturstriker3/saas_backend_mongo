import { z } from "zod";
import { JwtService } from "@nestjs/jwt";
import { RefreshTokenRepository } from "../../domain/auth.repository";
import { UserRepository } from "../../../user/domain/user.repository";
import { loadEnv } from "../../../../common/config/env";
import { randomBytes } from "crypto";

export const RefreshDTO = z.object({ refreshToken: z.string().min(1) });
export type RefreshInputDTO = z.infer<typeof RefreshDTO>;

export class RefreshTokenUseCase {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly jwt: JwtService
  ) {}

  async execute(input: RefreshInputDTO) {
    const { refreshToken } = RefreshDTO.parse(input);
    const record = await this.tokens.findByToken(refreshToken);
    if (!record) throw new Error("Invalid refresh token");
    if (record.expiresAt.getTime() <= Date.now())
      throw new Error("Refresh token expired");
    const user = await this.users.findById(record.userId);
    if (!user) throw new Error("User not found");
    const env = loadEnv();
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, role: user.role },
      { expiresIn: parseInt(env.JWT_EXPIRES_IN, 10) }
    );
    const newRefresh = randomBytes(32).toString("hex");
    const now = new Date();
    const expires = new Date(
      now.getTime() + parseInt(env.REFRESH_TOKEN_TTL, 10) * 1000
    );
    await this.tokens.deleteByToken(refreshToken);
    await this.tokens.save({
      token: newRefresh,
      userId: user.id,
      createdAt: now,
      expiresAt: expires,
    });
    return { accessToken, refreshToken: newRefresh, user };
  }
}
