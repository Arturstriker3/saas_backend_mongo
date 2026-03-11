import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository.interface';
import { PasswordHasher } from '../../../auth/domain/password-hasher.interface';
import { USER_CONSTANTS } from '../../domain/user.entity';

export const ChangeUserPasswordParamDTO = z.object({
  uuid: z.string().min(1),
});
export const ChangeUserPasswordBodyDTO = z.object({
  newPassword: z.string().min(USER_CONSTANTS.PASSWORD_MIN_LENGTH),
});
export const ChangeUserPasswordDTO = ChangeUserPasswordParamDTO.merge(ChangeUserPasswordBodyDTO);
export type ChangeUserPasswordParamInputDTO = z.infer<typeof ChangeUserPasswordParamDTO>;
export type ChangeUserPasswordBodyInputDTO = z.infer<typeof ChangeUserPasswordBodyDTO>;
export type ChangeUserPasswordInputDTO = z.infer<typeof ChangeUserPasswordDTO>;

export class ChangeUserPasswordUseCase {
  private readonly repo: UserRepository;
  private readonly hasher: PasswordHasher;

  constructor(repo: UserRepository, hasher: PasswordHasher) {
    this.repo = repo;
    this.hasher = hasher;
  }

  async execute(input: ChangeUserPasswordInputDTO) {
    const user = await this.repo.findById(input.uuid);
    if (!user) throw new Error('User not found');
    const hash = await this.hasher.hash(input.newPassword);
    const updatedAt = new Date();
    await this.repo.updatePasswordById(input.uuid, hash, updatedAt);
    return { ...user, updatedAt };
  }
}
