import { z } from 'zod';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { BcryptPasswordHasher } from '../../infrastructure/password-hasher.bcrypt';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.interface';
import { loadEnv } from '../../../../common/config/env';
import { randomBytes } from 'crypto';
import { v7 as uuidv7 } from 'uuid';

export const LoginDTO = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export type LoginInputDTO = z.infer<typeof LoginDTO>;

export type AuthenticateUserOutputDTO = {
  accessToken: string;
  refreshToken: string;
};

export class AuthenticateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: BcryptPasswordHasher,
    private readonly tokens: RefreshTokenRepository,
    private readonly jwt: JwtService,
  ) {}

  async execute(input: LoginInputDTO): Promise<AuthenticateUserOutputDTO> {
    const { email, password } = LoginDTO.parse(input);
    const user = await this.users.findByEmail(email);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await this.hasher.compare(password, user.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const env = loadEnv();
    const accessToken = await this.jwt.signAsync(
      { sub: user.uuid, role: user.role },
      { expiresIn: parseInt(env.JWT_EXPIRES_IN, 10) },
    );
    const refreshToken = randomBytes(32).toString('hex');
    const now = new Date();
    const expires = new Date(now.getTime() + parseInt(env.REFRESH_TOKEN_TTL, 10) * 1000);
    await this.tokens.save({
      uuid: uuidv7(),
      token: refreshToken,
      userId: user.uuid,
      createdAt: now,
      expiresAt: expires,
    });
    return { accessToken, refreshToken };
  }
}
