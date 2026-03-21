import { z } from 'zod';
import { ApiProperty } from '@nestjs/swagger';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.interface';

export class LogoutRequestDTO {
  static schema = z.object({ refreshToken: z.string().min(1) });

  @ApiProperty({ example: 'b3b9b1e9e9c64f8892e4f1a0b0d2b8f7' })
  refreshToken!: string;
}

export const LogoutBodyDTO = LogoutRequestDTO.schema;
export type LogoutBodyInputDTO = z.infer<typeof LogoutBodyDTO>;

export const LogoutDTO = LogoutBodyDTO.extend({ userId: z.string().min(1) });
export type LogoutInputDTO = z.infer<typeof LogoutDTO>;

export class LogoutUseCase {
  constructor(private readonly tokens: RefreshTokenRepository) {}

  async execute(input: LogoutInputDTO): Promise<void> {
    await this.tokens.deleteByTokenAndUserId(input.refreshToken, input.userId);
  }
}
