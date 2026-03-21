import { z } from 'zod';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { ApiProperty } from '@nestjs/swagger';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { PasswordHasher } from '../../domain/password-hasher.interface';
import { RefreshTokenRepository } from '../../domain/refresh-token.repository.interface';
import { loadEnv } from '../../../../common/config/env';
import { randomBytes } from 'crypto';
import { v7 as uuidv7 } from 'uuid';

export class LoginRequestDTO {
  static schema = z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });

  @ApiProperty({ example: 'john.doe@example.com' })
  email!: string;

  @ApiProperty({ example: 'password123' })
  password!: string;
}

export const LoginDTO = LoginRequestDTO.schema;

export type LoginInputDTO = z.infer<typeof LoginDTO>;

export class LoginResponseDTO {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' })
  accessToken!: string;

  @ApiProperty({ example: 'b3b9b1e9e9c64f8892e4f1a0b0d2b8f7' })
  refreshToken!: string;
}

export type AuthenticateUserOutputDTO = LoginResponseDTO;
export type LoginOutputDTO = LoginResponseDTO;

export class AuthenticateUserUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: RefreshTokenRepository,
    private readonly jwt: JwtService,
  ) {}

  async execute(input: LoginInputDTO): Promise<AuthenticateUserOutputDTO> {
    const user = await this.users.findByEmailWithPassword(input.email);
    if (!user || !user.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await this.hasher.compare(input.password, user.passwordHash);
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
