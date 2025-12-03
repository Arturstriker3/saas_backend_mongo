import { z } from "zod";
import { RefreshTokenRepository } from "../../domain/auth.repository";

export const LogoutDTO = z.object({ refreshToken: z.string().min(1) });
export type LogoutInputDTO = z.infer<typeof LogoutDTO>;

export class LogoutUseCase {
  constructor(private readonly tokens: RefreshTokenRepository) {}

  async execute(input: LogoutInputDTO): Promise<boolean> {
    const { refreshToken } = LogoutDTO.parse(input);
    await this.tokens.deleteByToken(refreshToken);
    return true;
  }
}

