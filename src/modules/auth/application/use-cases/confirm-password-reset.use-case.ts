import { z } from 'zod';
import {
  PasswordResetRepository,
  PasswordResetRecord,
} from '../../domain/password-reset.repository';
import { UserRepository } from '../../../user/domain/user.repository';
import { BcryptPasswordHasher } from '../../infrastructure/password-hasher.bcrypt';
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
    private readonly hasher: BcryptPasswordHasher,
  ) {}

  async execute(input: ConfirmPasswordResetInputDTO): Promise<UserEntity> {
    const { token, newPassword } = ConfirmPasswordResetDTO.parse(input);
    const record = await this.getValidResetRecord(token);
    const user = await this.getExistingUser(record.userId);
    const hash = await this.hasher.hash(newPassword);
    user.changePassword(hash);
    await this.users.save(user);
    await this.resets.deleteByToken(token);
    return user;
  }

  private async getValidResetRecord(token: string): Promise<PasswordResetRecord> {
    const record = await this.resets.findByToken(token);
    if (!record) throw new Error('Invalid reset token');
    const expired = record.expiresAt.getTime() <= Date.now();
    if (expired) throw new Error('Reset token expired');
    return record;
  }

  private async getExistingUser(userId: string): Promise<UserEntity> {
    const user = await this.users.findById(userId);
    if (!user) throw new Error('User not found');
    return user;
  }
}
