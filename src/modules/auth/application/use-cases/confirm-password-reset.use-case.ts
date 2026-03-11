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

export class ConfirmPasswordResetUseCase {
  constructor(
    private readonly resets: PasswordResetRepository,
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
  ) {}

  async execute(input: ConfirmPasswordResetInputDTO): Promise<void> {
    const record = await this.getValidResetRecord(input.token);
    const user = await this.getExistingUser(record.userId);
    const hash = await this.hasher.hash(input.newPassword);
    const updatedAt = new Date();
    await this.users.updatePasswordById(user.uuid, hash, updatedAt);
    await this.resets.deleteByToken(input.token);
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
