import { z } from 'zod';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import {
  PasswordResetRepository,
  PasswordResetRecord,
} from '../../domain/password-reset.repository.interface';
import { UserRepository } from '../../../user/domain/user.repository.interface';
import { PasswordHasher } from '../../domain/password-hasher.interface';
import { UserEntity, USER_CONSTANTS } from '../../../user/domain/user.entity';

export const ConfirmPasswordResetDTO = z.object({
  token: z.string().min(1),
  newPassword: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
});
export type ConfirmPasswordResetInputDTO = z.infer<typeof ConfirmPasswordResetDTO>;

export type ConfirmPasswordResetOutputDTO = {
  uuid: string;
  name: string;
  email: string;
  createdAt: Date;
  updatedAt: Date;
  isActive: boolean;
  role: string;
  credits: number;
};

export class ConfirmPasswordResetUseCase {
  constructor(
    private readonly resets: PasswordResetRepository,
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: ConfirmPasswordResetInputDTO): Promise<ConfirmPasswordResetOutputDTO> {
    const { token, newPassword } = ConfirmPasswordResetDTO.parse(input);
    const record = await this.getValidResetRecord(token);
    const user = await this.getExistingUser(record.userId);
    const hash = await this.hasher.hash(newPassword);
    user.passwordHash = hash;
    user.updatedAt = new Date();
    await this.users.save(user);
    await this.resets.deleteByToken(token);
    return {
      uuid: user.uuid,
      name: user.name,
      email: user.email,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      isActive: user.isActive,
      role: user.role,
      credits: user.credits,
    };
  }

  private async getValidResetRecord(token: string): Promise<PasswordResetRecord> {
    const record = await this.resets.findByToken(token);
    if (!record) throw new BadRequestException('Invalid reset token');
    const expired = record.expiresAt.getTime() <= Date.now();
    if (expired) throw new BadRequestException('Reset token expired');
    return record;
  }

  private async getExistingUser(userId: string): Promise<UserEntity> {
    const user = await this.users.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
