import { z } from 'zod';
import { UserRepository } from '../../domain/user.repository';

export const ChangeUserPasswordDTO = z.object({
  id: z.string().min(1),
  newPasswordHash: z.string().min(10),
});
export type ChangeUserPasswordInputDTO = z.infer<typeof ChangeUserPasswordDTO>;

export class ChangeUserPasswordUseCase {
  private readonly repo: UserRepository;

  constructor(repo: UserRepository) {
    this.repo = repo;
  }

  async execute(input: ChangeUserPasswordInputDTO) {
    const { id, newPasswordHash } = ChangeUserPasswordDTO.parse(input);
    const user = await this.repo.findById(id);
    if (!user) throw new Error('User not found');
    user.changePassword(newPasswordHash);
    await this.repo.save(user);
    return user;
  }
}
