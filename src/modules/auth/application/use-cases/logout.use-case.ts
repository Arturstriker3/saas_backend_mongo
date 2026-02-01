import { z } from 'zod';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.interface';

export const LogoutBodyDTO = z.object({ refreshToken: z.string().min(1) });
export type LogoutBodyInputDTO = z.infer<typeof LogoutBodyDTO>;

export const LogoutDTO = LogoutBodyDTO.extend({ userId: z.string().min(1) });
export type LogoutInputDTO = z.infer<typeof LogoutDTO>;

export class LogoutUseCase {
  constructor(private readonly tokens: RefreshTokenRepository) {}

  async execute(input: LogoutInputDTO): Promise<void> {
    const { refreshToken, userId } = LogoutDTO.parse(input);
    await this.tokens.deleteByTokenAndUserId(refreshToken, userId);
  }
}
