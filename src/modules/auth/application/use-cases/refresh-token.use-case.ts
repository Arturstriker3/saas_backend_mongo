import { z } from 'zod';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.interface';
import type { UserRepository } from '../../../user/domain/user.repository.interface';
import { loadEnv } from '../../../../common/config/env';
import { randomBytes } from 'crypto';
import { v7 as uuidv7 } from 'uuid';
import { isInactiveUserBlocked } from '../../domain/user-access.policy';

export const RefreshDTO = z.object({ refreshToken: z.string().min(1) });
export type RefreshInputDTO = z.infer<typeof RefreshDTO>;

export type RefreshTokenOutputDTO = {
  accessToken: string;
  refreshToken: string;
};

export class RefreshTokenUseCase {
  constructor(
    private readonly tokens: RefreshTokenRepository,
    private readonly users: UserRepository,
    private readonly jwt: JwtService,
  ) {}

  async execute(input: RefreshInputDTO): Promise<RefreshTokenOutputDTO> {
    const record = await this.tokens.findByToken(input.refreshToken);
    if (!record) throw new UnauthorizedException('Refresh token not found');
    if (record.expiresAt.getTime() <= Date.now())
      throw new UnauthorizedException('Refresh token expired');
    const user = await this.users.findById(record.userId);
    if (!user) throw new UnauthorizedException('User not found');
    if (isInactiveUserBlocked(user)) throw new UnauthorizedException('User is deactivated');
    const env = loadEnv();
    const accessToken = await this.jwt.signAsync(
      { sub: user.uuid, role: user.role },
      { expiresIn: parseInt(env.JWT_EXPIRES_IN, 10) },
    );
    const newRefresh = randomBytes(32).toString('hex');
    const now = new Date();
    const expires = new Date(now.getTime() + parseInt(env.REFRESH_TOKEN_TTL, 10) * 1000);
    await this.tokens.deleteByToken(input.refreshToken);
    await this.tokens.save({
      uuid: uuidv7(),
      token: newRefresh,
      userId: user.uuid,
      createdAt: now,
      expiresAt: expires,
    });
    return { accessToken, refreshToken: newRefresh };
  }
}
